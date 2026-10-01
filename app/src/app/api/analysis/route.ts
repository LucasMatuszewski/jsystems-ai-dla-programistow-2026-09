import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { createAnalysisRequestSchema } from "@/lib/contracts/requests";
import { createOperationDeadline } from "@/server/ai/deadline";
import { analyzeImage } from "@/server/ai/analyze-image";
import { createOperationErrorResponse, OperationError } from "@/server/http/errors";
import { BODY_LIMITS, readBoundedJson } from "@/server/http/request-reader";

export const runtime = "nodejs";
export async function POST(request: Request): Promise<Response> {
  let operationId: string = randomUUID();
  const started = performance.now();
  const deadline = createOperationDeadline("analysis", undefined, request.signal);
  let abortRead: (() => void) | undefined;
  const checkpoint = () => {
    if (deadline.signal.aborted) throw deadline.signal.reason;
    if (deadline.remainingMs() === 0) throw new OperationError("OPERATION_TIMEOUT");
  };
  try {
    checkpoint();
    if (!/^application\/json(?:;|$)/i.test(request.headers.get("content-type") ?? "")) throw new OperationError("VALIDATION_ERROR", { malformedInput: true });
    const init: RequestInit & { duplex: "half" } = { method: request.method, headers: request.headers, body: request.body, signal: deadline.signal, duplex: "half" };
    const interrupted = new Promise<never>((_, reject) => {
      abortRead = () => reject(deadline.signal.reason);
      deadline.signal.addEventListener("abort", abortRead, { once: true });
      if (deadline.signal.aborted) abortRead();
    });
    const raw = await Promise.race([readBoundedJson(new Request(request.url, init), BODY_LIMITS.analysis), interrupted]);
    checkpoint();
    if (raw && typeof raw === "object" && "operationId" in raw) {
      const identity = z.uuid().safeParse(raw.operationId);
      if (identity.success) operationId = identity.data;
    }
    const parsed = createAnalysisRequestSchema().safeParse(raw);
    if (!parsed.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of parsed.error.issues) {
        if (issue.path[0] === "form" && typeof issue.path[1] === "string") (fieldErrors[issue.path[1]] ??= []).push(issue.message);
      }
      throw new OperationError("VALIDATION_ERROR", { fieldErrors });
    }
    const remaining = Math.min(Math.floor(parsed.data.budgetMs - (performance.now() - started)), deadline.remainingMs());
    if (remaining <= 0) throw new OperationError("OPERATION_TIMEOUT");
    const analysis = await analyzeImage(parsed.data, { signal: deadline.signal, remainingBudgetMs: remaining });
    checkpoint();
    return Response.json(analysis, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const response = createOperationErrorResponse(error, operationId, { callerSignal: request.signal, deadlineSignal: deadline.signal });
    if (response) return response;
    if (request.signal.aborted) return new Response(null, { status: 408, headers: { "Cache-Control": "no-store" } });
    return createOperationErrorResponse(new OperationError("PROVIDER_ERROR"), operationId)!;
  } finally {
    if (abortRead) deadline.signal.removeEventListener("abort", abortRead);
    deadline.dispose();
  }
}
