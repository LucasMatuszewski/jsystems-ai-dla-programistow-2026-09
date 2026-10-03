import "server-only";
import { CallerCancelledError, OperationError } from "./errors";
export const BODY_LIMITS = Object.freeze({ prepare: 10065536, analysis: 6000000, decision: 65536, chat: 300000 });
export async function readBoundedBody(request: Request, maxBytes: number): Promise<Buffer> {
  if (!Number.isInteger(maxBytes) || maxBytes < 1) throw new RangeError("Nieprawidłowy limit danych.");
  if (request.signal.aborted) throw new CallerCancelledError();
  const declared = request.headers.get("content-length");
  if (declared && /^\d+$/.test(declared) && Number(declared) > maxBytes) {
    void request.body?.cancel().catch(() => {}); throw new OperationError("PAYLOAD_LIMIT");
  }
  if (!request.body) return Buffer.alloc(0);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = []; let length = 0;
  const abort = () => { void reader.cancel().catch(() => {}); };
  request.signal.addEventListener("abort", abort, { once: true });
  try {
    while (true) {
      if (request.signal.aborted) throw new CallerCancelledError();
      const next = await reader.read();
      if (request.signal.aborted) throw new CallerCancelledError();
      if (next.done) break;
      length += next.value.byteLength;
      // Tee'd Request clones may wait for their other branch before cancellation resolves.
      // Reject the bounded read immediately; cancellation remains observed without unhandled rejection.
      if (length > maxBytes) { void reader.cancel().catch(() => {}); throw new OperationError("PAYLOAD_LIMIT"); }
      chunks.push(next.value);
    }
    return Buffer.concat(chunks, length);
  } finally { request.signal.removeEventListener("abort", abort); reader.releaseLock(); }
}
export async function readBoundedJson(request: Request, maxBytes: number): Promise<unknown> {
  const body = await readBoundedBody(request, maxBytes);
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(body)); }
  catch { throw new OperationError("VALIDATION_ERROR", { malformedInput: true }); }
}
export async function readBoundedMultipart(request: Request, maxBytes: number): Promise<FormData> {
  const body = await readBoundedBody(request, maxBytes);
  try {
    return await new Request(request.url, { method: "POST", headers: { "Content-Type": request.headers.get("content-type") ?? "" }, body: new Uint8Array(body) }).formData();
  } catch { throw new OperationError("VALIDATION_ERROR", { malformedInput: true }); }
}
