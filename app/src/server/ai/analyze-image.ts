import "server-only";
import { randomUUID } from "node:crypto";
import { generateText, Output } from "ai";
import type { AnalysisRequest } from "@/lib/contracts/requests";
import { createImageAnalysisSchema, createImageEvidenceOutputSchema, type ImageAnalysis } from "@/lib/contracts/analysis";
import { validatePreparedImage } from "@/server/images/validate-prepared-image";
import { buildImagePrompt } from "@/server/prompts/builder";
import { createFormFingerprint } from "@/server/cases/form-fingerprint";
import { classifyOperationError, OperationError } from "@/server/http/errors";
import { createOperationDeadline } from "./deadline";
import { getAiConfiguration } from "./configuration";
import { createAiStageOptions } from "./provider";
import { recordCompletedGeneration, recordOperationDiagnostic } from "./diagnostics";

export async function analyzeImage(input: AnalysisRequest, options: { signal?: AbortSignal; remainingBudgetMs?: number } = {}): Promise<ImageAnalysis> {
  const started = performance.now();
  const deadline = createOperationDeadline("analysis", Math.min(input.budgetMs, options.remainingBudgetMs ?? input.budgetMs), options.signal);
  let abort: (() => void) | undefined;
  let modelId: string | undefined;
  const errorSignal = () => options.signal?.aborted && options.signal.reason instanceof OperationError ? options.signal : deadline.signal;
  const checkpoint = () => {
    if (deadline.signal.aborted) throw errorSignal().reason;
    if (deadline.remainingMs() === 0) throw new OperationError("OPERATION_TIMEOUT");
  };
  const work = async () => {
    checkpoint();
    const prepared = await validatePreparedImage(input.preparedImage, { signal: deadline.signal, remainingBudgetMs: deadline.remainingMs() });
    checkpoint();
    modelId = getAiConfiguration().modelId;
    const prompt = await buildImagePrompt({ form: input.form, timeZone: input.timeZone });
    checkpoint();
    const schema = createImageEvidenceOutputSchema(input.form.scenario);
    const result = await generateText({ ...createAiStageOptions("analysis", deadline.signal), instructions: prompt.system,
      messages: [{ role: "user", content: [
        ...prompt.messages.map(message => ({ type: "text" as const, text: message.content })),
        { type: "file", mediaType: "image/jpeg", data: prepared.imageBuffer },
      ] }], output: Output.object({ schema }),
    });
    checkpoint();
    if (result.finishReason !== "stop") throw new OperationError("INVALID_AI_OUTPUT");
    const evidence = schema.safeParse(result.output);
    if (!evidence.success) throw new OperationError("INVALID_AI_OUTPUT");
    const parsed = createImageAnalysisSchema(input.form.scenario).safeParse({ ...evidence.data,
      analysisId: randomUUID(), scenario: input.form.scenario, imageDigest: prepared.image.sha256,
      formFingerprint: createFormFingerprint(input.form), createdAt: new Date().toISOString(), modelId,
    });
    if (!parsed.success) throw new OperationError("INVALID_AI_OUTPUT");
    checkpoint();
    const identity = { caseId: input.caseId, operationId: input.operationId, stage: "analysis", modelId };
    recordCompletedGeneration(identity, result, true);
    recordOperationDiagnostic({ ...identity, elapsedMs: performance.now() - started, classification: "completed", usage: result.usage });
    return parsed.data;
  };
  try {
    const interrupted = new Promise<never>((_, reject) => {
      abort = () => reject(errorSignal().reason);
      deadline.signal.addEventListener("abort", abort, { once: true });
      if (deadline.signal.aborted) abort();
    });
    return await Promise.race([work(), interrupted]);
  } catch (error) {
    const classified = classifyOperationError(error, { callerSignal: options.signal, deadlineSignal: errorSignal() });
    if (modelId) recordOperationDiagnostic({ caseId: input.caseId, operationId: input.operationId, stage: "analysis", modelId,
      elapsedMs: performance.now() - started, classification: classified.kind === "cancelled" ? "cancelled" : classified.code });
    throw error;
  } finally {
    if (abort) deadline.signal.removeEventListener("abort", abort);
    deadline.dispose();
  }
}
