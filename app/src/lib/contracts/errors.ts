import { z } from "zod";

export const ERROR_CODES = Object.freeze([
  "VALIDATION_ERROR", "INVALID_IMAGE", "STALE_ANALYSIS", "PAYLOAD_LIMIT", "IMAGE_PROCESSING_LIMIT", "IMAGE_PROCESSING_ERROR",
  "POLICY_VERSION_UNAVAILABLE", "CONTEXT_LIMIT", "CONFIGURATION_ERROR", "POLICY_CONFIGURATION_ERROR",
  "PROVIDER_ERROR", "PROVIDER_AUTH_ERROR", "INVALID_AI_OUTPUT", "PROVIDER_QUOTA_OR_RATE_LIMIT", "OPERATION_TIMEOUT",
] as const);
export type ErrorCode = (typeof ERROR_CODES)[number];
export type FieldErrors = Record<string, string[]>;
export const ERROR_DEFINITIONS = Object.freeze({
  VALIDATION_ERROR: Object.freeze({ status: 422, retryable: false, message: "Popraw zaznaczone pola formularza." }),
  INVALID_IMAGE: Object.freeze({ status: 422, retryable: false, message: "Nie można odczytać obrazu. Wybierz inny plik." }),
  STALE_ANALYSIS: Object.freeze({ status: 422, retryable: false, message: "Dane zmieniły się od ostatniej analizy. Wykonaj analizę ponownie." }),
  PAYLOAD_LIMIT: Object.freeze({ status: 413, retryable: false, message: "Przesłane dane są zbyt duże. Zmniejsz plik lub treść." }),
  IMAGE_PROCESSING_LIMIT: Object.freeze({ status: 413, retryable: false, message: "Obraz przekracza limit przetwarzania. Wybierz mniejszy obraz." }),
  IMAGE_PROCESSING_ERROR: Object.freeze({ status: 500, retryable: true, message: "Nie udało się przygotować obrazu. Spróbuj ponownie." }),
  POLICY_VERSION_UNAVAILABLE: Object.freeze({ status: 409, retryable: false, message: "Ta wersja regulaminu jest niedostępna. Rozpocznij nową sprawę." }),
  CONTEXT_LIMIT: Object.freeze({ status: 422, retryable: false, message: "Sprawa osiągnęła limit kontekstu i nie może przyjąć kolejnej wiadomości. Pełna historia pozostaje zachowana. Rozpocznij nową sprawę." }),
  CONFIGURATION_ERROR: Object.freeze({ status: 500, retryable: true, message: "Usługa AI nie jest skonfigurowana. Po poprawieniu konfiguracji możesz spróbować ponownie." }),
  POLICY_CONFIGURATION_ERROR: Object.freeze({ status: 500, retryable: false, message: "Nie można wczytać regulaminu. Po przywróceniu zasobów rozpocznij nową sprawę." }),
  PROVIDER_ERROR: Object.freeze({ status: 502, retryable: true, message: "Usługa AI jest chwilowo niedostępna. Spróbuj ponownie." }),
  PROVIDER_AUTH_ERROR: Object.freeze({ status: 502, retryable: true, message: "Nie można uwierzytelnić usługi AI. Po poprawieniu konfiguracji możesz spróbować ponownie." }),
  INVALID_AI_OUTPUT: Object.freeze({ status: 502, retryable: true, message: "Odpowiedź AI jest niepoprawna. Spróbuj ponownie." }),
  PROVIDER_QUOTA_OR_RATE_LIMIT: Object.freeze({ status: 503, retryable: true, message: "Usługa AI osiągnęła limit zapytań lub dostępnych środków. Spróbuj ponownie później." }),
  OPERATION_TIMEOUT: Object.freeze({ status: 504, retryable: true, message: "Przekroczono czas operacji. Spróbuj ponownie." }),
});

export const errorEnvelopeSchema = z.object({
  code: z.enum(ERROR_CODES), message: z.string().min(1), retryable: z.boolean(),
  operationId: z.uuid(), fieldErrors: z.record(z.string(), z.array(z.string())).optional(),
});
export type ErrorEnvelope = z.infer<typeof errorEnvelopeSchema>;

export function createErrorEnvelope(code: ErrorCode, options: { operationId: string; fieldErrors?: FieldErrors }): ErrorEnvelope {
  const definition = ERROR_DEFINITIONS[code];
  return errorEnvelopeSchema.parse({ code, message: definition.message, retryable: definition.retryable, operationId: options.operationId,
    ...(options.fieldErrors ? { fieldErrors: options.fieldErrors } : {}),
  });
}

export function getErrorStatus(code: ErrorCode, options: { malformedInput?: boolean } = {}): number {
  if (options.malformedInput) {
    if (code !== "VALIDATION_ERROR") throw new RangeError("Tylko błąd składni wejścia może otrzymać status 400.");
    return 400;
  }
  return ERROR_DEFINITIONS[code].status;
}
