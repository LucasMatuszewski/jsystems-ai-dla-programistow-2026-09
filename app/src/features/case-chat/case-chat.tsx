"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import type { UIMessage } from "ai";
import type { ActiveCaseSnapshot } from "@/lib/contracts/session";
import { caseMessageSchema, MAX_USER_MESSAGE_CHARACTERS, terminalMetadataSchema, type ReplyState } from "@/lib/contracts/messages";
import { ERROR_DEFINITIONS } from "@/lib/contracts/errors";
import { Conversation, ConversationContent } from "@/components/ai-elements/conversation";
import { Message, MessageContent } from "@/components/ai-elements/message";
import { PromptInput, PromptInputBody, PromptInputTextarea, PromptInputFooter, PromptInputSubmit, type PromptInputMessage } from "@/components/ai-elements/prompt-input";
import { InitialDecisionDetails } from "./initial-decision-details";
import { ChatMessageView } from "./chat-message-view";
import { createCaseChatTransport, projectChatMessages, safeChatError } from "./chat-transport";
import { retryTurn } from "./reply-lifecycle";
import { ReplyStatus } from "./reply-status";
export type ChatCheckpoint = Pick<ActiveCaseSnapshot, "messages" | "replyStates" | "pendingOperation" | "stageStatus">;
export type CaseChatProps = { initialSnapshot: ActiveCaseSnapshot; readSnapshot: () => ActiveCaseSnapshot | null; checkpoint: (changes: ChatCheckpoint, kind: "immediate" | "stream") => boolean; registerCancellation: (cancel: () => void) => () => void };
type Operation = Extract<NonNullable<ActiveCaseSnapshot["pendingOperation"]>, { kind: "chat" }> & { errorSeen: boolean; failureRetryable: boolean | null };
export function CaseChat(props: CaseChatProps) {
  const bindings = useRef(props);
  const operation = useRef<Operation | null>(null);
  const canonicalMessages = useRef<UIMessage[]>(props.initialSnapshot.messages);
  const active = useRef(true);
  const activeAttempt = useRef<object | null>(null);
  const attemptSettled = useRef(true);
  const setMessagesRef = useRef<(messages: UIMessage[]) => void>(() => {});
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const retryButtonRef = useRef<HTMLButtonElement>(null);
  const restoreInputFocus = useRef(false);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [attemptReady, setAttemptReady] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [replyStates, setReplyStates] = useState(props.initialSnapshot.replyStates);
  useEffect(() => { bindings.current = props; }, [props]);
  const readCurrentSnapshot = useCallback(() => bindings.current.readSnapshot(), []);
  const readCurrentOperation = useCallback(() => operation.current, []);
  // Construction stores these getters; only the later HTTP request invokes them.
  // eslint-disable-next-line react-hooks/refs
  const [transport] = useState(() => createCaseChatTransport(readCurrentSnapshot, readCurrentOperation));

  const finish = useCallback((messages: UIMessage[], state: ReplyState, metadata?: unknown) => {
    const currentOperation = operation.current;
    const snapshot = bindings.current.readSnapshot();
    if (!active.current || !currentOperation || !snapshot || snapshot.caseId !== bindings.current.initialSnapshot.caseId) return;
    let projected;
    try { projected = projectChatMessages(messages); } catch { projected = snapshot.messages; state = "failed"; }
    let reply = projected.find(message => message.id === currentOperation.replyMessageId && message.role === "assistant");
    if (!reply) {
      reply = { id: currentOperation.replyMessageId, role: "assistant", parts: [] };
      projected = [...projected, reply];
    }
    if (reply) {
      // An interrupted or erroneous reply may carry an upstream success marker.
      // Persist truthful app metadata instead of promoting that marker on reload.
      reply.metadata = state === "complete" ? terminalMetadataSchema.parse(metadata) : { operationId: currentOperation.operationId, finishReason: state === "interrupted" ? "aborted" : "error", completionState: "incomplete", retryable: state === "interrupted" ? true : currentOperation.failureRetryable ?? true };
      reply.parts = reply.parts.map(part => ({ ...part, state: "done" }));
    }
    const states = { ...snapshot.replyStates, ...(reply ? { [reply.id]: state } : {}) };
    const accepted = bindings.current.checkpoint({ messages: projected, replyStates: states, pendingOperation: null, stageStatus: state === "interrupted" ? "interrupted" : "idle" }, "immediate");
    operation.current = null;
    if (accepted) { canonicalMessages.current = projected; setMessagesRef.current(projected); restoreInputFocus.current = true; setReplyStates(states); setPending(false); }
  }, []);

  const { messages, sendMessage, regenerate, setMessages, stop, status } = useChat<UIMessage>({
    id: props.initialSnapshot.caseId, messages: props.initialSnapshot.messages, transport,
    messageMetadataSchema: terminalMetadataSchema,
    onError: failure => {
      const currentOperation = operation.current;
      if (!active.current || !currentOperation) return;
      currentOperation.errorSeen = true;
      const safeError = safeChatError(failure, currentOperation.operationId);
      currentOperation.failureRetryable = safeError.retryable;
      setError(safeError.message);
    },
    onFinish: event => {
      const currentOperation = operation.current;
      if (!active.current || !currentOperation || event.message.id !== currentOperation.replyMessageId) return;
      const terminal = terminalMetadataSchema.safeParse(event.message.metadata);
      if (terminal.success && terminal.data.operationId !== currentOperation.operationId) return;
      const complete = terminal.success && terminal.data.operationId === currentOperation.operationId && event.message.id === currentOperation.replyMessageId && terminal.data.completionState === "complete" && terminal.data.finishReason === "stop" && !event.isAbort && !event.isDisconnect && !event.isError && !currentOperation.errorSeen && caseMessageSchema.safeParse(projectChatMessages([event.message])[0]).success && event.message.parts.some(part => part.type === "text" && part.text.trim());
      finish(event.messages, complete ? "complete" : event.isAbort ? "interrupted" : "failed", terminal.success ? terminal.data : undefined);
      if (!complete && !event.isAbort) setError(previous => previous ?? ERROR_DEFINITIONS.INVALID_AI_OUTPUT.message);
    },
  });
  const pendingRetry = retryTurn(messages, replyStates);
  const retryMessageId = pendingRetry?.replyMessageId;
  useEffect(() => { setMessagesRef.current = setMessages; }, [setMessages]);
  const cancel = useCallback(() => {
    if (operation.current) { finish(bindings.current.readSnapshot()?.messages ?? canonicalMessages.current, "interrupted"); void stop(); }
  }, [finish, stop]);

  const registerCancellation = props.registerCancellation;
  useEffect(() => {
    active.current = true;
    const unregister = registerCancellation(cancel);
    return () => { cancel(); active.current = false; unregister(); };
  }, [registerCancellation, cancel]);

  useEffect(() => {
    canonicalMessages.current = messages;
    const currentOperation = operation.current;
    const snapshot = bindings.current.readSnapshot();
    if (!active.current || !currentOperation || !snapshot) return;
    let projected;
    try { projected = projectChatMessages(messages); } catch { return; }
    // The SDK owner is the source. This is a persisted projection, never another
    // reactive message store. User preservation occurs synchronously on submit.
    const reply = projected.find(message => message.id === currentOperation.replyMessageId && message.role === "assistant");
    const states = { ...snapshot.replyStates, ...(reply ? { [reply.id]: "streaming" as const } : {}) };
    const { errorSeen: discarded, failureRetryable: discardedRetryability, ...savedOperation } = currentOperation; void discarded; void discardedRetryability;
    bindings.current.checkpoint({ messages: projected, replyStates: states, pendingOperation: savedOperation, stageStatus: "pending" }, "stream");
  }, [messages]);
  useEffect(() => {
    if (!pending && restoreInputFocus.current && (!retryMessageId || attemptReady)) {
      restoreInputFocus.current = false;
      if (retryMessageId) retryButtonRef.current?.focus(); else inputRef.current?.focus();
    }
  }, [pending, error, attemptReady, retryMessageId]);

  async function submit(message: PromptInputMessage) {
    if (operation.current || pending || pendingRetry || terminalError || status === "submitted" || status === "streaming") return;
    const text = message.text.trim();
    if (!text) { setError("Wpisz wiadomość."); return; }
    if (text.length > MAX_USER_MESSAGE_CHARACTERS) { setError(ERROR_DEFINITIONS.CONTEXT_LIMIT.message); return; }
    const snapshot = bindings.current.readSnapshot();
    if (!active.current || !snapshot || snapshot.caseId !== props.initialSnapshot.caseId) return;
    const user = caseMessageSchema.parse({ id: crypto.randomUUID(), role: "user", parts: [{ type: "text", text }] });
    const nextOperation: Operation = { kind: "chat", operationId: crypto.randomUUID(), replyMessageId: crypto.randomUUID(), userMessageId: user.id, startedAt: new Date().toISOString(), errorSeen: false, failureRetryable: null };
    const { errorSeen: discarded, failureRetryable: discardedRetryability, ...savedOperation } = nextOperation; void discarded; void discardedRetryability;
    const projected = projectChatMessages([...messages, user]);
    if (!bindings.current.checkpoint({ messages: projected, replyStates: snapshot.replyStates, pendingOperation: savedOperation, stageStatus: "pending" }, "immediate")) return;
    operation.current = nextOperation;
    const attempt = {};
    activeAttempt.current = attempt;
    attemptSettled.current = false;
    setAttemptReady(false);
    setError(null); setInput(""); setPending(true);
    try { await sendMessage(user); }
    catch (failure) { if (operation.current === nextOperation) { const safeError = safeChatError(failure, nextOperation.operationId); nextOperation.failureRetryable = safeError.retryable; setError(safeError.message); } }
    // HTTP/transport failures can occur before SDK activeResponse exists, so
    // onFinish is not guaranteed. Preserve the already accepted user in that case.
    if (operation.current === nextOperation) {
      setError(previous => previous ?? ERROR_DEFINITIONS.PROVIDER_ERROR.message);
      finish(bindings.current.readSnapshot()?.messages ?? projected, "failed");
    }
    if (activeAttempt.current === attempt) { activeAttempt.current = null; attemptSettled.current = true; setAttemptReady(true); }
  }

  async function retry() {
    if (operation.current || pending || !attemptSettled.current) return;
    const snapshot = bindings.current.readSnapshot();
    const turn = retryTurn(messages, replyStates);
    if (!active.current || !snapshot || snapshot.caseId !== props.initialSnapshot.caseId || !turn) return;
    const nextOperation: Operation = { kind: "chat", operationId: crypto.randomUUID(), replyMessageId: turn.replyMessageId, userMessageId: turn.userMessageId, startedAt: new Date().toISOString(), errorSeen: false, failureRetryable: null };
    const { errorSeen: discarded, failureRetryable: discardedRetryability, ...savedOperation } = nextOperation; void discarded; void discardedRetryability;
    const projected = projectChatMessages(messages);
    const states = { ...snapshot.replyStates, [turn.replyMessageId]: "streaming" as const };
    if (!bindings.current.checkpoint({ messages: projected, replyStates: states, pendingOperation: savedOperation, stageStatus: "pending" }, "immediate")) return;
    operation.current = nextOperation;
    const attempt = {};
    activeAttempt.current = attempt;
    attemptSettled.current = false;
    setAttemptReady(false); setReplyStates(states); setError(null); setPending(true);
    try { await regenerate({ messageId: turn.replyMessageId }); }
    catch (failure) { if (operation.current === nextOperation) { const safeError = safeChatError(failure, nextOperation.operationId); nextOperation.failureRetryable = safeError.retryable; setError(safeError.message); } }
    if (operation.current === nextOperation) {
      setError(previous => previous ?? ERROR_DEFINITIONS.PROVIDER_ERROR.message);
      finish(bindings.current.readSnapshot()?.messages ?? projected, "failed");
    }
    if (activeAttempt.current === attempt) { activeAttempt.current = null; attemptSettled.current = true; setAttemptReady(true); }
  }

  const lastMessage = messages.at(-1);
  const lastMetadata = lastMessage?.role === "assistant" ? terminalMetadataSchema.safeParse(lastMessage.metadata) : null;
  const terminalError = lastMetadata?.success === true && lastMetadata.data.completionState === "incomplete" && lastMetadata.data.retryable === false;
  return <div className="grid min-w-0 gap-6">
    <Conversation aria-label="Rozmowa w sprawie" aria-live="off" className="min-w-0"><ConversationContent className="min-w-0 gap-6 p-0">
      {messages.map((message, index) => index === 0 ? <Message key={message.id} from="assistant" className="max-w-full min-w-0"><MessageContent className="w-full min-w-0"><InitialDecisionDetails decision={props.initialSnapshot.initialDecision!} /></MessageContent></Message> : <div key={message.id} className="grid min-w-0 gap-3"><ChatMessageView message={projectChatMessages([message])[0]} state={replyStates[message.id] ?? (pending ? "streaming" : "interrupted")} />{message.id === pendingRetry?.replyMessageId && <ReplyStatus buttonRef={retryButtonRef} waiting={!attemptReady} onRetry={() => { void retry(); }} />}</div>)}
    </ConversationContent></Conversation>
    <PromptInput textOnly onSubmit={submit}><PromptInputBody><PromptInputTextarea ref={inputRef} aria-label="Wiadomość" placeholder="Wpisz pytanie dotyczące tej sprawy" value={input} onChange={event => setInput(event.target.value)} disabled={pending || Boolean(pendingRetry) || terminalError} aria-describedby={error ? "chat-error" : undefined} /></PromptInputBody>
      <PromptInputFooter><PromptInputSubmit disabled={Boolean(pendingRetry) || terminalError} status={pending ? "streaming" : "ready"} onStop={cancel} aria-label={pending ? "Zatrzymaj odpowiedź" : "Wyślij wiadomość"} /></PromptInputFooter>
    </PromptInput>
    {pending && <p role="status" aria-live="polite">Trwa przygotowywanie odpowiedzi</p>}
    {error && <p id="chat-error" role="alert" className="border-l-4 border-primary bg-[#fff3e8] p-4">{error}</p>}
  </div>;
}
