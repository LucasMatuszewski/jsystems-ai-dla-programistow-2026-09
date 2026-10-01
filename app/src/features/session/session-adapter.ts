import { activeCaseSnapshotSchema, ACTIVE_CASE_STORAGE_KEY, SNAPSHOT_SOFT_UTF16_BUDGET, type ActiveCaseSnapshot } from "../../lib/contracts/session";
export type StorageWarning = NonNullable<ActiveCaseSnapshot["storageWarning"]>;
export type WriteResult = { status: "saved" } | { status: "failed"; warning: StorageWarning; notice: string };
export type RestoreResult = { status: "restored"; snapshot: ActiveCaseSnapshot } | { status: "missing" | "unreadable" } | { status: "unavailable"; warning: StorageWarning; notice: string };
export type DiscardResult = { status: "removed" } | Extract<WriteResult, { status: "failed" }>;
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
  function write(snapshot: ActiveCaseSnapshot): WriteResult {
    let result: WriteResult;
    try {
      const validated = activeCaseSnapshotSchema.safeParse(snapshot);
      if (!validated.success) result = fail("unavailable");
      else {
        // A successful new checkpoint recovers persistence. Never mutate caller state.
        const json = JSON.stringify({ ...validated.data, storageWarning: null });
        if (json.length * 2 > SNAPSHOT_SOFT_UTF16_BUDGET) result = fail("snapshot-too-large");
        else {
          options.storage().setItem(ACTIVE_CASE_STORAGE_KEY, json);
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
    restore(): RestoreResult {
      let json: string | null;
      try { json = options.storage().getItem(ACTIVE_CASE_STORAGE_KEY); }
      catch (error) { const failure = fail(ioWarning(error)); return { ...failure, status: "unavailable" }; }
      if (json === null) return { status: "missing" };
      try {
        const validated = activeCaseSnapshotSchema.safeParse(JSON.parse(json));
        if (!validated.success) return { status: "unreadable" };
        const snapshot = validated.data;
        warning ??= snapshot.storageWarning;
        return {
          status: "restored",
          snapshot: {
            ...snapshot,
            stageStatus: snapshot.stageStatus === "pending" ? "interrupted" : snapshot.stageStatus,
            replyStates: Object.fromEntries(Object.entries(snapshot.replyStates).map(([id, state]) => [id, state === "streaming" ? "interrupted" : state])),
          },
        };
      } catch { return { status: "unreadable" }; }
    },
    save(snapshot: ActiveCaseSnapshot): WriteResult { cancel(); return write(snapshot); },
    checkpoint(snapshot: ActiveCaseSnapshot, kind: CheckpointKind): void {
      if (kind === "immediate") { cancel(); write(snapshot); return; }
      // Drafts debounce; streams use a fixed trailing window that cannot be postponed by tokens.
      if (kind === "draft" || queuedKind !== kind) cancel();
      queued = snapshot; queuedKind = kind;
      if (timer === null) timer = setTimeout(flush, kind === "draft" ? 300 : 500);
    },
    flush,
    getWarning: (): StorageWarning | null => warning,
    discard(): DiscardResult {
      try {
        options.storage().removeItem(ACTIVE_CASE_STORAGE_KEY);
        cancel(); warning = null;
        return { status: "removed" };
      } catch (error) { return fail(ioWarning(error)); }
    },
    dispose: cancel,
  };
}
