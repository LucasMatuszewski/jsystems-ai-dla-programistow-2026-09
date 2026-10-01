import { describe, expect, it } from "vitest";
import { readBoundedBody, readBoundedJson, readBoundedMultipart, BODY_LIMITS } from "@/server/http/request-reader";
import { OperationError, createOperationErrorResponse } from "@/server/http/errors";
const operationId = "129d4e48-1a61-4a99-b1ac-0d1ce4576c58";
describe("real streamed request bounds", () => {
  it("freezes exact per-route byte caps", () => { expect(BODY_LIMITS).toEqual({ prepare: 10065536, analysis: 6000000, decision: 65536, chat: 300000 }); });
  it("bounds actual bytes without Content-Length and cancels unread trailing data", async () => {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array(10)); controller.enqueue(new Uint8Array(10)); }, cancel() { cancelled = true; } });
    const request = new Request("http://127.0.0.1/request", { method: "POST", body, duplex: "half" } as RequestInit);
    await expect(readBoundedBody(request, 15)).rejects.toMatchObject({ code: "PAYLOAD_LIMIT" });
    expect(cancelled).toBe(true);
  });
  it("checks actual UTF8 bytes even with an understated Content-Length", async () => {
    const request = new Request("http://127.0.0.1/request", { method: "POST", body: "ąąą", headers: { "Content-Length": "1" } });
    await expect(readBoundedBody(request, 5)).rejects.toMatchObject({ code: "PAYLOAD_LIMIT" });
  });
  it("accepts exact byte boundary and valid JSON without calling unbounded request.json", async () => {
    const bytes = new TextEncoder().encode('{"a":1}');
    const value = await readBoundedJson(new Request("http://127.0.0.1/request", { method: "POST", body: bytes }), bytes.length);
    expect(value).toEqual({ a: 1 });
  });
  it("maps malformed JSON to a safe400 and valid-shape errors to422", async () => {
    let failure: unknown;
    try { await readBoundedJson(new Request("http://127.0.0.1/request", { method: "POST", body: '{"private":' }), 100); } catch (error) { failure = error; }
    const response = createOperationErrorResponse(failure, operationId)!;
    expect(response.status).toBe(400); expect((await response.json()).code).toBe("VALIDATION_ERROR");
    expect(createOperationErrorResponse(new OperationError("VALIDATION_ERROR"), operationId)!.status).toBe(422);
  });
  it("parses multipart only after full bounded bytes, preserving file as data rather than a path", async () => {
    const form = new FormData(); form.append("image", new Blob([new Uint8Array([1, 2, 3])], { type: "image/jpeg" }), "../private.jpg");
    const request = new Request("http://127.0.0.1/request", { method: "POST", body: form });
    await expect(readBoundedMultipart(request.clone(), 10)).rejects.toMatchObject({ code: "PAYLOAD_LIMIT" });
    const parsed = await readBoundedMultipart(request, 10000);
    expect((parsed.get("image") as File).size).toBe(3);
  });
  it("aborts an actual pending body read and cancels its stream", async () => {
    const caller = new AbortController(); let cancelled = false;
    const body = new ReadableStream<Uint8Array>({ cancel() { cancelled = true; } });
    const request = new Request("http://127.0.0.1/request", { method: "POST", body, signal: caller.signal, duplex: "half" } as RequestInit);
    const pending = readBoundedBody(request, 100); caller.abort();
    await expect(pending).rejects.toMatchObject({ name: "CallerCancelledError" });
    expect(cancelled).toBe(true);
  });
});
