import { beforeEach, expect, it, vi } from "vitest";
import type { Page } from "@playwright/test";

const harness = vi.hoisted(() => ({
  readSnapshot: vi.fn(), parseRequest: vi.fn(), parseTerminal: vi.fn(),
  body: vi.fn(), bodyStartedAtPendingUi: false,
  capture: vi.fn(), dispose: vi.fn(),
}));
vi.mock("../../e2e/helpers/case-checkpoint", () => ({ readCaseCheckpoint: harness.readSnapshot }));
vi.mock("../../../src/lib/contracts/requests", () => ({ createChatRequestSchema: () => ({ safeParse: harness.parseRequest }) }));
vi.mock("../../../src/lib/contracts/messages", () => ({ terminalMetadataSchema: { safeParse: harness.parseTerminal } }));
vi.mock("../../e2e/helpers/chat-stream-observer", () => ({ startChatStreamObserver: harness.capture }));
vi.mock("@playwright/test", () => {
  const check = (value: { role?: string } | unknown) => ({
    toBe: (expected: unknown) => { if (value !== expected) throw new Error("Mocked browser assertion rejected scalar"); }, toHaveValue: vi.fn(), toHaveAttribute: vi.fn(),
    toBeVisible: async () => {
      if ((value as { role?: string })?.role === "status") harness.bodyStartedAtPendingUi = harness.capture.mock.calls.length > 0;
    },
  });
  return { expect: Object.assign(check, { poll: (predicate: () => Promise<unknown>) => ({ toBe: async (expected: unknown) => { if (await predicate() !== expected) throw new Error("Mocked browser completion rejected scalar"); } }) }) };
});
import { sendActualChatTurn } from "../../e2e/helpers/chat-actions";

const metadata = { operationId: "22222222-2222-4222-8222-222222222222", finishReason: "stop", completionState: "complete" };
const seed = { id: "seed", role: "assistant", parts: [{ type: "text", text: "unit-only first assessment" }] };
const employee = { id: "employee", role: "user", parts: [{ type: "text", text: "unit-only question" }] };
const reply = { id: "reply", role: "assistant", parts: [{ type: "text", text: "unit-only answer", state: "done" }], metadata };
const saved = { caseId: "11111111-1111-4111-8111-111111111111", submittedForm: {}, timeZone: "Europe/Warsaw", imageAnalysis: {}, initialDecision: {}, messages: [seed] };
const body = { id: saved.caseId, operationId: metadata.operationId, replyMessageId: "reply", trigger: "send-message", caseContext: { form: {}, timeZone: saved.timeZone, imageAnalysis: {}, initialDecision: {} }, messages: [seed, employee] };
const completed = { ...saved, messages: [seed, employee, reply], replyStates: { reply: "complete" }, pendingOperation: null };
let streamBody: Buffer;
const outcome = (kind: string) => {
  const capture = { body: streamBody, status: 200, contentType: "text/event-stream", identity: { id: saved.caseId, operationId: metadata.operationId, replyMessageId: "reply" } };
  // Keep the old reader's baseline healthy during contract-transition RED.
  return { kind, capture, ok: kind === "complete", value: capture, error: new Error("Candidate requires independent validation") };
};

function locator(role?: string) {
  const value = { role, fill: vi.fn(), focus: vi.fn(), count: vi.fn().mockResolvedValue(1), isDisabled: vi.fn().mockResolvedValue(true), innerText: vi.fn().mockResolvedValue("unit-only visible text"), filter: vi.fn(), locator: vi.fn(), getByText: vi.fn() };
  value.filter.mockReturnValue(value); value.locator.mockReturnValue(value); value.getByText.mockReturnValue(value);
  return value;
}

function pageWithImmediateResponse() {
  const response = { status: () => 200, headers: () => ({ "content-type": "text/event-stream" }), body: harness.body };
  return {
    getByRole: vi.fn((role: string) => locator(role)), locator: vi.fn(() => locator()),
    url: () => "http://127.0.0.1:3000/chat/" + saved.caseId,
    keyboard: { press: vi.fn() }, waitForRequest: vi.fn().mockResolvedValue({ postDataJSON: () => body }),
    waitForResponse: vi.fn().mockResolvedValue(response),
  } as unknown as Page;
}

beforeEach(() => {
  harness.bodyStartedAtPendingUi = false;
  harness.parseRequest.mockReturnValue({ success: true, data: body });
  harness.parseTerminal.mockReturnValue({ success: true, data: metadata });
  harness.readSnapshot.mockResolvedValue(completed);
  harness.readSnapshot.mockResolvedValueOnce(saved);
  const pending = { ...completed, pendingOperation: { operationId: metadata.operationId }, replyStates: { reply: "streaming" } };
  harness.readSnapshot.mockResolvedValueOnce(pending).mockResolvedValueOnce(pending);
  streamBody = Buffer.from([
    { type: "start", messageId: "reply" }, { type: "text-start", id: "text" },
    { type: "text-delta", id: "text", delta: "unit-only answer" }, { type: "text-end", id: "text" },
    { type: "finish", messageMetadata: metadata },
  ].map(event => `data: ${JSON.stringify(event)}\n\n`).join("") + "data: [DONE]\n\n");
  harness.dispose.mockResolvedValue(undefined);
  harness.capture.mockResolvedValue({ finished: Promise.resolve(outcome("complete")), dispose: harness.dispose });
  harness.body.mockRejectedValue(new Error("forbidden Response.body fallback"));
});

