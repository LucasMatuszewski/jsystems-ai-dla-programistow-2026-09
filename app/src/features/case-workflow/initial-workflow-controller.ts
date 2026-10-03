import type { CaseForm } from "@/lib/contracts/form";
import type { ActiveCaseSnapshot } from "@/lib/contracts/session";
import { createErrorEnvelope, type ErrorCode, type ErrorEnvelope } from "@/lib/contracts/errors";
import { createFirstDecisionMessage } from "@/lib/contracts/first-message";
import type { analyzeInitialCase, decideInitialCase } from "./initial-api-client";
import type { prepareEquipmentImage } from "./image-preparation-client";

export type InitialWorkflowView = { pending: boolean; error: ErrorEnvelope | null };
export type InitialWorkflowDependencies = {
  readCase: () => ActiveCaseSnapshot;
  checkpoint: (snapshot: ActiveCaseSnapshot) => void;
  readOriginalFile: () => File | null;
  analyze: typeof analyzeInitialCase;
  decide: typeof decideInitialCase;
  prepare: typeof prepareEquipmentImage;
  now: () => number;
  makeOperationId: () => string;
  makeMessageId: () => string;
  onView: (view: InitialWorkflowView) => void;
  onComplete: () => void;
};

export function createInitialWorkflowController(dependencies: InitialWorkflowDependencies) {
  type Stage = "preparation" | "analysis" | "decision";
  type Operation = { caseId: string; operationId: string; deadline: number; controller: AbortController; timer: ReturnType<typeof setTimeout> | null };
  let active: Operation | null = null;
  let lastError: ErrorEnvelope | null = null;
  let disposed = false;

  function write(changes: Partial<ActiveCaseSnapshot>) {
    const current = dependencies.readCase();
    dependencies.checkpoint({ ...current, ...changes, revision: current.revision + 1 });
  }
  function release(operation: Operation, abort = false) {
    if (active !== operation) return;
    active = null;
    if (operation.timer !== null) clearTimeout(operation.timer);
    if (abort) operation.controller.abort();
  }
  function failure(operation: Operation, error: ErrorEnvelope) {
    if (active !== operation || disposed || dependencies.readCase().caseId !== operation.caseId) return;
    release(operation, true);
    lastError = error;
    write({ stageStatus: "idle", pendingOperation: null });
    dependencies.onView({ pending: false, error });
  }
  function owns(operation: Operation): boolean {
    if (disposed || active !== operation || operation.controller.signal.aborted || dependencies.readCase().caseId !== operation.caseId) return false;
    if (dependencies.now() >= operation.deadline) {
      failure(operation, createErrorEnvelope("OPERATION_TIMEOUT", { operationId: operation.operationId }));
      return false;
    }
    return true;
  }
  function enter(operation: Operation, stage: Stage) {
    if (!owns(operation)) return false;
    write({ stage, stageStatus: "pending", pendingOperation: { kind: stage, operationId: operation.operationId, startedAt: new Date(dependencies.now()).toISOString() } });
    return true;
  }
  function remainingBudget(operation: Operation): number | null {
    const remaining = Math.floor(operation.deadline - dependencies.now());
    if (remaining < 1) {
      failure(operation, createErrorEnvelope("OPERATION_TIMEOUT", { operationId: operation.operationId }));
      return null;
    }
    return Math.min(120_000, remaining);
  }
  function cancel(clearFacts: boolean, onlyDownstream = false) {
    if (active) release(active, true);
    lastError = null;
    if (clearFacts && !disposed) {
      const current = dependencies.readCase();
      if (!onlyDownstream || current.submittedForm || current.imageAnalysis || current.initialDecision || current.messages.length) write({ screen: "form", stage: "form", stageStatus: "idle", pendingOperation: null, submittedForm: null, imageAnalysis: null, initialDecision: null, messages: [], replyStates: {} });
    }
    if (!disposed) dependencies.onView({ pending: false, error: null });
  }

  async function run(form: CaseForm, resume: boolean): Promise<void> {
    if (disposed || active || dependencies.readCase().initialDecision) return;
    const current = dependencies.readCase();
    const frozenForm = Object.freeze({ ...form });
    const operation: Operation = { caseId: current.caseId, operationId: dependencies.makeOperationId(), deadline: dependencies.now() + 120_000, controller: new AbortController(), timer: null };
    active = operation;
    lastError = null;
    operation.timer = setTimeout(() => failure(operation, createErrorEnvelope("OPERATION_TIMEOUT", { operationId: operation.operationId })), 120_000);
    dependencies.onView({ pending: true, error: null });
    write({ submittedForm: frozenForm, imageAnalysis: resume ? current.imageAnalysis : null, initialDecision: null, messages: [], replyStates: {} });
    let stage: Stage = "preparation";
    try {
      let preparedImage = current.preparedImage;
      if (!preparedImage) {
        if (!enter(operation, "preparation")) return;
        const file = dependencies.readOriginalFile();
        if (!file) { failure(operation, createErrorEnvelope("INVALID_IMAGE", { operationId: operation.operationId })); return; }
        const result = await dependencies.prepare(file, { signal: operation.controller.signal });
        if (!owns(operation)) return;
        if (result.status !== "prepared") {
          const code: ErrorCode = result.status === "failed" ? result.code ?? "IMAGE_PROCESSING_ERROR" : "IMAGE_PROCESSING_ERROR";
          const error = createErrorEnvelope(code, { operationId: operation.operationId });
          failure(operation, result.status === "failed" ? { ...error, message: result.message, retryable: result.retryable } : error); return;
        }
        preparedImage = result.preparedImage;
        write({ preparedImage, stage: "analysis", stageStatus: "idle", pendingOperation: null });
      }
      let imageAnalysis = resume ? current.imageAnalysis : null;
      if (!imageAnalysis) {
        stage = "analysis";
        if (!enter(operation, "analysis")) return;
        const budgetMs = remainingBudget(operation);
        if (budgetMs === null) return;
        const result = await dependencies.analyze({ caseId: operation.caseId, operationId: operation.operationId, form: frozenForm, timeZone: current.timeZone, preparedImage, budgetMs }, { signal: operation.controller.signal });
        if (!owns(operation)) return;
        if (result.status !== "success") {
          failure(operation, result.status === "failed" ? result.error : createErrorEnvelope("PROVIDER_ERROR", { operationId: operation.operationId })); return;
        }
        imageAnalysis = result.value;
        write({ imageAnalysis, stage: "decision", stageStatus: "idle", pendingOperation: null });
      }
      stage = "decision";
      if (!enter(operation, "decision")) return;
      const budgetMs = remainingBudget(operation);
      if (budgetMs === null) return;
      const result = await dependencies.decide({ caseId: operation.caseId, operationId: operation.operationId, form: frozenForm, timeZone: current.timeZone, imageAnalysis, budgetMs }, { signal: operation.controller.signal });
      if (!owns(operation)) return;
      if (result.status !== "success") {
        failure(operation, result.status === "failed" ? result.error : createErrorEnvelope("PROVIDER_ERROR", { operationId: operation.operationId })); return;
      }
      let message;
      try { message = createFirstDecisionMessage(result.value, dependencies.makeMessageId()); }
      catch { failure(operation, createErrorEnvelope("INVALID_AI_OUTPUT", { operationId: operation.operationId })); return; }
      if (!owns(operation)) return;
      write({ initialDecision: result.value, screen: "chat", stage: "chat", stageStatus: "idle", pendingOperation: null, messages: [message], replyStates: { [message.id]: "complete" } });
      release(operation);
      dependencies.onView({ pending: false, error: null });
      dependencies.onComplete();
    } catch {
      if (owns(operation)) failure(operation, createErrorEnvelope(stage === "preparation" ? "IMAGE_PROCESSING_ERROR" : "PROVIDER_ERROR", { operationId: operation.operationId }));
    }
  }
  return {
    start: (form: CaseForm) => run(form, false),
    async retry(): Promise<void> {
      if (disposed || active || (lastError && !lastError.retryable)) return;
      const current = dependencies.readCase();
      if (current.submittedForm) await run(current.submittedForm, true);
    },
    returnToForm: () => cancel(true),
    invalidate: () => cancel(true, true),
    dispose(): void { cancel(false); disposed = true; },
  };
}
