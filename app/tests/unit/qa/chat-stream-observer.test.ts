import { EventEmitter } from "node:events";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Page } from "@playwright/test";
import { startChatStreamObserver } from "../../e2e/helpers/chat-stream-observer";

const url = "http://127.0.0.1:3000/api/chat";
const identity = { id: "11111111-1111-4111-8111-111111111111", operationId: "22222222-2222-4222-8222-222222222222", replyMessageId: "unit-reply" };
const encode = (text: string) => Buffer.from(text).toString("base64");
let session: EventEmitter & { send: ReturnType<typeof vi.fn>; detach: ReturnType<typeof vi.fn> };
let page: Page;
let resolveActivation: (value: { bufferedData: string }) => void;
let rejectActivation: (error: Error) => void;

beforeEach(() => {
  session = Object.assign(new EventEmitter(), { send: vi.fn(), detach: vi.fn().mockResolvedValue(undefined) });
  const activation = new Promise<{ bufferedData: string }>((resolve, reject) => { resolveActivation = resolve; rejectActivation = reject; });
  // The unavailable preimplementation skeleton never subscribes to this collaborator.
  // Observe its rejection without changing the original promise consumed by the observer.
  void activation.catch(() => {});
  session.send.mockImplementation((method: string) => method === "Network.enable" ? Promise.resolve({}) : activation);
  page = { context: () => ({ newCDPSession: vi.fn().mockResolvedValue(session) }) } as unknown as Page;
});
afterEach(() => vi.useRealTimers());

function begin(requestId = "unit-request", targetUrl = url, method = "POST", postData = JSON.stringify(identity)) {
  session.emit("Network.requestWillBeSent", { requestId, request: { url: targetUrl, method, postData } });
}
function response(requestId = "unit-request") {
  session.emit("Network.responseReceived", { requestId, response: { status: 200, headers: { "Content-Type": "text/event-stream" } } });
}
function data(text: string, requestId = "unit-request") {
  session.emit("Network.dataReceived", { requestId, data: encode(text), dataLength: Buffer.byteLength(text) });
}
const finished = () => session.emit("Network.loadingFinished", { requestId: "unit-request" });

const frame = (value: unknown) => `data: ${JSON.stringify(value)}\n\n`;
function completeWire(overrides: Record<string, unknown> = {}) {
  return frame({ type: "start", messageId: identity.replyMessageId }) + frame({ type: "text-start", id: "text" }) + frame({ type: "text-delta", id: "text", delta: "unit-only answer" }) + frame({ type: "text-end", id: "text" }) + frame({ type: "finish", messageMetadata: { operationId: identity.operationId, finishReason: "stop", completionState: "complete", ...overrides } }) + "data: [DONE]\n\n";
}
async function inspectorFailure(wire: string | Buffer, options: { cache?: string; canceled?: boolean; error?: string; status?: number; contentType?: string } = {}) {
  const capture = await startChatStreamObserver(page, { url }); begin();
  session.emit("Network.responseReceived", { requestId: "unit-request", response: { status: options.status ?? 200, headers: { "Content-Type": options.contentType ?? "text/event-stream", "Cache-Control": options.cache ?? "no-store" } } });
  resolveActivation({ bufferedData: Buffer.from(wire).toString("base64") }); await Promise.resolve(); await Promise.resolve();
  session.emit("Network.loadingFailed", { requestId: "unit-request", canceled: options.canceled ?? true, errorText: options.error ?? "net::ERR_ABORTED" });
  const result = await capture.finished; await capture.dispose(); return result;
}

it("retains no-store inspector cancellation as a candidate, never ordinary transport success", async () => {
  const wire = completeWire(); const result = await inspectorFailure(wire);
  expect((result as { kind?: string }).kind).toBe("inspector-abort-candidate");
  if ("capture" in result) expect((result.capture as { body: Buffer }).body.equals(Buffer.from(wire))).toBe(true);
});

const multipart = (interleaved: boolean) => frame({ type: "start", messageId: identity.replyMessageId }) +
  frame({ type: "text-start", id: "a" }) + frame({ type: "text-delta", id: "a", delta: "A1" }) +
  (interleaved ? frame({ type: "text-start", id: "b" }) + frame({ type: "text-delta", id: "b", delta: "B1" }) + frame({ type: "text-delta", id: "a", delta: "A2" }) + frame({ type: "text-end", id: "a" }) + frame({ type: "text-end", id: "b" }) : frame({ type: "text-delta", id: "a", delta: "A2" }) + frame({ type: "text-end", id: "a" }) + frame({ type: "text-start", id: "b" }) + frame({ type: "text-delta", id: "b", delta: "B1" }) + frame({ type: "text-end", id: "b" })) +
  frame({ type: "finish", messageMetadata: { operationId: identity.operationId, finishReason: "stop", completionState: "complete" } }) + "data: [DONE]\n\n";

