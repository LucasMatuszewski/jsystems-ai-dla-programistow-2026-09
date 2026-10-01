import "server-only";
import { randomUUID } from "node:crypto";
import { createUIMessageStreamResponse } from "ai";
import { z } from "zod";
import { createChatRequestSchema } from "@/lib/contracts/requests";
import { chat } from "@/server/ai/chat";
import { createOperationDeadline } from "@/server/ai/deadline";
import { BODY_LIMITS, readBoundedJson } from "@/server/http/request-reader";
import { createOperationErrorResponse, OperationError } from "@/server/http/errors";
export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  let operationId: string = randomUUID();
  const deadline = createOperationDeadline("chat", undefined, request.signal);
  let abort: (() => void) | undefined;
  let streaming = false;
  const dispose = () => { if (abort) deadline.signal.removeEventListener("abort", abort); deadline.dispose(); };
  const checkpoint = () => {
    if (deadline.signal.aborted) throw deadline.signal.reason;
    if (deadline.remainingMs() === 0) throw new OperationError("OPERATION_TIMEOUT");
  };
  try {
    checkpoint();
    if (!/^application\/json(?:;|$)/i.test(request.headers.get("content-type") ?? "")) throw new OperationError("VALIDATION_ERROR", { malformedInput: true });
    // Explicit reconstruction also works with Next's request wrapper.
    const init: RequestInit & { duplex: "half" } = { method: request.method, headers: request.headers, body: request.body, signal: deadline.signal, duplex: "half" };
    const interrupted = new Promise<never>((_, reject) => {
      abort = () => reject(deadline.signal.reason);
      deadline.signal.addEventListener("abort", abort, { once: true });
      if (deadline.signal.aborted) abort();
    });
    void interrupted.catch(() => undefined);
    const raw = await Promise.race([readBoundedJson(new Request(request.url, init), BODY_LIMITS.chat), interrupted]);
    checkpoint();
    if (raw && typeof raw === "object" && "operationId" in raw) {
      const identity = z.uuid().safeParse(raw.operationId); if (identity.success) operationId = identity.data;
    }
    const input = createChatRequestSchema().parse(raw);
    const source = await Promise.race([chat(input, { signal: deadline.signal }), interrupted]);
    checkpoint();
    const reader = source.getReader();
    const stream = new ReadableStream({
      async pull(controller) {
        try {
          const next = await reader.read();
          if (next.done) { dispose(); controller.close(); }
          else controller.enqueue(next.value);
        } catch (error) { dispose(); controller.error(error); }
      },
      async cancel(reason) { dispose(); await reader.cancel(reason); },
    });
    streaming = true;
    return createUIMessageStreamResponse({ stream, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return createOperationErrorResponse(error, operationId, { callerSignal: request.signal, deadlineSignal: deadline.signal }) ?? new Response(null, { status: 408, headers: { "Cache-Control": "no-store" } });
  } finally { if (!streaming) dispose(); }
}
