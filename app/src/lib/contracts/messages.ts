import { z } from "zod";
import type { UIMessage, UIMessageStreamOutcome } from "ai";

export const MESSAGE_CONTRACT_REVISION = 1 as const;
export const MAX_USER_MESSAGE_CHARACTERS = 4000;
export const MAX_ASSISTANT_MESSAGE_CHARACTERS = 32000;
export const MAX_USER_TURNS = 40;
export const messageIdSchema = z.string().refine(value => value.trim().length > 0);
export const FINISH_REASONS = Object.freeze(["stop", "length", "content-filter", "tool-calls", "error", "other", "aborted", "disconnected", "unknown"] as const);
export const terminalMetadataSchema = z.strictObject({ operationId: z.uuid(), finishReason: z.enum(FINISH_REASONS), completionState: z.enum(["complete", "incomplete"]), retryable: z.boolean().optional() }).superRefine((value, context) => {
  if (value.completionState === "complete" && value.finishReason !== "stop") context.addIssue({ code: "custom", path: ["completionState"], message: "Odpowiedź nie została ukończona." });
});
export type TerminalMetadata = z.infer<typeof terminalMetadataSchema>;
export const textPartSchema = z.strictObject({ type: z.literal("text"), text: z.string(), state: z.enum(["streaming", "done"]).optional() });
export const caseMessageSchema = z.strictObject({ id: messageIdSchema, role: z.enum(["user", "assistant"]), parts: z.array(textPartSchema), metadata: terminalMetadataSchema.optional() }).superRefine((message, context) => {
  const text = message.parts.map(part => part.text).join("");
  if (message.role === "user" && text.trim().length === 0) context.addIssue({ code: "custom", path: ["parts"], message: "Wpisz wiadomość." });
  const limit = message.role === "user" ? MAX_USER_MESSAGE_CHARACTERS : MAX_ASSISTANT_MESSAGE_CHARACTERS;
  if ((message.role === "user" ? text.trim().length : text.length) > limit) context.addIssue({ code: "custom", path: ["parts"], message: "Historia przekracza limit kontekstu.", params: { contextLimit: true } });
});
export type CaseMessage = z.infer<typeof caseMessageSchema>;
// A narrower text-only subtype remains assignable to SDK UIMessage without runtime SDK imports.
export type CaseUIMessage = UIMessage<TerminalMetadata> & CaseMessage;
export const REPLY_STATES = Object.freeze(["complete", "streaming", "failed", "interrupted"] as const);
export const replyStateSchema = z.enum(REPLY_STATES);
export type ReplyState = z.infer<typeof replyStateSchema>;
export const displayMessagesSchema = z.array(caseMessageSchema).superRefine((messages, context) => {
  if (new Set(messages.map(message => message.id)).size !== messages.length) context.addIssue({ code: "custom", message: "Identyfikatory wiadomości muszą być unikalne." });
});
export const eligibleHistorySchema = displayMessagesSchema.superRefine((messages, context) => {
  if (messages[0]?.role !== "assistant") context.addIssue({ code: "custom", path: [0], message: "Brakuje pełnej oceny początkowej." });
  if (messages.at(-1)?.role !== "user") context.addIssue({ code: "custom", message: "Brakuje oczekującej wiadomości pracownika." });
  messages.forEach((message, index) => {
    if (message.role === "assistant" && (!message.parts.map(part => part.text).join("").trim() || message.metadata?.completionState === "incomplete" || message.parts.some(part => part.state === "streaming"))) context.addIssue({ code: "custom", path: [index], message: "Niepełna odpowiedź nie może być kontekstem modelu." });
  });
  if (messages.filter(message => message.role === "user").length > MAX_USER_TURNS) context.addIssue({ code: "custom", message: "Sprawa osiągnęła limit kontekstu.", params: { contextLimit: true } });
});
export function isReplyComplete(metadata: unknown, outcome: Pick<UIMessageStreamOutcome, "status">, lifecycle: { aborted?: boolean; disconnected?: boolean } = {}): boolean {
  const parsed = terminalMetadataSchema.safeParse(metadata);
  return parsed.success && parsed.data.finishReason === "stop" && parsed.data.completionState === "complete" && outcome.status === "completed" && !lifecycle.aborted && !lifecycle.disconnected;
}
export function getEligibleHistory(messages: unknown, states: Record<string, ReplyState>) {
  return displayMessagesSchema.parse(messages).filter(message => message.role === "user" || (states[message.id] === "complete" && message.metadata?.completionState !== "incomplete" && !message.parts.some(part => part.state === "streaming"))).map(message => ({ id: message.id, role: message.role, parts: message.parts.map(part => ({ type: "text" as const, text: part.text })) }));
}
// B03/B08 map these tagged issues to CONTEXT_LIMIT, preserving all history. Other shape failures are validation errors.
export function isContextLimitError(error: z.ZodError): boolean {
  return error.issues.some(issue => issue.code === "custom" && issue.params?.contextLimit === true);
}
