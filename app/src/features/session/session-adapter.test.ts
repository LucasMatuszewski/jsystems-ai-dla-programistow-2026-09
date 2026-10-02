import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import type { ActiveCaseSnapshot } from "../../lib/contracts/session";
import { createSessionAdapter } from "./session-adapter";

const { safeParse } = vi.hoisted(() => ({ safeParse: vi.fn() }));
vi.mock("../../lib/contracts/session", () => ({
  ACTIVE_CASE_STORAGE_KEY: "hardware-service-copilot.active-case",
  SNAPSHOT_SOFT_UTF16_BUDGET: 4000000,
  activeCaseSnapshotSchema: { safeParse },
  localCaseRegistrySchema: { safeParse: (data: { schemaVersion?: number; cases?: Record<string, ActiveCaseSnapshot>; activeCaseId?: string }) => data?.schemaVersion === 2 && data.cases && data.activeCaseId && data.cases[data.activeCaseId] ? { success: true, data: structuredClone(data) } : { success: false } },
}));
const key = "hardware-service-copilot.active-case";
function snapshot(revision = 0): ActiveCaseSnapshot {
  return {
    schemaVersion: 1, caseId: "b269a28d-e305-41a0-8bab-7098c344bb36", revision,
    screen: "form", stage: "form", stageStatus: "idle", timeZone: "Europe/Warsaw",
    draftForm: { scenario: "", category: "", equipmentName: "", purchaseDate: "invalid", deliveryDate: null, buyerStatus: "", sellerStatus: "", reason: "", requestedRemedy: null },
    submittedForm: null, preparedImage: null, imageAnalysis: null, initialDecision: null,
    messages: [], replyStates: {}, pendingOperation: null, storageWarning: null,
  };
}
function harness() {
  let blob: string | null = null;
  const storage = { getItem: vi.fn((_key: string) => { void _key; return blob; }), setItem: vi.fn((_key: string, value: string) => { blob = value; }), removeItem: vi.fn((_key: string) => { void _key; blob = null; }) };
  const onWriteResult = vi.fn();
  return { storage, onWriteResult, adapter: createSessionAdapter({ storage: () => storage, onWriteResult }), blob: () => blob };
}
beforeEach(() => { vi.useFakeTimers(); safeParse.mockImplementation(data => data && data.schemaVersion === 1 ? ({ success: true, data: structuredClone(data) }) : ({ success: false })); });
afterEach(() => vi.useRealTimers());

