import { activeCaseSnapshotSchema, localCaseRegistrySchema, ACTIVE_CASE_STORAGE_KEY, SNAPSHOT_SOFT_UTF16_BUDGET, type ActiveCaseSnapshot, type LocalCaseRegistry } from "../../lib/contracts/session";
export type StorageWarning = NonNullable<ActiveCaseSnapshot["storageWarning"]>;
export type WriteResult = { status: "saved" } | { status: "failed"; warning: StorageWarning; notice: string };
export type RestoreResult = { status: "restored"; snapshot: ActiveCaseSnapshot } | { status: "missing" | "unreadable" } | { status: "unavailable"; warning: StorageWarning; notice: string };
export type DiscardResult = { status: "removed" | "preserved" } | { status: "changed"; notice: string } | Extract<WriteResult, { status: "failed" }>;
export type CheckpointKind = "draft" | "stream" | "immediate";
export type SessionStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export const STORAGE_NOTICES: Readonly<Record<StorageWarning, string>> = {
  unavailable: "Nie można zapisać sprawy w tej przeglądarce.",
  "quota-exceeded": "W przeglądarce zabrakło miejsca na zapis sprawy.",
  "snapshot-too-large": "Sprawa jest zbyt duża, aby zapisać ją w przeglądarce.",
};
export const STORAGE_RECOVERY_NOTICE = "Bieżąca sprawa pozostaje dostępna, dopóki ta strona jest otwarta. Po odświeżeniu odzyskanie sprawy może być niemożliwe lub przywrócone dane mogą pochodzić z ostatniego zapisu i nie zawierać ostatnich zmian.";