it.each([false, true])("retains valid multipart candidate with interleaved=%s", async interleaved => {
  const wire = multipart(interleaved); const result = await inspectorFailure(wire);
  expect(result.kind).toBe("inspector-abort-candidate");
  if (result.kind !== "failed") { expect(result.capture.body.equals(Buffer.from(wire))).toBe(true); result.capture.body.fill(0); }
});

it.each([
  ["duplicate active ID", multipart(true).replace(frame({ type: "text-start", id: "b" }), frame({ type: "text-start", id: "a" }))],
  ["reused closed ID", multipart(false).replaceAll('"id":"b"', '"id":"a"')],
  ["orphan delta", multipart(false).replace(frame({ type: "text-start", id: "a" }), "")],
  ["orphan end", multipart(false).replace(frame({ type: "text-start", id: "b" }), "").replace(frame({ type: "text-delta", id: "b", delta: "B1" }), "")],
  ["unclosed part", multipart(true).replace(frame({ type: "text-end", id: "b" }), "")],
  ["delta after part end", multipart(false).replace(frame({ type: "text-end", id: "a" }), frame({ type: "text-end", id: "a" }) + frame({ type: "text-delta", id: "a", delta: "late" }))],
  ["text after finish", multipart(false).replace("data: [DONE]", frame({ type: "text-start", id: "late" }) + "data: [DONE]")],
])("keeps malformed multipart %s fatal", async (_name, wire) => {
  expect((await inspectorFailure(wire)).kind).toBe("failed");
});

it.each([
  ["missing no-store", completeWire(), { cache: "no-cache" }],
  ["substring directive", completeWire(), { cache: "x-no-store" }],
  ["actual socket failure", completeWire(), { canceled: false, error: "net::ERR_FAILED" }],
  ["other error", completeWire(), { error: "net::ERR_FAILED" }],
  ["HTTP failure", completeWire(), { status: 503 }],
  ["non-SSE", completeWire(), { contentType: "application/json" }],
  ["wrong operation", completeWire({ operationId: "wrong-operation" }), {}],
  ["length finish", completeWire({ finishReason: "length" }), {}],
  ["missing DONE", completeWire().replace("data: [DONE]\n\n", ""), {}],
  ["duplicate DONE", completeWire() + "data: [DONE]\n\n", {}],
  ["events after DONE", completeWire() + frame({ type: "text-delta", delta: "late" }), {}],
  ["missing finish", completeWire().replace(frame({ type: "finish", messageMetadata: { operationId: identity.operationId, finishReason: "stop", completionState: "complete" } }), ""), {}],
  ["duplicate finish", completeWire().replace("data: [DONE]", frame({ type: "finish", messageMetadata: { operationId: identity.operationId, finishReason: "stop", completionState: "complete" } }) + "data: [DONE]"), {}],
  ["wrong reply", completeWire().replace(identity.replyMessageId, "wrong-reply"), {}],
  ["empty text", completeWire().replace("unit-only answer", ""), {}],
  ["error part", completeWire().replace("data: [DONE]", frame({ type: "error", errorText: "SYNTHETIC_PRIVATE" }) + "data: [DONE]"), {}],
  ["abort part", completeWire().replace("data: [DONE]", frame({ type: "abort" }) + "data: [DONE]"), {}],
  ["invalid JSON", completeWire().replace('"type":"text-delta"', 'invalid'), {}],
  ["truncated terminal", completeWire().slice(0, -1), {}],
  ["invalid UTF8", Buffer.concat([Buffer.from(completeWire()), Buffer.from([0xff])]), {}],
] as const)("keeps %s fatal even when no-store inspector cancellation is reported", async (_name, wire, options) => {
  const result = await inspectorFailure(wire, options);
  expect((result as { kind?: string }).kind).toBe("failed");
});

