import "server-only";
import { randomUUID } from "node:crypto";
import { createOperationDeadline } from "@/server/ai/deadline";
import { createOperationErrorResponse, OperationError } from "@/server/http/errors";
import { BODY_LIMITS, readBoundedMultipart } from "@/server/http/request-reader";
import { prepareImage } from "@/server/images/prepare-image";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  const operationId = randomUUID();
  const deadline = createOperationDeadline("prepare", undefined, request.signal);
  let abortRead: (() => void) | undefined;
  const checkpoint = () => {
    if (deadline.signal.aborted) throw deadline.signal.reason;
    if (deadline.remainingMs() === 0) throw new OperationError("OPERATION_TIMEOUT");
  };
  try {
    checkpoint();
    if (!/^multipart\/form-data(?:;|$)/i.test(request.headers.get("content-type") ?? "")) {
      throw new OperationError("VALIDATION_ERROR", { malformedInput: true });
    }
    // Next may expose a proxied NextRequest that cannot be copied as a native Request input.
    // Transfer its stream explicitly, preserving bounded reads and the operation abort signal.
    const init: RequestInit & { duplex: "half" } = {
      method: request.method, headers: request.headers, body: request.body,
      signal: deadline.signal, duplex: "half",
    };
    const boundedRequest = new Request(request.url, init);
    const interrupted = new Promise<never>((_, reject) => {
      abortRead = () => reject(deadline.signal.reason);
      deadline.signal.addEventListener("abort", abortRead, { once: true });
      if (deadline.signal.aborted) abortRead();
    });
    // Some stream adapters cannot finish an outstanding read when cancellation is requested.
    // The bounded reader still receives cancellation; the operation need not wait for that adapter.
    const form = await Promise.race([readBoundedMultipart(boundedRequest, BODY_LIMITS.prepare), interrupted]);
    checkpoint();
    const entries = [...form.entries()];
    if (entries.length !== 1 || entries[0][0] !== "image" || !(entries[0][1] instanceof File)) {
      throw new OperationError("INVALID_IMAGE");
    }
    const file = entries[0][1];
    if (file.size > 10000000) throw new OperationError("PAYLOAD_LIMIT");
    const input = Buffer.from(await file.arrayBuffer());
    checkpoint();
    const prepared = await prepareImage(input, { signal: deadline.signal, remainingBudgetMs: deadline.remainingMs() });
    checkpoint();
    return Response.json(prepared, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const response = createOperationErrorResponse(error, operationId, { callerSignal: request.signal, deadlineSignal: deadline.signal });
    if (response) return response;
    // Transport cleanup for an actually cancelled caller; this is not an application error or success.
    if (request.signal.aborted) return new Response(null, { status: 408, headers: { "Cache-Control": "no-store" } });
    return createOperationErrorResponse(new OperationError("IMAGE_PROCESSING_ERROR"), operationId)!;
  } finally {
    if (abortRead) deadline.signal.removeEventListener("abort", abortRead);
    deadline.dispose();
  }
}
