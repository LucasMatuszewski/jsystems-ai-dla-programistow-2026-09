import type { UIMessage } from "ai";
import type { ActiveCaseSnapshot } from "@/lib/contracts/session";
import { DefaultChatTransport } from "ai";
import { displayMessagesSchema, getEligibleHistory, isContextLimitError } from "@/lib/contracts/messages";
import { z } from "zod";
import { createChatRequestSchema } from "@/lib/contracts/requests";
import { ERROR_DEFINITIONS, errorEnvelopeSchema } from "@/lib/contracts/errors";

// SDK step boundaries and text provider annotations are technical, never case
// content. Allowlist text fields; reject other part types instead of dropping them.
export function projectChatMessages(messages: UIMessage[]) {
  return displayMessagesSchema.parse(messages.map(message => ({
    id: message.id, role: message.role,
    parts: message.parts.filter(part => part.type !== "step-start").map(part => part.type === "text"
      ? { type: "text", text: part.text, ...(part.state !== undefined ? { state: part.state } : {}) }
      : part),
    ...(message.metadata !== undefined ? { metadata: message.metadata } : {}),
  })));
}
export function prepareChatBody(snapshot: ActiveCaseSnapshot, messages: UIMessage[], operationId: string, replyMessageId: string, trigger: "submit-message" | "regenerate-message") {
  const body = { id: snapshot.caseId, operationId, replyMessageId, trigger: trigger === "submit-message" ? "send-message" : trigger,
    caseContext: { form: snapshot.submittedForm, timeZone: snapshot.timeZone, imageAnalysis: snapshot.imageAnalysis, initialDecision: snapshot.initialDecision },
    messages: getEligibleHistory(projectChatMessages(messages), snapshot.replyStates),
  };
  return createChatRequestSchema().parse(body);
}
export function safeChatError(error: unknown, operationId: string) {
  let code: keyof typeof ERROR_DEFINITIONS = "PROVIDER_ERROR";
  if (error instanceof z.ZodError && isContextLimitError(error)) code = "CONTEXT_LIMIT";
  try {
    const parsed = errorEnvelopeSchema.safeParse(JSON.parse(error instanceof Error ? error.message : typeof error === "string" ? error : ""));
    if (parsed.success && parsed.data.operationId === operationId) code = parsed.data.code;
  } catch { /* Unknown errors use the canonical safe fallback. */ }
  const { message, retryable } = ERROR_DEFINITIONS[code];
  return { message, retryable };
}
export function createCaseChatTransport(readSnapshot: () => ActiveCaseSnapshot | null, readOperation: () => { operationId: string; replyMessageId: string } | null) {
  return new DefaultChatTransport({ api: "/api/chat", prepareSendMessagesRequest: ({ id, messages, trigger }) => {
    const snapshot = readSnapshot(); const operation = readOperation();
    if (!snapshot || snapshot.caseId !== id || !operation) throw new Error(ERROR_DEFINITIONS.PROVIDER_ERROR.message);
    return { body: prepareChatBody(snapshot, messages, operation.operationId, operation.replyMessageId, trigger) };
  } });
}
