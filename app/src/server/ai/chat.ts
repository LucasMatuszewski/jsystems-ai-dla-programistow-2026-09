import "server-only";
import { convertToModelMessages, streamText, toUIMessageStream, type InferUIMessageChunk, type TextStreamPart, type ToolSet, type UIMessageStreamOnEndCallback } from "ai";
import type { ChatRequest } from "@/lib/contracts/requests";
import { caseMessageSchema, type CaseUIMessage, type TerminalMetadata } from "@/lib/contracts/messages";
import { createErrorEnvelope, type ErrorCode } from "@/lib/contracts/errors";
import { buildChatPrompt, MAX_PROMPT_TEXT_BYTES } from "@/server/prompts/builder";
import { validateChatHistory } from "@/server/cases/chat-history";
import { CallerCancelledError, classifyOperationError, OperationError } from "@/server/http/errors";
import { getAiConfiguration } from "./configuration";
import { createAiStageOptions } from "./provider";
import { recordCompletedGeneration, recordOperationDiagnostic } from "./diagnostics";

type Chunk = InferUIMessageChunk<CaseUIMessage>;
type End = Parameters<UIMessageStreamOnEndCallback<CaseUIMessage>>[0];
const modelParts = new Set(["start", "start-step", "text-start", "text-delta", "text-end", "finish-step", "finish", "error", "abort"]);