it("prepends buffered bytes once before tail events that race the activation response", async () => {
  const capture = await startChatStreamObserver(page, { url });
  begin(); response(); data("tail1"); data("tail2"); finished();
  resolveActivation({ bufferedData: encode("prefix") });
  const result = await capture.finished;
  expect(result.kind).toBe("complete");
  if (result.kind === "complete") { expect(result.capture.body.toString()).toBe("prefixtail1tail2"); expect(result.capture.identity).toEqual(identity); }
  await capture.dispose();
  expect(session.send.mock.calls.map(call => call[0])).toEqual(["Network.enable", "Network.streamResourceContent"]);
  expect(session.send).toHaveBeenCalledWith("Network.enable", { maxPostDataSize: 300_000 });
  expect(session.eventNames()).toHaveLength(0);
  expect(session.detach).toHaveBeenCalledTimes(1);
});

it("waits for activation when loadingFinished arrives first", async () => {
  const capture = await startChatStreamObserver(page, { url });
  let settled = false; void capture.finished.then(() => { settled = true; });
  begin(); response(); finished(); await Promise.resolve();
  expect(settled).toBe(false);
  resolveActivation({ bufferedData: encode("complete") });
  const result = await capture.finished;
  expect(result.kind === "complete" && result.capture.body.toString() === "complete").toBe(true);
  await capture.dispose();
});

it("combines binary chunks before decoding split Polish UTF-8 text", async () => {
  const capture = await startChatStreamObserver(page, { url });
  begin(); response();
  const bytes = Buffer.from("Zażółć ✓");
  resolveActivation({ bufferedData: bytes.subarray(0, 3).toString("base64") }); await Promise.resolve();
  session.emit("Network.dataReceived", { requestId: "unit-request", data: bytes.subarray(3).toString("base64"), dataLength: bytes.length - 3 }); finished();
  const result = await capture.finished;
  expect(result.kind === "complete" && result.capture.body.toString() === "Zażółć ✓").toBe(true);
  await capture.dispose();
});

it("ignores unrelated URLs, methods and request IDs without inspecting their bodies", async () => {
  const capture = await startChatStreamObserver(page, { url });
  begin("other", url + "?different", "POST", "not-json"); begin("get", url, "GET", "not-json");
  begin(); response(); data("ignored", "other"); resolveActivation({ bufferedData: encode("target") }); finished();
  const result = await capture.finished;
  expect(result.kind === "complete" && result.capture.body.toString() === "target").toBe(true);
  await capture.dispose();
});

it("rejects multiple matching requests instead of mixing streams", async () => {
  const capture = await startChatStreamObserver(page, { url }); begin(); begin("duplicate");
  const result = await capture.finished;
  expect(result.kind === "failed" && result.error.message === "Chat stream capture failed: MULTIPLE_REQUESTS").toBe(true);
  await capture.dispose();
});

it("rejects missing request identity without reading or replaying the request", async () => {
  const capture = await startChatStreamObserver(page, { url }); begin("unit-request", url, "POST", "{}");
  const result = await capture.finished;
  expect(result.kind === "failed" && result.error.message === "Chat stream capture failed: REQUEST_IDENTITY").toBe(true);
  await capture.dispose();
});

it("keeps unsupported activation fatal and excludes private protocol diagnostics", async () => {
  const capture = await startChatStreamObserver(page, { url }); begin(); response();
  rejectActivation(new Error("SYNTHETIC_PRIVATE_PROTOCOL_SENTINEL"));
  const result = await capture.finished;
  expect(result.kind === "failed" && result.error.message === "Chat stream capture failed: ACTIVATION").toBe(true);
  await capture.dispose();
});

it("rejects missing streamed payload after activation instead of accepting truncated content", async () => {
  const capture = await startChatStreamObserver(page, { url }); begin(); response();
  resolveActivation({ bufferedData: encode("prefix") }); await Promise.resolve(); await Promise.resolve();
  session.emit("Network.dataReceived", { requestId: "unit-request", dataLength: 2 });
  const result = await capture.finished;
  expect(result.kind === "failed" && result.error.message === "Chat stream capture failed: MISSING_BYTES").toBe(true);
  await capture.dispose();
});

it("rejects malformed base64 rather than silently dropping bytes", async () => {
  const capture = await startChatStreamObserver(page, { url }); begin(); response();
  resolveActivation({ bufferedData: "!invalid!" });
  const result = await capture.finished;
  expect(result.kind === "failed" && result.error.message === "Chat stream capture failed: INVALID_BYTES").toBe(true);
  await capture.dispose();
});

