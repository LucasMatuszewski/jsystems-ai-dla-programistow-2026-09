import "server-only";
import { randomUUID } from "node:crypto";
import { generateText, Output } from "ai";
import type { DecisionRequest } from "@/lib/contracts/requests";
import { createInitialDecisionOutputSchema, createInitialDecisionSchema, type InitialDecision } from "@/lib/contracts/decision";
import { createFirstDecisionMessage } from "@/lib/contracts/first-message";
import { createFormFingerprint } from "@/server/cases/form-fingerprint";
import { buildInitialDecisionPrompt } from "@/server/prompts/builder";
import { validateDecisionReferences } from "@/server/policies/validate-references";
import { classifyOperationError, OperationError } from "@/server/http/errors";
import { createOperationDeadline } from "./deadline";
import { getAiConfiguration } from "./configuration";
import { createAiStageOptions } from "./provider";
import { recordCompletedGeneration, recordOperationDiagnostic } from "./diagnostics";

export async function initialDecision(input: DecisionRequest, options: { signal?: AbortSignal; remainingBudgetMs?: number } = {}): Promise<InitialDecision> {
  const started = performance.now();
  const deadline = createOperationDeadline("decision", Math.min(input.budgetMs, options.remainingBudgetMs ?? input.budgetMs), options.signal);
  let abort: (() => void) | undefined;
  let modelId: string | undefined;
  const errorSignal = () => options.signal?.aborted && options.signal.reason instanceof OperationError ? options.signal : deadline.signal;
  const checkpoint = () => {
    if (deadline.signal.aborted) throw errorSignal().reason;
    if (deadline.remainingMs() === 0) throw new OperationError("OPERATION_TIMEOUT");
  };
  const work = async () => {
    checkpoint();
    if (input.imageAnalysis.scenario !== input.form.scenario || input.imageAnalysis.formFingerprint !== createFormFingerprint(input.form)) throw new OperationError("VALIDATION_ERROR");
    modelId = getAiConfiguration().modelId;
    const prompt = await buildInitialDecisionPrompt({ form: input.form, timeZone: input.timeZone, imageAnalysis: input.imageAnalysis });
    checkpoint();
    const headingIds = prompt.policy.headings.map(heading => heading.headingId);
    const schema = createInitialDecisionOutputSchema(input.form.scenario, headingIds);
    const result = await generateText({ ...createAiStageOptions("decision", deadline.signal), instructions: prompt.system,
      messages: prompt.messages, output: Output.object({ schema }),
    });
    checkpoint();
    if (result.finishReason !== "stop") throw new OperationError("INVALID_AI_OUTPUT");
    const output = schema.safeParse(result.output);
    if (!output.success) throw new OperationError("INVALID_AI_OUTPUT");
    const references = validateDecisionReferences(prompt.policy, output.data.policyReferences);
    const { version, digest, sourceUrl, retrievedAt } = prompt.policy.provenance;
    const parsed = createInitialDecisionSchema(input.form.scenario, headingIds).safeParse({ ...output.data,
      decisionId: randomUUID(), caseId: input.caseId, scenario: input.form.scenario, createdAt: new Date().toISOString(), modelId,
      preliminary: true, employeeVerificationRequired: true, policy: { version, digest, sourceUrl, retrievedAt, references },
    });
    if (!parsed.success) throw new OperationError("INVALID_AI_OUTPUT");
    // Validate complete deterministic display text without owning the frontend's real message ID.
    try { createFirstDecisionMessage(parsed.data, "initial-assessment-validation"); }
    catch { throw new OperationError("INVALID_AI_OUTPUT"); }
    checkpoint();
    const identity = { caseId: input.caseId, operationId: input.operationId, stage: "decision", modelId };
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
    // Promise.race observes both branches; every late work continuation checkpoints before success.
    return await Promise.race([work(), interrupted]);
  } catch (error) {
    const classified = classifyOperationError(error, { callerSignal: options.signal, deadlineSignal: errorSignal() });
    if (modelId) recordOperationDiagnostic({ caseId: input.caseId, operationId: input.operationId, stage: "decision", modelId,
      elapsedMs: performance.now() - started, classification: classified.kind === "cancelled" ? "cancelled" : classified.code });
    throw error;
  } finally {
    if (abort) deadline.signal.removeEventListener("abort", abort);
    deadline.dispose();
  }
}
