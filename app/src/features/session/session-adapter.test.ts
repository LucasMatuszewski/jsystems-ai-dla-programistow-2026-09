import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import type { ActiveCaseSnapshot } from "../../lib/contracts/session";
import { createSessionAdapter } from "./session-adapter";

const { safeParse } = vi.hoisted(() => ({ safeParse: vi.fn() }));
vi.mock("../../lib/contracts/session", () => ({
  ACTIVE_CASE_STORAGE_KEY: "hardware-service-copilot.active-case",
  SNAPSHOT_SOFT_UTF16_BUDGET: 4000000,
  activeCaseSnapshotSchema: { safeParse },
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
  const storage = { getItem: vi.fn(() => blob), setItem: vi.fn((_key: string, value: string) => { blob = value; }), removeItem: vi.fn(() => { blob = null; }) };
  const onWriteResult = vi.fn();
  return { storage, onWriteResult, adapter: createSessionAdapter({ storage: () => storage, onWriteResult }), blob: () => blob };
}
beforeEach(() => { vi.useFakeTimers(); safeParse.mockImplementation(data => ({ success: true, data: structuredClone(data) })); });
afterEach(() => vi.useRealTimers());

describe("validated active case checkpoints", () => {
  it("distinguishes missing, corrupt JSON and unknown schema without deleting data", () => {
    const h = harness();
    expect(h.adapter.restore()).toEqual({ status: "missing" });
    h.storage.getItem.mockReturnValue("{");
    expect(h.adapter.restore()).toEqual({ status: "unreadable" });
    h.storage.getItem.mockReturnValue('{"schemaVersion":2}');
    safeParse.mockReturnValue({ success: false });
    expect(h.adapter.restore()).toEqual({ status: "unreadable" });
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
    expect(h.storage.setItem).toHaveBeenCalledWith(key, JSON.stringify(data));
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
    expect(JSON.parse(h.blob()!).revision).toBe(14);
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
    expect(h.storage.setItem).toHaveBeenCalledTimes(1); expect(JSON.parse(h.blob()!).revision).toBe(1);
    expect(h.onWriteResult).toHaveBeenCalledWith({ status: "saved" });
  });
  it("coalesces streams at 500ms and flushes terminal checkpoints immediately", () => {
    const h = harness(); h.adapter.checkpoint(snapshot(), "stream"); vi.advanceTimersByTime(250); h.adapter.checkpoint(snapshot(1), "stream");
    vi.advanceTimersByTime(249); expect(h.storage.setItem).not.toHaveBeenCalled(); vi.advanceTimersByTime(1);
    expect(h.storage.setItem).toHaveBeenCalledTimes(1); expect(JSON.parse(h.blob()!).revision).toBe(1);
    h.adapter.checkpoint(snapshot(2), "stream"); h.adapter.checkpoint(snapshot(3), "immediate");
    expect(h.storage.setItem).toHaveBeenCalledTimes(2); expect(JSON.parse(h.blob()!).revision).toBe(3);
    vi.runAllTimers(); expect(h.storage.setItem).toHaveBeenCalledTimes(2);
  });
  it("flushes queued data on request and cancels on disposal", () => {
    const h = harness(); expect(h.adapter.flush()).toBeNull(); h.adapter.checkpoint(snapshot(), "draft");
    expect(h.adapter.flush()).toEqual({ status: "saved" }); h.adapter.checkpoint(snapshot(1), "draft");
    h.adapter.dispose(); vi.runAllTimers(); expect(h.storage.setItem).toHaveBeenCalledTimes(1);
  });
});