it("starts primary passive capture before pending UI and never falls back to Response.body", async () => {
  await sendActualChatTurn(pageWithImmediateResponse(), saved.caseId, "unit-only question");
  expect(harness.bodyStartedAtPendingUi).toBe(true);
  expect(harness.body).not.toHaveBeenCalled();
  expect(harness.dispose).toHaveBeenCalledTimes(1);
});

it("keeps failed primary capture fatal, cleans up and never skips or falls back", async () => {
  harness.capture.mockResolvedValue({ finished: Promise.resolve({ kind: "failed", error: new Error("unit-only failed passive capture") }), dispose: harness.dispose });
  await expect(sendActualChatTurn(pageWithImmediateResponse(), saved.caseId, "unit-only question")).rejects.toThrow("unit-only failed passive capture");
  expect(harness.body).not.toHaveBeenCalled();
  expect(harness.dispose).toHaveBeenCalledTimes(1);
});

it("accepts candidate bytes only after independently completed SDK-derived persistence", async () => {
  harness.capture.mockResolvedValue({ finished: Promise.resolve(outcome("inspector-abort-candidate")), dispose: harness.dispose });
  await sendActualChatTurn(pageWithImmediateResponse(), saved.caseId, "unit-only question");
  expect(harness.body).not.toHaveBeenCalled(); expect(streamBody.every(byte => byte === 0)).toBe(true);
});

it.each([false, true])("reconstructs multipart SDK parts in text-start order with interleaved=%s", async interleaved => {
  const frame = (value: unknown) => `data: ${JSON.stringify(value)}\n\n`;
  const parts = [frame({ type: "start", messageId: "reply" }), frame({ type: "text-start", id: "a" }), frame({ type: "text-delta", id: "a", delta: "A1" })];
  if (interleaved) parts.push(frame({ type: "text-start", id: "b" }), frame({ type: "text-delta", id: "b", delta: "B1" }), frame({ type: "text-delta", id: "a", delta: "A2" }), frame({ type: "text-end", id: "a" }), frame({ type: "text-end", id: "b" }));
  else parts.push(frame({ type: "text-delta", id: "a", delta: "A2" }), frame({ type: "text-end", id: "a" }), frame({ type: "text-start", id: "b" }), frame({ type: "text-delta", id: "b", delta: "B1" }), frame({ type: "text-end", id: "b" }));
  parts.push(frame({ type: "finish", messageMetadata: metadata }), "data: [DONE]\n\n"); streamBody = Buffer.from(parts.join(""));
  harness.readSnapshot.mockResolvedValue({ ...completed, messages: [seed, employee, { ...reply, parts: [{ type: "text", text: "A1A2", state: "done" }, { type: "text", text: "B1", state: "done" }] }] });
  harness.capture.mockResolvedValue({ finished: Promise.resolve(outcome("inspector-abort-candidate")), dispose: harness.dispose });
  expect((await sendActualChatTurn(pageWithImmediateResponse(), saved.caseId, "unit-only question")).text).toBe("A1A2B1");
  expect(streamBody.every(byte => byte === 0)).toBe(true);
});

it.each(["before start", "after finish"])("rejects text parts %s even if saved text still matches", async phase => {
  const emptyPart = 'data: {"type":"text-start","id":"outside"}\n\ndata: {"type":"text-end","id":"outside"}\n\n';
  streamBody = Buffer.from(phase === "before start" ? emptyPart + streamBody.toString() : streamBody.toString().replace("data: [DONE]", emptyPart + "data: [DONE]"));
  harness.capture.mockResolvedValue({ finished: Promise.resolve(outcome("complete")), dispose: harness.dispose });
  await expect(sendActualChatTurn(pageWithImmediateResponse(), saved.caseId, "unit-only question")).rejects.toThrow();
  expect(streamBody.every(byte => byte === 0)).toBe(true);
});

it.each([
  ["SDK abort/incomplete", { ...completed, replyStates: { reply: "interrupted" } }],
  ["still pending", { ...completed, pendingOperation: { operationId: metadata.operationId } }],
  ["SDK error", { ...completed, replyStates: { reply: "error" } }],
  ["wrong operation", { ...completed, messages: [seed, employee, { ...reply, metadata: { ...metadata, operationId: "wrong" } }] }],
  ["empty saved reply", { ...completed, messages: [seed, employee, { ...reply, parts: [{ type: "text", text: "" }] }] }],
  ["different saved text", { ...completed, messages: [seed, employee, { ...reply, parts: [{ type: "text", text: "different", state: "done" }] }] }],
])("rejects a full candidate with %s and clears owned bytes", async (_name, snapshot) => {
  harness.capture.mockResolvedValue({ finished: Promise.resolve(outcome("inspector-abort-candidate")), dispose: harness.dispose });
  harness.readSnapshot.mockResolvedValue(snapshot);
  await expect(sendActualChatTurn(pageWithImmediateResponse(), saved.caseId, "unit-only question")).rejects.toThrow();
  expect(harness.body).not.toHaveBeenCalled(); expect(harness.dispose).toHaveBeenCalledTimes(1);
  expect(streamBody.every(byte => byte === 0)).toBe(true);
});
