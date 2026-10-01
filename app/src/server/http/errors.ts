import "server-only";
import { APICallError, NoObjectGeneratedError, NoOutputGeneratedError, TypeValidationError } from "ai";
import { z } from "zod";
import { createErrorEnvelope, getErrorStatus, type ErrorCode, type FieldErrors } from "../../lib/contracts/errors";
import { isContextLimitError } from "../../lib/contracts/messages";
import { PolicyResourceError } from "../policies/registry";
export class OperationError extends Error {
  constructor(public readonly code: ErrorCode, public readonly options: { malformedInput?: boolean; fieldErrors?: FieldErrors } = {}) { super(code); }
}
export class CallerCancelledError extends Error {
  constructor() { super("Operacja została przerwana."); this.name = "CallerCancelledError"; }
}
export interface ErrorContext { callerSignal?: AbortSignal; deadlineSignal?: AbortSignal; generatedInitialOutput?: boolean }
export type ErrorClassification = { kind: "cancelled" } | { kind: "error"; code: ErrorCode; malformedInput?: boolean; fieldErrors?: FieldErrors };
const safeFields: Record<string, readonly string[]> = {
  scenario: ["Wybierz rodzaj sprawy."], category: ["Wybierz kategorię sprzętu."],
  equipmentName: ["Podaj nazwę sprzętu.", "Nazwa sprzętu może mieć maksymalnie 200 znaków."],
  purchaseDate: ["Podaj poprawną datę zakupu.", "Data zakupu nie może być późniejsza niż dzisiaj."],
  deliveryDate: ["Podaj poprawną datę dostarczenia lub wybierz Nie wiem.", "Data dostarczenia nie może być wcześniejsza niż data zakupu.", "Data dostarczenia nie może być późniejsza niż dzisiaj."],
  buyerStatus: ["Wybierz status kupującego."], sellerStatus: ["Wybierz status sprzedawcy."],
  reason: ["Podaj przyczynę zgłoszenia.", "Podaj przyczynę reklamacji.", "Przyczyna może mieć maksymalnie 4000 znaków."],
  requestedRemedy: ["Wybierz oczekiwane rozwiązanie lub Nie wiem."],
};
function safeFieldErrors(input: FieldErrors | undefined): FieldErrors | undefined {
  if (!input) return undefined;
  const output: FieldErrors = {};
  for (const [field, allowed] of Object.entries(safeFields)) {
    const messages = input[field];
    if (Array.isArray(messages)) {
      const accepted = messages.filter(message => allowed.includes(message));
      if (accepted.length) output[field] = accepted;
    }
  }
  return Object.keys(output).length ? output : undefined;
}
export function classifyOperationError(error: unknown, context: ErrorContext = {}): ErrorClassification {
  // A real deadline takes precedence over a later caller abort; timeout is never misclassified as cancellation.
  if (context.deadlineSignal?.aborted && context.deadlineSignal.reason instanceof OperationError) return classifyOperationError(context.deadlineSignal.reason);
  if (error instanceof CallerCancelledError || context.callerSignal?.aborted) return { kind: "cancelled" };
  if (error instanceof OperationError) return { kind: "error", code: error.code, ...(error.options.malformedInput ? { malformedInput: true } : {}), ...(safeFieldErrors(error.options.fieldErrors) ? { fieldErrors: safeFieldErrors(error.options.fieldErrors) } : {}) };
  if (error instanceof PolicyResourceError) return { kind: "error", code: error.code };
  if (error instanceof z.ZodError) return { kind: "error", code: context.generatedInitialOutput ? "INVALID_AI_OUTPUT" : isContextLimitError(error) ? "CONTEXT_LIMIT" : "VALIDATION_ERROR" };
  if (NoObjectGeneratedError.isInstance(error) || NoOutputGeneratedError.isInstance(error) || TypeValidationError.isInstance(error)) return { kind: "error", code: "INVALID_AI_OUTPUT" };
  if (APICallError.isInstance(error)) {
    const code = error.statusCode === 401 || error.statusCode === 403 ? "PROVIDER_AUTH_ERROR" : error.statusCode === 402 || error.statusCode === 429 ? "PROVIDER_QUOTA_OR_RATE_LIMIT" : "PROVIDER_ERROR";
    return { kind: "error", code };
  }
  return { kind: "error", code: "PROVIDER_ERROR" };
}
// null means no error envelope for a disconnected/cancelled caller, not a successful route response.
export function createOperationErrorResponse(error: unknown, operationId: string, context: ErrorContext = {}): Response | null {
  const classified = classifyOperationError(error, context);
  if (classified.kind === "cancelled") return null;
  return Response.json(createErrorEnvelope(classified.code, { operationId, fieldErrors: classified.fieldErrors }), { status: getErrorStatus(classified.code, { malformedInput: classified.malformedInput }), headers: { "Cache-Control": "no-store" } });
}
