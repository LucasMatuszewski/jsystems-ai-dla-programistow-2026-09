import { describe, expect, it } from "vitest";
import { createImageAnalysisSchema, createImageEvidenceOutputSchema } from "@/lib/contracts/analysis";

const output = {
  imageQuality: "adequate", observations: [{ finding: "Widoczne pęknięcie", visibleLocation: "Dolny róg obudowy" }],
  signsOfUse: ["Rysy"], possibleCauses: ["Możliwe uderzenie — hipoteza"], limitations: ["Nie można potwierdzić sprawności"],
  missingInformation: ["Brak testu uruchomienia"],
};
const metadata = {
  analysisId: "129d4e48-1a61-4a99-b1ac-0d1ce4576c58", scenario: "complaint", imageDigest: "a".repeat(64),
  formFingerprint: "b".repeat(64), createdAt: "2026-10-01T12:00:00.000Z", modelId: "openai/gpt-6-luna",
};

describe("strict image evidence output", () => {
  it.each(["adequate", "limited", "unusable"])("accepts %s quality and empty observations without inventing damage", (imageQuality) => {
    expect(createImageEvidenceOutputSchema("complaint").safeParse({ ...output, imageQuality, observations: [] }).success).toBe(true);
  });
  it.each([
    ["unsupported quality", { imageQuality: "perfect" }],
    ["blank finding", { observations: [{ finding: " ", visibleLocation: "Róg" }] }],
    ["blank location", { observations: [{ finding: "Rysa", visibleLocation: " " }] }],
    ["invented observation field", { observations: [{ finding: "Rysa", visibleLocation: "Róg", verifiedCause: "Upadek" }] }],
    ["blank signs", { signsOfUse: [" "] }],
    ["thirteen observations", { observations: Array.from({ length: 13 }, () => output.observations[0]) }],
    ["seven hypotheses", { possibleCauses: Array(7).fill("Hipoteza") }],
    ["seven limitations", { limitations: Array(7).fill("Ograniczenie") }],
    ["seven missing entries", { missingInformation: Array(7).fill("Brak danych") }],
    ["oversize serialized evidence", { signsOfUse: ["x".repeat(12_000)] }],
    ["policy outcome", { outcome: "preliminary_acceptance" }],
    ["trusted identity", { analysisId: metadata.analysisId }],
  ])("rejects %s", (_label, patch) => {
    expect(createImageEvidenceOutputSchema("complaint").safeParse({ ...output, ...patch }).success).toBe(false);
  });
  it("keeps causes separate and empty for returns", () => {
    expect(createImageEvidenceOutputSchema("return").safeParse({ ...output, possibleCauses: [] }).success).toBe(true);
    expect(createImageEvidenceOutputSchema("return").safeParse(output).success).toBe(false);
  });
  it("does not invent a signs-of-use count limit beyond the serialized bound", () => {
    expect(createImageEvidenceOutputSchema("complaint").safeParse({ ...output, signsOfUse: Array(7).fill("Rysa") }).success).toBe(true);
  });
  it.each(Object.keys(output))("requires %s", (field) => {
    const input: Record<string, unknown> = { ...output };
    delete input[field];
    expect(createImageEvidenceOutputSchema("complaint").safeParse(input).success).toBe(false);
  });
});

describe("server-owned flat analysis metadata", () => {
  it("accepts parsed evidence plus explicit server metadata", () => {
    expect(createImageAnalysisSchema("complaint").safeParse({ ...output, ...metadata }).success).toBe(true);
  });
  it.each([
    ["nonUUID identity", { analysisId: "analysis-1" }], ["wrong scenario", { scenario: "return" }],
    ["invalid digest", { imageDigest: "short" }], ["invalid fingerprint", { formFingerprint: "short" }],
    ["invalid timestamp", { createdAt: "2026-10-01" }], ["blank model", { modelId: " " }],
    ["nested model output", { evidence: output }],
  ])("rejects %s", (_label, patch) => {
    expect(createImageAnalysisSchema("complaint").safeParse({ ...output, ...metadata, ...patch }).success).toBe(false);
  });
  it.each(Object.keys(metadata))("requires trusted %s", (field) => {
    const input: Record<string, unknown> = { ...output, ...metadata };
    delete input[field];
    expect(createImageAnalysisSchema("complaint").safeParse(input).success).toBe(false);
  });
});