describe("validated active case checkpoints", () => {
  it("atomically saves the latest old draft and a new case, cancelling queued writes from the old owner", () => {
    const h = harness(); const previous = snapshot(); h.adapter.save(previous);
    const latest = { ...snapshot(1), draftForm: { ...previous.draftForm, reason: "Najnowszy zachowany opis." } };
    h.adapter.checkpoint(latest, "draft");
    const fresh = { ...snapshot(), caseId: "7b40b034-5e7b-49dc-bb47-e8d8d2d5fc76" };
    expect(h.adapter.startNewCase(latest, fresh)).toEqual({ status: "saved" });
    expect(JSON.parse(h.blob()!)).toMatchObject({ activeCaseId: fresh.caseId, cases: { [previous.caseId]: latest, [fresh.caseId]: fresh } });
    vi.runAllTimers(); expect(h.storage.setItem).toHaveBeenCalledTimes(2);
  });
  it("preserves the last saved registry when archival fails and does not replay queued old draft writes", () => {
    const h = harness(); const previous = snapshot(); h.adapter.save(previous); const saved = h.blob();
    const latest = snapshot(1); h.adapter.checkpoint(latest, "draft");
    h.storage.setItem.mockImplementationOnce(() => { throw new DOMException("full", "QuotaExceededError"); });
    const fresh = { ...snapshot(), caseId: "7b40b034-5e7b-49dc-bb47-e8d8d2d5fc76" };
    expect(h.adapter.startNewCase(latest, fresh)).toMatchObject({ status: "failed", warning: "quota-exceeded" });
    vi.runAllTimers(); expect(h.blob()).toBe(saved); expect(previous).toEqual(snapshot());
    expect(h.adapter.restore()).toMatchObject({ status: "restored", snapshot: previous });
  });
  it("applies the complete registry budget without evicting an older individually valid case", () => {
    const h = harness(); const previous = snapshot(); previous.draftForm.reason = "a".repeat(1100000);
    expect(h.adapter.save(previous)).toEqual({ status: "saved" }); const saved = h.blob();
    const next = { ...snapshot(), caseId: "7b40b034-5e7b-49dc-bb47-e8d8d2d5fc76" }; next.draftForm.reason = "b".repeat(1100000);
    expect(h.adapter.save(next)).toMatchObject({ status: "failed", warning: "snapshot-too-large" });
    expect(h.blob()).toBe(saved); expect(h.storage.setItem).toHaveBeenCalledTimes(1);
    expect(next.draftForm.reason).toHaveLength(1100000);
  });
  it("preserves unreadable registry bytes when an explicit save is attempted", () => {
    const h = harness(); h.storage.getItem.mockReturnValue("{");
    expect(h.adapter.restore()).toEqual({ status: "unreadable" });
    expect(h.adapter.save(snapshot())).toMatchObject({ status: "failed" });
    expect(h.storage.setItem).not.toHaveBeenCalled(); expect(h.storage.removeItem).not.toHaveBeenCalled();
  });
  it("keeps earlier local cases when saving a new UUID under the same atomic product key", () => {
    const h = harness(); const first = snapshot();
    const second = { ...snapshot(), caseId: "7b40b034-5e7b-49dc-bb47-e8d8d2d5fc76" };
    h.adapter.save(first); h.adapter.save(second);
    const registry = JSON.parse(h.blob()!);
    expect(registry).toMatchObject({ schemaVersion: 2, activeCaseId: second.caseId });
    expect(registry.cases[first.caseId]).toEqual(first);
    expect(registry.cases[second.caseId]).toEqual(second);
    expect(h.storage.setItem).toHaveBeenCalledTimes(2);
    expect(h.storage.setItem.mock.calls.every(([storedKey]) => storedKey === key)).toBe(true);
  });
  it("restores only the requested UUID and never falls back to another active local case", () => {
    const h = harness(); const active = snapshot();
    h.storage.getItem.mockReturnValue(JSON.stringify(active));
    const requested = "7b40b034-5e7b-49dc-bb47-e8d8d2d5fc76";
    expect(Reflect.apply(h.adapter.restore, h.adapter, [requested])).toEqual({ status: "missing" });
    expect(h.storage.setItem).not.toHaveBeenCalled();
    expect(h.storage.removeItem).not.toHaveBeenCalled();
  });
  it("migrates a legacy case on the first explicit save while retaining its complete stored facts", () => {
    const h = harness(); const legacy = snapshot();
    h.storage.getItem.mockReturnValue(JSON.stringify(legacy));
    expect(h.adapter.restore()).toEqual({ status: "restored", snapshot: legacy });
    expect(h.storage.setItem).not.toHaveBeenCalled();
    const next = { ...snapshot(), caseId: "7b40b034-5e7b-49dc-bb47-e8d8d2d5fc76" };
    h.adapter.save(next);
    expect(JSON.parse(h.blob()!)).toMatchObject({ cases: { [legacy.caseId]: legacy } });
  });
  it("distinguishes missing, corrupt JSON and unknown schema without deleting data", () => {
    const h = harness();
    expect(h.adapter.restore()).toEqual({ status: "missing" });
    h.storage.getItem.mockReturnValue("{");
    expect(createSessionAdapter({ storage: () => h.storage }).restore()).toEqual({ status: "unreadable" });
    h.storage.getItem.mockReturnValue('{"schemaVersion":2}');
    safeParse.mockReturnValue({ success: false });
    expect(createSessionAdapter({ storage: () => h.storage }).restore()).toEqual({ status: "unreadable" });
    expect(h.storage.removeItem).not.toHaveBeenCalled();
  });
  it("restores a complete checkpoint without changing it or scheduling work", () => {
    const h = harness(); const data = snapshot();
    h.storage.getItem.mockReturnValue(JSON.stringify(data));
    expect(h.adapter.restore()).toEqual({ status: "restored", snapshot: data });
    vi.runAllTimers(); expect(h.storage.setItem).not.toHaveBeenCalled();
  });
  it("retains partial text and identities while marking pending chat interrupted", () => {
    const h = harness(); const data = snapshot();
    data.stage = "chat"; data.stageStatus = "pending";
    data.pendingOperation = { kind: "chat", operationId: data.caseId, startedAt: "2026-10-01T10:00:00Z", userMessageId: "sdk-user", replyMessageId: "sdk-reply" };
    data.messages = [{ id: "sdk-user", role: "user", parts: [{ type: "text", text: "Pytanie" }] }, { id: "sdk-reply", role: "assistant", parts: [{ type: "text", text: "Fragment", state: "streaming" }] }];
    data.replyStates = { "sdk-reply": "streaming" };
    h.storage.getItem.mockReturnValue(JSON.stringify(data));
    const result = h.adapter.restore();
    expect(result.status).toBe("restored");
    if (result.status !== "restored") throw new Error("Expected restored");
    expect(result.snapshot.stageStatus).toBe("interrupted");
    expect(result.snapshot.replyStates["sdk-reply"]).toBe("interrupted");
    expect(result.snapshot.messages).toEqual(data.messages);
    expect(result.snapshot.pendingOperation).toEqual(data.pendingOperation);
    expect(h.storage.setItem).not.toHaveBeenCalled();
  });
  it("uses one atomic write, validates before it, and preserves the caller's live state", () => {
    const h = harness(); const data = snapshot();
    expect(h.adapter.save(data)).toEqual({ status: "saved" });
    expect(h.storage.setItem).toHaveBeenCalledWith(key, JSON.stringify({ schemaVersion: 2, activeCaseId: data.caseId, cases: { [data.caseId]: data } }));
    const previous = h.blob(); safeParse.mockReturnValue({ success: false });
    expect(h.adapter.save(snapshot(1))).toMatchObject({ status: "failed", warning: "unavailable" });
    expect(h.blob()).toBe(previous); expect(data).toEqual(snapshot());
  });
  it("keeps the previous blob on quota failure and clears a persistent warning only after successful save", () => {
    const h = harness(); h.adapter.save(snapshot()); const previous = h.blob();
    h.storage.setItem.mockImplementationOnce(() => { throw new DOMException("full", "QuotaExceededError"); });
    const data = snapshot(1);
    expect(h.adapter.save(data)).toMatchObject({ status: "failed", warning: "quota-exceeded" });
    expect(h.adapter.getWarning()).toBe("quota-exceeded"); expect(h.blob()).toBe(previous); expect(data.storageWarning).toBeNull();
    h.adapter.save(data); expect(h.adapter.getWarning()).toBeNull();
  });
  it("rejects oversize JSON without truncation or storage access", () => {
    const h = harness(); const data = snapshot(); data.draftForm.reason = "x".repeat(2000000);
    expect(h.adapter.save(data)).toMatchObject({ status: "failed", warning: "snapshot-too-large" });
    expect(h.storage.setItem).not.toHaveBeenCalled(); expect(data.draftForm.reason).toHaveLength(2000000);
  });
  it("does not clear a warning merely by rereading an older successful checkpoint", () => {
    const h = harness(); h.adapter.save(snapshot());
    h.storage.setItem.mockImplementationOnce(() => { throw new Error("blocked"); });
    h.adapter.save(snapshot(1)); h.adapter.restore();
    expect(h.adapter.getWarning()).toBe("unavailable");
    expect(h.adapter.discard()).toEqual({ status: "removed" });
    expect(h.adapter.getWarning()).toBeNull();
  });
  it("continues checkpointing a long stream every fixed window", () => {
    const h = harness();
    for (let revision = 0; revision < 15; revision++) {
      h.adapter.checkpoint(snapshot(revision), "stream"); vi.advanceTimersByTime(100);
    }
    expect(h.storage.setItem).toHaveBeenCalledTimes(3);
    expect(JSON.parse(h.blob()!).cases[snapshot().caseId].revision).toBe(14);
  });
  it("reports inaccessible storage and failed product-key removal without clearing anything else", () => {
    const h = harness(); h.storage.getItem.mockImplementation(() => { throw new Error("blocked"); });
    expect(h.adapter.restore()).toMatchObject({ status: "unavailable", warning: "unavailable" });
    h.storage.removeItem.mockImplementation(() => { throw new Error("blocked"); });
    expect(h.adapter.discard()).toMatchObject({ status: "failed", warning: "unavailable" });
    expect(h.storage.removeItem).toHaveBeenCalledWith(key);
    const unavailable = createSessionAdapter({ storage: () => { throw new Error("blocked"); } });
    expect(unavailable.save(snapshot())).toMatchObject({ status: "failed", warning: "unavailable" });
  });
  it("debounces drafts at exactly 300ms with the most recent complete snapshot", () => {
    const h = harness(); h.adapter.checkpoint(snapshot(), "draft"); vi.advanceTimersByTime(299);
    expect(h.storage.setItem).not.toHaveBeenCalled(); h.adapter.checkpoint(snapshot(1), "draft");
    vi.advanceTimersByTime(299); expect(h.storage.setItem).not.toHaveBeenCalled(); vi.advanceTimersByTime(1);
    expect(h.storage.setItem).toHaveBeenCalledTimes(1); expect(JSON.parse(h.blob()!).cases[snapshot().caseId].revision).toBe(1);
    expect(h.onWriteResult).toHaveBeenCalledWith({ status: "saved" });
  });
  it("coalesces streams at 500ms and flushes terminal checkpoints immediately", () => {
    const h = harness(); h.adapter.checkpoint(snapshot(), "stream"); vi.advanceTimersByTime(250); h.adapter.checkpoint(snapshot(1), "stream");
    vi.advanceTimersByTime(249); expect(h.storage.setItem).not.toHaveBeenCalled(); vi.advanceTimersByTime(1);
    expect(h.storage.setItem).toHaveBeenCalledTimes(1); expect(JSON.parse(h.blob()!).cases[snapshot().caseId].revision).toBe(1);
    h.adapter.checkpoint(snapshot(2), "stream"); h.adapter.checkpoint(snapshot(3), "immediate");
    expect(h.storage.setItem).toHaveBeenCalledTimes(2); expect(JSON.parse(h.blob()!).cases[snapshot().caseId].revision).toBe(3);
    vi.runAllTimers(); expect(h.storage.setItem).toHaveBeenCalledTimes(2);
  });
  it("flushes queued data on request and cancels on disposal", () => {
    const h = harness(); expect(h.adapter.flush()).toBeNull(); h.adapter.checkpoint(snapshot(), "draft");
    expect(h.adapter.flush()).toEqual({ status: "saved" }); h.adapter.checkpoint(snapshot(1), "draft");
    h.adapter.dispose(); vi.runAllTimers(); expect(h.storage.setItem).toHaveBeenCalledTimes(1);
  });
});