/** One storage owner. No network requests, replay, partial recovery or automatic deletion. */
export function createSessionAdapter(options: { storage: () => SessionStorage; onWriteResult?: (result: WriteResult) => void }) {
  let warning: StorageWarning | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let queued: ActiveCaseSnapshot | null = null;
  let queuedKind: Exclude<CheckpointKind, "immediate"> | null = null;
  let registry: LocalCaseRegistry | null = null;
  let loaded = false;
  let unreadable = false;
  let originalRaw: string | null | undefined;

  function load(): RestoreResult | null {
    if (loaded) return unreadable ? { status: "unreadable" } : null;
    let json: string | null;
    try { json = options.storage().getItem(ACTIVE_CASE_STORAGE_KEY); }
    catch (error) { const failure = fail(ioWarning(error)); return { ...failure, status: "unavailable" }; }
    loaded = true;
    originalRaw = json;
    if (json === null) return null;
    try {
      const data: unknown = JSON.parse(json);
      const current = localCaseRegistrySchema.safeParse(data);
      if (current.success) registry = current.data;
      else {
        const legacy = activeCaseSnapshotSchema.safeParse(data);
        if (legacy.success) registry = { schemaVersion: 2, activeCaseId: legacy.data.caseId, cases: { [legacy.data.caseId]: legacy.data } };
        else unreadable = true;
      }
    } catch { unreadable = true; }
    return unreadable ? { status: "unreadable" } : null;
  }

  function fail(code: StorageWarning): Extract<WriteResult, { status: "failed" }> {
    warning = code;
    return { status: "failed", warning: code, notice: `${STORAGE_NOTICES[code]} ${STORAGE_RECOVERY_NOTICE}` };
  }
  function ioWarning(error: unknown): StorageWarning {
    return typeof error === "object" && error !== null && "name" in error && error.name === "QuotaExceededError" ? "quota-exceeded" : "unavailable";
  }
  function cancel() {
    if (timer !== null) clearTimeout(timer);
    timer = null; queued = null; queuedKind = null;
  }
  function write(snapshot: ActiveCaseSnapshot, previous?: ActiveCaseSnapshot): WriteResult {
    let result: WriteResult;
    try {
      const validated = activeCaseSnapshotSchema.safeParse(snapshot);
      const existing = load();
      const previousValidated = previous ? activeCaseSnapshotSchema.safeParse(previous) : null;
      if (!validated.success || existing || (previousValidated && !previousValidated.success)) result = fail("unavailable");
      else {
        // A successful new checkpoint recovers persistence. Never mutate caller state.
        const next: LocalCaseRegistry = { schemaVersion: 2, activeCaseId: validated.data.caseId, cases: {
          ...registry?.cases,
          ...(previousValidated?.success ? { [previousValidated.data.caseId]: { ...previousValidated.data, storageWarning: null } } : {}),
          [validated.data.caseId]: { ...validated.data, storageWarning: null },
        } };
        const checked = localCaseRegistrySchema.safeParse(next);
        if (!checked.success) throw new Error("Invalid local registry");
        const json = JSON.stringify(checked.data);
        if (json.length * 2 > SNAPSHOT_SOFT_UTF16_BUDGET) result = fail("snapshot-too-large");
        else {
          options.storage().setItem(ACTIVE_CASE_STORAGE_KEY, json);
          registry = checked.data;
          warning = null;
          result = { status: "saved" };
        }
      }
    } catch (error) { result = fail(ioWarning(error)); }
    options.onWriteResult?.(result);
    return result;
  }
  function flush(): WriteResult | null {
    const snapshot = queued;
    cancel();
    return snapshot === null ? null : write(snapshot);
  }
  return {
    restore(caseId?: string): RestoreResult {
      const failure = load();
      if (failure) return failure;
      const snapshot = registry?.cases[caseId ?? registry.activeCaseId];
      if (!snapshot) return { status: "missing" };
        warning ??= snapshot.storageWarning;
        return {
          status: "restored",
          snapshot: {
            ...snapshot,
            stageStatus: snapshot.stageStatus === "pending" ? "interrupted" : snapshot.stageStatus,
            replyStates: Object.fromEntries(Object.entries(snapshot.replyStates).map(([id, state]) => [id, state === "streaming" ? "interrupted" : state])),
          },
        };
    },
    save(snapshot: ActiveCaseSnapshot): WriteResult { cancel(); return write(snapshot); },
    startNewCase(previous: ActiveCaseSnapshot, next: ActiveCaseSnapshot): WriteResult { cancel(); return write(next, previous); },
    checkpoint(snapshot: ActiveCaseSnapshot, kind: CheckpointKind): void {
      if (kind === "immediate") { cancel(); write(snapshot); return; }
      // Drafts debounce; streams use a fixed trailing window that cannot be postponed by tokens.
      if (kind === "draft" || queuedKind !== kind) cancel();
      queued = snapshot; queuedKind = kind;
      if (timer === null) timer = setTimeout(flush, kind === "draft" ? 300 : 500);
    },
    flush,
    getWarning: (): StorageWarning | null => warning,
    discard(recovery?: { recovery: true; isSupported: (snapshot: ActiveCaseSnapshot) => boolean; replacement?: ActiveCaseSnapshot }): DiscardResult {
      try {
        if (recovery) {
          const fresh = options.storage().getItem(ACTIVE_CASE_STORAGE_KEY);
          const changed = () => ({ status: "changed" as const, notice: "Zapis zmienił się lub zawiera sprawę, którą można odczytać. Nie usunięto danych. Odśwież stronę, aby sprawdzić aktualny zapis." });
          if (originalRaw === undefined || fresh === null || fresh !== originalRaw) return changed();
          let data: unknown;
          try { data = JSON.parse(fresh); } catch { /* Unchanged malformed JSON is explicitly removable. */ }
          const current = localCaseRegistrySchema.safeParse(data);
          const legacy = activeCaseSnapshotSchema.safeParse(data);
          if (current.success || legacy.success) {
            const readable = current.success ? current.data : legacy.success ? { schemaVersion: 2 as const, activeCaseId: legacy.data.caseId, cases: { [legacy.data.caseId]: legacy.data } } : null;
            if (!readable || recovery.isSupported(readable.cases[readable.activeCaseId]) || !recovery.replacement || readable.cases[recovery.replacement.caseId]) return changed();
            const next = activeCaseSnapshotSchema.safeParse(recovery.replacement);
            if (!next.success || next.data.stage !== "form" || next.data.messages.length || next.data.submittedForm || next.data.preparedImage || next.data.imageAnalysis || next.data.initialDecision || next.data.pendingOperation) return changed();
            cancel();
            registry = readable;
            const saved = write(next.data);
            return saved.status === "saved" ? { status: "preserved" } : { ...saved, notice: `${STORAGE_NOTICES[saved.warning]} Zachowano zapis. Nie rozpoczęto nowej sprawy. Spróbuj ponownie.` };
          }
        }
        options.storage().removeItem(ACTIVE_CASE_STORAGE_KEY);
        cancel(); warning = null; registry = null; loaded = true; unreadable = false; originalRaw = null;
        return { status: "removed" };
      } catch (error) {
        const failure = fail(ioWarning(error));
        return recovery ? { ...failure, notice: "Nie można wyczyścić zapisu w tej przeglądarce. Nie rozpoczęto nowej sprawy. Spróbuj ponownie lub odśwież stronę." } : failure;
      }
    },
    dispose: cancel,
  };
}
