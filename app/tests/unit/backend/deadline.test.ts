import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createOperationDeadline } from "@/server/ai/deadline";
import { classifyOperationError } from "@/server/http/errors";
describe("independent aborting operation deadlines", () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] }));
  afterEach(() => vi.useRealTimers());
  it.each([["prepare", undefined, 30000], ["analysis", 120000, 60000], ["analysis", 123, 123], ["decision", 120000, 90000], ["decision", 456, 456], ["chat", undefined, 90000]] as const)("clips %s to its actual remaining deadline", (kind, budget, duration) => {
    const deadline = createOperationDeadline(kind, budget);
    expect(deadline.remainingMs()).toBe(duration);
    vi.advanceTimersByTime(duration - 1); expect(deadline.signal.aborted).toBe(false);
    vi.advanceTimersByTime(1); expect(deadline.signal.aborted).toBe(true);
    expect(classifyOperationError(deadline.signal.reason)).toMatchObject({ kind: "error", code: "OPERATION_TIMEOUT" });
    deadline.dispose();
  });
  it.each([0, -1, 120001, 0.5])("rejects invalid browser remaining budget %s", budget => {
    expect(() => createOperationDeadline("analysis", budget)).toThrow();
  });
  it("propagates caller cancellation without inventing an HTTP error code", () => {
    const caller = new AbortController(); const deadline = createOperationDeadline("chat", undefined, caller.signal);
    caller.abort(new Error("private caller reason"));
    expect(deadline.signal.aborted).toBe(true);
    expect(classifyOperationError(deadline.signal.reason)).toEqual({ kind: "cancelled" });
    expect(String(deadline.signal.reason)).not.toContain("private caller reason");
    deadline.dispose(); expect(vi.getTimerCount()).toBe(0);
  });
  it("does not serialize five independent cases or leak disposed timers", () => {
    const deadlines = Array.from({ length: 5 }, () => createOperationDeadline("analysis", 120000));
    expect(vi.getTimerCount()).toBe(5);
    deadlines[0].dispose(); vi.advanceTimersByTime(60000);
    expect(deadlines[0].signal.aborted).toBe(false);
    expect(deadlines.slice(1).every(deadline => deadline.signal.aborted)).toBe(true);
    deadlines.forEach(deadline => deadline.dispose()); expect(vi.getTimerCount()).toBe(0);
  });
  it("handles already-cancelled callers and gives retries a fresh operation budget", () => {
    const caller = new AbortController(); caller.abort();
    const cancelled = createOperationDeadline("chat", undefined, caller.signal);
    expect(cancelled.signal.aborted).toBe(true); cancelled.dispose();
    const retry = createOperationDeadline("decision", 120000);
    expect(retry.remainingMs()).toBe(90000); retry.dispose(); expect(vi.getTimerCount()).toBe(0);
  });
});
