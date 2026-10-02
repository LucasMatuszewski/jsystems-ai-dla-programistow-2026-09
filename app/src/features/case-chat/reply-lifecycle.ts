import type { UIMessage } from "ai";
import { terminalMetadataSchema, type ReplyState } from "@/lib/contracts/messages";
import { projectChatMessages } from "./chat-transport";

export function completedReply(message: UIMessage, operation: { operationId: string; replyMessageId: string; errorSeen: boolean }, outcome: { isAbort?: boolean; isDisconnect?: boolean; isError?: boolean }) {
  const terminal = terminalMetadataSchema.safeParse(message.metadata);
  if (!terminal.success || terminal.data.operationId !== operation.operationId || message.id !== operation.replyMessageId || terminal.data.completionState !== "complete" || terminal.data.finishReason !== "stop" || operation.errorSeen || outcome.isAbort || outcome.isDisconnect || outcome.isError) return false;
  try { return projectChatMessages([message])[0].parts.some(part => part.text.trim().length > 0); } catch { return false; }
}

export function retryTurn(messages: UIMessage[], states: Record<string, ReplyState>) {
  const reply = messages.at(-1); const user = messages.at(-2);
  if (!reply || reply.role !== "assistant" || !user || user.role !== "user" || !["failed", "interrupted"].includes(states[reply.id])) return null;
  const metadata = terminalMetadataSchema.safeParse(reply.metadata);
  if (!metadata.success || metadata.data.completionState !== "incomplete") return null;
  return { userMessageId: user.id, replyMessageId: reply.id, operationId: metadata.data.operationId };
}
