import "server-only";
import { createChatRequestSchema, type ChatRequest } from "@/lib/contracts/requests";
import { isContextLimitError, type CaseMessage } from "@/lib/contracts/messages";
import { createFormFingerprint } from "./form-fingerprint";
import { OperationError } from "@/server/http/errors";

export function validateChatHistory(input: ChatRequest): CaseMessage[] {
  const parsed = createChatRequestSchema().safeParse(input);
  if (!parsed.success) throw new OperationError(isContextLimitError(parsed.error) ? "CONTEXT_LIMIT" : "VALIDATION_ERROR");
  if (parsed.data.caseContext.imageAnalysis.formFingerprint !== createFormFingerprint(parsed.data.caseContext.form)) throw new OperationError("VALIDATION_ERROR");
  // The client supplies eligible chronology. No trusted server store exists to prove
  // omitted turns or to reconstruct failed reply state; never silently filter history.
  return parsed.data.messages;
}