describe("confirmed recovery discard with fresh storage guard", () => {
  const replacement = () => ({ ...snapshot(), caseId: "3552ca85-9d6c-46f5-a5a7-f3fef63e681c" });
  const recover = (adapter: ReturnType<typeof createSessionAdapter>, next = replacement()) => adapter.discard({ recovery: true, isSupported: value => value.stage === "form", replacement: next });
  it.each(["valid", "invalid", "missing"])("preserves a %s replacement instead of deleting stale approved bytes", kind => {
    const h = harness(); h.storage.setItem(key, "{"); expect(h.adapter.restore()).toEqual({ status: "unreadable" });
    if (kind === "valid") h.storage.setItem(key, JSON.stringify(snapshot()));
    else if (kind === "invalid") h.storage.setItem(key, "{different");
    else h.storage.removeItem(key);
    const replacement = h.blob(); h.storage.removeItem.mockClear();
    expect(recover(h.adapter)).toMatchObject({ status: "changed" }); expect(h.blob()).toBe(replacement); expect(h.storage.removeItem).not.toHaveBeenCalled();
  });
  it("rechecks the product value synchronously at confirmation and removes only unchanged unreadable bytes", () => {
    const h = harness(); h.storage.setItem(key, "{"); h.adapter.restore(); h.storage.getItem.mockClear();
    expect(recover(h.adapter)).toEqual({ status: "removed" }); expect(h.storage.getItem).toHaveBeenCalledWith(key); expect(h.storage.removeItem).toHaveBeenCalledExactlyOnceWith(key); expect(h.adapter.restore()).toEqual({ status: "missing" });
  });
  it("preserves raw bytes when fresh storage read fails and allows retry after access returns", () => {
    const h = harness(); h.storage.setItem(key, "{"); h.adapter.restore(); h.storage.getItem.mockImplementationOnce(() => { throw new Error("private storage failure"); });
    expect(recover(h.adapter)).toMatchObject({ status: "failed", warning: "unavailable" }); expect(h.blob()).toBe("{"); expect(h.storage.removeItem).not.toHaveBeenCalled();
    expect(recover(h.adapter)).toEqual({ status: "removed" });
  });
  it("keeps unchanged bytes and guard after failed removal, then removes on explicit retry", () => {
    const h = harness(); h.storage.setItem(key, "{"); h.adapter.restore(); h.storage.removeItem.mockImplementationOnce(() => { throw new Error("private removal failure"); });
    expect(recover(h.adapter)).toMatchObject({ status: "failed", warning: "unavailable" }); expect(h.blob()).toBe("{"); expect(h.adapter.restore()).toEqual({ status: "unreadable" }); expect(recover(h.adapter)).toEqual({ status: "removed" });
  });
  it("preserves an unchanged supported registry instead of exposing a destructive recovery path", () => {
    const h = harness(); h.adapter.save(snapshot()); h.adapter.restore(); const raw = h.blob();
    expect(recover(h.adapter)).toMatchObject({ status: "changed" }); expect(h.blob()).toBe(raw); expect(h.storage.removeItem).not.toHaveBeenCalled();
  });
  it("atomically preserves the original schema-valid unsupported legacy checkpoint with a new active UUID", () => {
    const h = harness(); const unsupported = { ...snapshot(), stage: "chat" as const }; h.storage.setItem(key, JSON.stringify(unsupported)); h.adapter.restore();
    expect(recover(h.adapter)).toEqual({ status: "preserved" });
    expect(JSON.parse(h.blob()!)).toMatchObject({ activeCaseId: replacement().caseId, cases: { [unsupported.caseId]: unsupported, [replacement().caseId]: replacement() } }); expect(h.storage.removeItem).not.toHaveBeenCalled();
  });
  it("preserves readable earlier cases in a registry with an unsupported active checkpoint", () => {
    const h = harness(); const valid = snapshot(); const invalid = { ...snapshot(), caseId: "7b40b034-5e7b-49dc-bb47-e8d8d2d5fc76", stage: "chat" as const };
    h.storage.setItem(key, JSON.stringify({ schemaVersion: 2, activeCaseId: invalid.caseId, cases: { [valid.caseId]: valid, [invalid.caseId]: invalid } })); h.adapter.restore(); const raw = h.blob();
    h.storage.setItem.mockClear(); expect(recover(h.adapter)).toEqual({ status: "preserved" });
    expect(JSON.parse(h.blob()!)).toMatchObject({ activeCaseId: replacement().caseId, cases: { [valid.caseId]: valid, [invalid.caseId]: invalid, [replacement().caseId]: replacement() } });
    expect(h.storage.setItem).toHaveBeenCalledTimes(1); expect(h.storage.removeItem).not.toHaveBeenCalled(); expect(h.blob()).not.toBe(raw);
  });
  it("keeps exact original registry bytes when atomic preserving append fails", () => {
    const h = harness(); const unsupported = { ...snapshot(), stage: "chat" as const }; h.storage.setItem(key, JSON.stringify(unsupported)); h.adapter.restore(); const raw = h.blob();
    h.storage.setItem.mockImplementationOnce(() => { throw new DOMException("full", "QuotaExceededError"); });
    expect(recover(h.adapter)).toMatchObject({ status: "failed", warning: "quota-exceeded" }); expect(h.blob()).toBe(raw); expect(h.storage.removeItem).not.toHaveBeenCalled(); expect(h.adapter.restore()).toMatchObject({ snapshot: unsupported });
  });
  it("rejects a new UUID collision instead of overwriting any preserved case", () => {
    const h = harness(); const unsupported = { ...snapshot(), stage: "chat" as const }; h.storage.setItem(key, JSON.stringify(unsupported)); h.adapter.restore(); const raw = h.blob(); h.storage.setItem.mockClear();
    expect(recover(h.adapter, snapshot())).toMatchObject({ status: "changed" }); expect(h.blob()).toBe(raw); expect(h.storage.setItem).not.toHaveBeenCalled(); expect(h.storage.removeItem).not.toHaveBeenCalled();
  });
});
