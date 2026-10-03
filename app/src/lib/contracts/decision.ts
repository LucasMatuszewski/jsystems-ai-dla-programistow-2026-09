import { z } from "zod";
import type { CaseForm } from "./form";
import { policyMetadataSchema } from "./policy";

export const DECISION_OUTCOMES = Object.freeze(["preliminary_acceptance", "preliminary_refusal", "additional_information_required", "human_verification_required"] as const);
export const RESALE_ASSESSMENTS = Object.freeze(["no_visible_barrier", "visible_barrier", "insufficient_evidence"] as const);
export const DECISION_CONTRACT_REVISION = 1 as const;
export const MAX_DECISION_CHARACTERS = 24_000;
const text = z.string().trim().min(1);

function outputShape(scenario: CaseForm["scenario"], allowedHeadingIds: readonly string[]) {
  return {
    outcome: z.enum(DECISION_OUTCOMES), greeting: text, summary: text, justification: z.array(text).min(1),
    evidence: z.array(text), policyReferences: z.array(z.enum(allowedHeadingIds)).min(1), limitations: z.array(text),
    questions: z.array(text), nextSteps: z.array(text).min(1),
    resaleAssessment: scenario === "complaint" ? z.null() : z.enum(RESALE_ASSESSMENTS),
    resaleExplanation: scenario === "complaint" ? z.null() : text,
  };
}
export type InitialDecisionOutput = z.infer<z.ZodObject<ReturnType<typeof outputShape>>>;

function validateDecision(value: InitialDecisionOutput, context: z.RefinementCtx) {
  if (value.outcome === "additional_information_required" && value.questions.length === 0) {
    context.addIssue({ code: "custom", path: ["questions"], message: "Uzupełnij pytania o brakujące informacje." });
  }
  if (value.outcome === "preliminary_refusal" && value.evidence.length === 0) {
    context.addIssue({ code: "custom", path: ["evidence"], message: "Wstępna odmowa wymaga wskazania faktu uzasadniającego warunek regulaminu." });
  }
  // Shape is not factual/policy certification. Material unknowns and Polish language need later prompt/service quality checks.
  const output = {
    outcome: value.outcome, greeting: value.greeting, summary: value.summary, justification: value.justification,
    evidence: value.evidence, policyReferences: value.policyReferences, limitations: value.limitations,
    questions: value.questions, nextSteps: value.nextSteps, resaleAssessment: value.resaleAssessment, resaleExplanation: value.resaleExplanation,
  };
  if (JSON.stringify(output).length > MAX_DECISION_CHARACTERS) {
    context.addIssue({ code: "custom", message: "Decyzja przekracza limit długości." });
  }
}

export function createInitialDecisionOutputSchema(scenario: CaseForm["scenario"], allowedHeadingIds: readonly string[]) {
  return z.strictObject(outputShape(scenario, allowedHeadingIds)).superRefine(validateDecision);
}

export function createInitialDecisionSchema(scenario: CaseForm["scenario"], allowedHeadingIds: readonly string[]) {
  return z.strictObject({ ...outputShape(scenario, allowedHeadingIds), decisionId: z.uuid(), caseId: z.uuid(), scenario: z.literal(scenario),
    policy: policyMetadataSchema, createdAt: z.iso.datetime(), modelId: text,
    preliminary: z.literal(true), employeeVerificationRequired: z.literal(true),
  }).superRefine((value, context) => {
    validateDecision(value, context);
    const used = new Set(value.policyReferences);
    const resolved = new Set(value.policy.references.map((reference) => reference.headingId));
    if (used.size !== resolved.size || [...used].some((id) => !resolved.has(id))) {
      context.addIssue({ code: "custom", path: ["policy", "references"], message: "Odwołania muszą odpowiadać sekcjom użytym w decyzji." });
    }
  });
}
export type InitialDecision = z.infer<ReturnType<typeof createInitialDecisionSchema>>;