// The route owns the one global deadline. This controller only propagates that
// signal and consumer cancellation to the actual provider; it starts no new timer.
export async function chat(input: ChatRequest, options: { signal: AbortSignal }): Promise<ReadableStream<InferUIMessageChunk<CaseUIMessage>>> {
  const started = performance.now();
  const upstream = new AbortController();
  const parentAbort = () => upstream.abort(options.signal.reason);
  if (options.signal.aborted) parentAbort(); else options.signal.addEventListener("abort", parentAbort, { once: true });
  let interrupt: (() => void) | undefined;
  const cleanup = () => { options.signal.removeEventListener("abort", parentAbort); if (interrupt) upstream.signal.removeEventListener("abort", interrupt); };
  const checkpoint = () => { if (upstream.signal.aborted) throw upstream.signal.reason; };
  let modelId: string | undefined;
  let failure: ErrorCode | undefined;
  let cancelled = false;
  let diagnosed = false;
  const capture = (error: unknown): ErrorCode => {
    const classified = classifyOperationError(error, { deadlineSignal: options.signal });
    if (classified.kind === "cancelled") cancelled = true;
    const code = classified.kind === "error" ? classified.code : "PROVIDER_ERROR";
    // A real deadline supersedes an earlier provider error; neither permits success.
    if (!failure || code === "OPERATION_TIMEOUT") failure = code;
    return code;
  };
  const safeError = (error: unknown) => JSON.stringify(createErrorEnvelope(capture(error), { operationId: input.operationId }));
  const diagnose = (classification: ErrorCode | "completed" | "cancelled", usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number }) => {
    if (diagnosed || !modelId) return;
    diagnosed = true;
    recordOperationDiagnostic({ caseId: input.id, operationId: input.operationId, stage: "chat", modelId, elapsedMs: performance.now() - started, classification, ...(usage ? { usage } : {}) });
  };
  try {
    checkpoint();
    const history = validateChatHistory(input);
    modelId = getAiConfiguration().modelId;
    const prompt = await buildChatPrompt({ caseContext: input.caseContext, messages: history });
    checkpoint();
    // Explicit text-only projection: app metadata and reply states never enter the model.
    const messages = await convertToModelMessages(prompt.messages.map((message, index) => ({ id: `context-${index}`, role: message.role, parts: [{ type: "text" as const, text: message.content }] })));
    checkpoint();
    // Count the actual returned SDK text arguments, including roles, arrays, JSON
    // escapes and instructions key. Do not count LoadedPolicy again or estimate tokens.
    if (Buffer.byteLength(JSON.stringify({ instructions: prompt.system, messages }), "utf8") > MAX_PROMPT_TEXT_BYTES) throw new OperationError("CONTEXT_LIMIT");
    const result = streamText({ ...createAiStageOptions("chat", upstream.signal), instructions: prompt.system, messages,
      onError: ({ error }) => { capture(error); },
    });
    let end: End | undefined;
    let errorSent = false;
    let aborted = false;
    const filtered = result.stream.pipeThrough(new TransformStream<TextStreamPart<ToolSet>, TextStreamPart<ToolSet>>({
      transform(part, controller) {
        if (part.type === "error") capture(part.error);
        if (part.type === "abort") aborted = true;
        if (part.type.startsWith("tool-")) failure ??= "INVALID_AI_OUTPUT";
        if (modelParts.has(part.type)) controller.enqueue(part);
      },
    }));
    const ui = toUIMessageStream<ToolSet, CaseUIMessage>({ stream: filtered, originalMessages: input.messages, generateMessageId: () => input.replyMessageId,
      sendReasoning: false, sendSources: false, onError: safeError,
      onEnd: event => { end = event; },
    });
    const reader = ui.getReader();
    let closed = false;
    const interrupted = new Promise<never>((_, reject) => {
      interrupt = () => reject(upstream.signal.reason);
      upstream.signal.addEventListener("abort", interrupt, { once: true });
      if (upstream.signal.aborted) interrupt();
    });
    // The rejection always has an observer, even if abort happens between pulls.
    void interrupted.catch(() => undefined);
    const terminal = async (controller: ReadableStreamDefaultController<Chunk>) => {
      let fullTextValid = false;
      if (end) {
        const parts = end.responseMessage.parts.filter(part => part.type === "text").map(part => ({ type: "text" as const, text: part.text, ...(part.state ? { state: part.state } : {}) }));
        fullTextValid = caseMessageSchema.safeParse({ id: input.replyMessageId, role: "assistant", parts }).success && parts.map(part => part.text).join("").trim().length > 0;
      }
      if (!fullTextValid) failure ??= "INVALID_AI_OUTPUT";
      if (upstream.signal.aborted) capture(upstream.signal.reason);
      const normal = end?.finishReason === "stop" && end.outcome.status === "completed" && !end.isAborted && !end.isCancelled && !aborted && !cancelled && !failure && fullTextValid && !upstream.signal.aborted;
      let complete = normal;
      if (normal) {
        try {
          const [response, usage] = await Promise.race([Promise.all([result.response, result.usage]), interrupted]);
          checkpoint();
          if (closed) return;
          recordCompletedGeneration({ caseId: input.id, operationId: input.operationId, stage: "chat", modelId: modelId! }, { response, finishReason: "stop" }, true);
          diagnose("completed", usage);
        } catch (error) { capture(error); complete = false; }
      }
      if (closed) return;
      if (!complete) {
        if (!failure && !cancelled && !aborted && !end?.isCancelled) failure = "INVALID_AI_OUTPUT";
        diagnose(cancelled || end?.isCancelled ? "cancelled" : failure ?? "INVALID_AI_OUTPUT");
        if (failure && !errorSent) {
          controller.enqueue({ type: "error", errorText: JSON.stringify(createErrorEnvelope(failure, { operationId: input.operationId })) });
          errorSent = true;
        }
      }
      const finishReason: TerminalMetadata["finishReason"] = complete ? "stop" : cancelled || aborted || end?.isAborted ? "aborted" : end?.isCancelled ? "disconnected" : failure && failure !== "INVALID_AI_OUTPUT" ? "error" : end?.finishReason ?? "unknown";
      const metadata: TerminalMetadata = { operationId: input.operationId, finishReason, completionState: complete ? "complete" : "incomplete" };
      controller.enqueue({ type: "finish", messageMetadata: metadata });
      closed = true; cleanup(); controller.close();
    };
    return new ReadableStream<Chunk>({
      async pull(controller) {
        try {
          // Withhold finish but keep draining: SDK onEnd runs at EOF. Waiting for
          // onEnd before reading beyond finish would deadlock its flush callback.
          while (!closed) {
            const next = await Promise.race([reader.read(), interrupted]);
            if (closed) return;
            if (next.done) { await terminal(controller); return; }
            const part = next.value;
            switch (part.type) {
              case "finish": continue;
              case "start": controller.enqueue({ type: "start", messageId: input.replyMessageId }); return;
              case "text-start": controller.enqueue({ type: "text-start", id: part.id }); return;
              case "text-delta": controller.enqueue({ type: "text-delta", id: part.id, delta: part.delta }); return;
              case "text-end": controller.enqueue({ type: "text-end", id: part.id }); return;
              case "start-step": case "finish-step": controller.enqueue({ type: part.type }); return;
              case "error": errorSent = true; controller.enqueue({ type: "error", errorText: part.errorText }); return;
              case "abort": controller.enqueue({ type: "abort" }); return;
              default: continue;
            }
          }
        } catch (error) {
          if (closed) return;
          capture(error);
          // Cancel the SDK reader after failure; the observed losing read cannot
          // later emit a successful terminal or retain upstream work/listeners.
          void reader.cancel().catch(() => undefined);
          await terminal(controller);
        }
      },
      async cancel() {
        closed = true; cancelled = true;
        upstream.abort(new CallerCancelledError()); diagnose("cancelled"); cleanup();
        await reader.cancel().catch(() => undefined);
      },
    });
  } catch (error) {
    const code = capture(error); diagnose(cancelled ? "cancelled" : code); cleanup(); throw error;
  }
}
