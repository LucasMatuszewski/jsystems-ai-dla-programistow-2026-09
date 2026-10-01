import { describe, expect, it } from "vitest";
import { ERROR_CODES, createErrorEnvelope, errorEnvelopeSchema, getErrorStatus } from "@/lib/contracts/errors";

const operationId = "129d4e48-1a61-4a99-b1ac-0d1ce4576c58";
const statuses = {
  VALIDATION_ERROR: 422, INVALID_IMAGE: 422, STALE_ANALYSIS: 422,
  PAYLOAD_LIMIT: 413, IMAGE_PROCESSING_LIMIT: 413, POLICY_VERSION_UNAVAILABLE: 409,
  CONTEXT_LIMIT: 422, CONFIGURATION_ERROR: 500, POLICY_CONFIGURATION_ERROR: 500,
  PROVIDER_ERROR: 502, PROVIDER_AUTH_ERROR: 502, INVALID_AI_OUTPUT: 502,
  PROVIDER_QUOTA_OR_RATE_LIMIT: 503, OPERATION_TIMEOUT: 504,
} as const;
const retryableCodes = ["CONFIGURATION_ERROR", "PROVIDER_ERROR", "PROVIDER_AUTH_ERROR", "INVALID_AI_OUTPUT", "PROVIDER_QUOTA_OR_RATE_LIMIT", "OPERATION_TIMEOUT"];

describe("operational error contract", () => {
  it("exports only the exact operational codes", () => {
    expect(ERROR_CODES).toEqual(Object.keys(statuses));
  });
  it.each(Object.entries(statuses))("maps %s to %s without provider details", (code, status) => {
    expect(getErrorStatus(code as keyof typeof statuses)).toBe(status);
  });
  it("uses 400 only for explicitly malformed validation input", () => {
    expect(getErrorStatus("VALIDATION_ERROR", { malformedInput: true })).toBe(400);
    expect(() => getErrorStatus("PROVIDER_ERROR", { malformedInput: true })).toThrow(RangeError);
  });
  it.each(Object.keys(statuses))("creates a localized safe %s envelope with manual retry semantics", (code) => {
    const envelope = createErrorEnvelope(code as keyof typeof statuses, { operationId });
    expect(envelope.code).toBe(code);
    expect(envelope.operationId).toBe(operationId);
    expect(envelope.retryable).toBe(retryableCodes.includes(code));
    // Polish messages may correctly contain no accented characters.
    expect(envelope.message).toMatch(/formularza|przetwarzania|[ąćęłńóśźż]/i);
    expect(Object.keys(envelope).sort()).toEqual(["code", "message", "operationId", "retryable"]);
  });
  it("associates field errors but never copies arbitrary provider or input properties", () => {
    const input = {
      operationId, fieldErrors: { equipmentName: ["Podaj nazwę sprzętu."] },
      message: "secret-provider-body", providerBody: "secret-provider-body", prompt: "secret-prompt", image: "secret-image",
    };
    const envelope = createErrorEnvelope("VALIDATION_ERROR", input);
    expect(envelope.fieldErrors).toEqual(input.fieldErrors);
    expect(JSON.stringify(envelope)).not.toMatch(/secret-/);
    expect(Object.keys(envelope).sort()).toEqual(["code", "fieldErrors", "message", "operationId", "retryable"]);
  });
  it.each(["", "operation-1", undefined])("rejects a non-UUID operation identity %s", (invalidId) => {
    expect(errorEnvelopeSchema.safeParse({ code: "PROVIDER_ERROR", message: "Błąd usługi.", retryable: true, operationId: invalidId }).success).toBe(false);
  });
  it("requires recognized code, message and boolean retry marker", () => {
    const valid = createErrorEnvelope("PROVIDER_ERROR", { operationId });
    expect(errorEnvelopeSchema.safeParse(valid).success).toBe(true);
    expect(errorEnvelopeSchema.safeParse({ ...valid, code: "POLICY_REFUSAL" }).success).toBe(false);
    expect(errorEnvelopeSchema.safeParse({ ...valid, retryable: "true" }).success).toBe(false);
    expect(errorEnvelopeSchema.safeParse({ ...valid, message: "" }).success).toBe(false);
  });
  it("explains the context terminal condition without suggesting truncated history", () => {
    const envelope = createErrorEnvelope("CONTEXT_LIMIT", { operationId });
    expect(envelope.retryable).toBe(false);
    expect(envelope.message).toMatch(/nie może przyjąć kolejnej wiadomości/i);
    expect(envelope.message).toMatch(/pełna historia pozostaje zachowana/i);
    expect(envelope.message).toContain("Rozpocznij nową sprawę.");
    expect(envelope.message).not.toMatch(/skróć|streszcz|usuń/i);
  });
});
