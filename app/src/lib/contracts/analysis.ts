import { z } from "zod";
import type { CaseForm } from "./form";
import { sha256Schema } from "./image";

export const IMAGE_QUALITIES = Object.freeze(["adequate", "limited", "unusable"] as const);
export const ANALYSIS_CONTRACT_REVISION = 1 as const;
export const MAX_EVIDENCE_CHARACTERS = 12_000;
const text = z.string().trim().min(1);
const evidenceShape = {
  imageQuality: z.enum(IMAGE_QUALITIES), observations: z.array(z.strictObject({ finding: text, visibleLocation: text })).max(12),
  signsOfUse: z.array(text), possibleCauses: z.array(text).max(6),
  limitations: z.array(text).max(6), missingInformation: z.array(text).max(6),
};
const evidenceBaseSchema = z.strictObject(evidenceShape);
export type ImageEvidenceOutput = z.infer<typeof evidenceBaseSchema>;

function validateEvidence(value: ImageEvidenceOutput, context: z.RefinementCtx, scenario: CaseForm["scenario"]) {
  if (scenario === "return" && value.possibleCauses.length !== 0) {
    context.addIssue({ code: "custom", path: ["possibleCauses"], message: "Zwrot nie zawiera hipotez przyczyn usterki." });
  }
  const evidence = {
    imageQuality: value.imageQuality, observations: value.observations, signsOfUse: value.signsOfUse,
    possibleCauses: value.possibleCauses, limitations: value.limitations, missingInformation: value.missingInformation,
  };
  if (JSON.stringify(evidence).length > MAX_EVIDENCE_CHARACTERS) {
    context.addIssue({ code: "custom", message: "Opis obrazu przekracza limit długości." });
  }
}

export function createImageEvidenceOutputSchema(scenario: CaseForm["scenario"]) {
  return evidenceBaseSchema.superRefine((value, context) => validateEvidence(value, context, scenario));
}

export function createImageAnalysisSchema(scenario: CaseForm["scenario"]) {
  return z.strictObject({ ...evidenceShape, analysisId: z.uuid(), scenario: z.literal(scenario), imageDigest: sha256Schema,
    formFingerprint: sha256Schema, createdAt: z.iso.datetime(), modelId: text,
  }).superRefine((value, context) => validateEvidence(value, context, scenario));
}
export type ImageAnalysis = z.infer<ReturnType<typeof createImageAnalysisSchema>>;