it("marks an aborted or failed transport incomplete and sanitizes error text", async () => {
  const capture = await startChatStreamObserver(page, { url }); begin(); response();
  session.emit("Network.loadingFailed", { requestId: "unit-request", canceled: true, errorText: "SYNTHETIC_PRIVATE_NETWORK_SENTINEL" });
  const result = await capture.finished;
  expect(result.kind === "failed" && result.error.message === "Chat stream capture failed: TRANSPORT").toBe(true);
  await capture.dispose(); resolveActivation({ bufferedData: encode("late bytes") });
  expect(session.eventNames()).toHaveLength(0);
});

it("retains only scalar transport diagnostics before clearing failed stream bytes", async () => {
  const capture = await startChatStreamObserver(page, { url }); begin(); response();
  const terminal = `data: ${JSON.stringify({ type: "finish", messageMetadata: { operationId: identity.operationId, finishReason: "stop", completionState: "complete" } })}\n\ndata: [DONE]\n\n`;
  resolveActivation({ bufferedData: encode(terminal) }); await Promise.resolve(); await Promise.resolve();
  session.emit("Network.loadingFailed", { requestId: "unit-request", canceled: true, errorText: "net::ERR_ABORTED" });
  const result = await capture.finished;
  expect(result.kind).toBe("failed");
  if (result.kind === "failed") expect(result.diagnostics).toEqual({ canceled: true, errorCategory: "ABORTED", activationReady: true, loaded: false, bufferedByteCount: Buffer.byteLength(terminal), finishSeen: true, finishOperationMatches: true, doneSeen: true, errorOrAbortSeen: false });
  expect(JSON.stringify(result).includes(identity.operationId)).toBe(false);
  await capture.dispose();
});

it("reports missing or mismatched terminals without changing fatal transport acceptance", async () => {
  const capture = await startChatStreamObserver(page, { url }); begin(); response();
  const terminal = `data: ${JSON.stringify({ type: "finish", messageMetadata: { operationId: "SYNTHETIC_PRIVATE_OTHER_ID", finishReason: "stop", completionState: "complete" } })}\n\ndata: {"type":"error","errorText":"SYNTHETIC_PRIVATE_ERROR"}\n\n`;
  resolveActivation({ bufferedData: encode(terminal) }); await Promise.resolve(); await Promise.resolve();
  session.emit("Network.loadingFailed", { requestId: "unit-request", canceled: false, errorText: "SYNTHETIC_PRIVATE_NETWORK" });
  const result = await capture.finished;
  expect(result.kind).toBe("failed");
  if (result.kind === "failed") expect(result.diagnostics).toEqual({ canceled: false, errorCategory: "OTHER", activationReady: true, loaded: false, bufferedByteCount: Buffer.byteLength(terminal), finishSeen: true, finishOperationMatches: false, doneSeen: false, errorOrAbortSeen: true });
  expect(JSON.stringify(result)).not.toContain("SYNTHETIC_PRIVATE");
  await capture.dispose();
});

it("fails honestly if the target session disconnects", async () => {
  const capture = await startChatStreamObserver(page, { url }); session.emit("close");
  const result = await capture.finished;
  expect(result.kind === "failed" && result.error.message === "Chat stream capture failed: DISCONNECTED").toBe(true);
  await capture.dispose();
});

it("bounds the passive observation by the real 125 second deadline", async () => {
  vi.useFakeTimers(); const capture = await startChatStreamObserver(page, { url });
  await vi.advanceTimersByTimeAsync(125_000);
  const result = await capture.finished;
  expect(result.kind === "failed" && result.error.message === "Chat stream capture failed: DEADLINE").toBe(true);
  await capture.dispose(); expect(vi.getTimerCount()).toBe(0);
});

it("disposes an unfinished observation idempotently and removes every owned listener", async () => {
  const capture = await startChatStreamObserver(page, { url }); begin(); response();
  await capture.dispose(); await capture.dispose();
  const result = await capture.finished;
  expect(result.kind === "failed" && result.error.message === "Chat stream capture failed: DISPOSED").toBe(true);
  resolveActivation({ bufferedData: encode("late bytes") });
  expect(session.eventNames()).toHaveLength(0); expect(session.detach).toHaveBeenCalledTimes(1);
});

it("reports detach failure safely while still removing listeners", async () => {
  const capture = await startChatStreamObserver(page, { url });
  session.detach.mockRejectedValue(new Error("SYNTHETIC_PRIVATE_DETACH_SENTINEL"));
  await expect(capture.dispose()).rejects.toThrow("Chat stream capture failed: DETACH");
  expect(session.eventNames()).toHaveLength(0);
});
