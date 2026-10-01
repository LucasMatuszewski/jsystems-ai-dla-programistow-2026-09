import { createAnalysisRequestSchema, createDecisionRequestSchema, storedInitialDecisionSchema, type AnalysisRequest, type DecisionRequest } from "@/lib/contracts/requests";
import { createImageAnalysisSchema, type ImageAnalysis } from "@/lib/contracts/analysis";
import type { InitialDecision } from "@/lib/contracts/decision";
import { createErrorEnvelope, errorEnvelopeSchema, type ErrorCode, type ErrorEnvelope } from "@/lib/contracts/errors";

export type InitialApiResult<T> = { status: "success"; value: T } | { status: "failed"; error: ErrorEnvelope } | { status: "aborted" };
export type InitialRequestOptions = { signal: AbortSignal };

const failed = (code: ErrorCode, operationId: string): InitialApiResult<never> => ({ status: "failed", error: createErrorEnvelope(code, { operationId }) });

async function postInitial<T>(url: string, request: AnalysisRequest | DecisionRequest, signal: AbortSignal, maxBytes: number, parse: (payload: unknown) => T | null): Promise<InitialApiResult<T>> {
  if (signal.aborted) return { status: "aborted" };
  const body = JSON.stringify(request);
  if (new Blob([body]).size > maxBytes) return failed("PAYLOAD_LIMIT", request.operationId);
  let successfulResponse = false;
  try {
    const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body, signal, cache: "no-store" });
    if (signal.aborted) return { status: "aborted" };
    successfulResponse = response.ok;
    const payload: unknown = await response.json();
    if (signal.aborted) return { status: "aborted" };
    if (!response.ok) {
      const error = errorEnvelopeSchema.safeParse(payload);
      return error.success && error.data.operationId === request.operationId ? { status: "failed", error: error.data } : failed("PROVIDER_ERROR", request.operationId);
    }
    const value = parse(payload);
    if (signal.aborted) return { status: "aborted" };
    return value === null ? failed("INVALID_AI_OUTPUT", request.operationId) : { status: "success", value };
  } catch (error) {
    if (signal.aborted || (error instanceof Error && error.name === "AbortError")) return { status: "aborted" };
    return failed(successfulResponse ? "INVALID_AI_OUTPUT" : "PROVIDER_ERROR", request.operationId);
  }
}

export async function analyzeInitialCase(request: AnalysisRequest, { signal }: InitialRequestOptions): Promise<InitialApiResult<ImageAnalysis>> {
  if (signal.aborted) return { status: "aborted" };
  if (new Blob([JSON.stringify(request)]).size > 6_000_000) return failed("PAYLOAD_LIMIT", request.operationId);
  const input = createAnalysisRequestSchema().safeParse(request);
  if (!input.success) return failed("VALIDATION_ERROR", request.operationId);
  return postInitial("/api/analysis", input.data, signal, 6_000_000, payload => {
    const parsed = createImageAnalysisSchema(input.data.form.scenario).safeParse(payload);
    return parsed.success && parsed.data.scenario === input.data.form.scenario && parsed.data.imageDigest === input.data.preparedImage.sha256 ? parsed.data : null;
  });
}

export async function decideInitialCase(request: DecisionRequest, { signal }: InitialRequestOptions): Promise<InitialApiResult<InitialDecision>> {
  if (signal.aborted) return { status: "aborted" };
  if (new Blob([JSON.stringify(request)]).size > 65_536) return failed("PAYLOAD_LIMIT", request.operationId);
  const input = createDecisionRequestSchema().safeParse(request);
  if (!input.success) return failed("VALIDATION_ERROR", request.operationId);
  return postInitial("/api/decisions", input.data, signal, 65_536, payload => {
    // The same-origin service owns the official allowlist and provenance. C03
    // validates the strict DTO and exact used/resolved reference set in-browser.
    const parsed = storedInitialDecisionSchema.safeParse(payload);
    return parsed.success && parsed.data.caseId === input.data.caseId && parsed.data.scenario === input.data.form.scenario ? parsed.data : null;
  });
}
