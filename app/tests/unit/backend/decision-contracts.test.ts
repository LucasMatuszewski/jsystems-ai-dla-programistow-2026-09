import { describe, expect, it } from "vitest";
import { DECISION_OUTCOMES, RESALE_ASSESSMENTS, createInitialDecisionOutputSchema, createInitialDecisionSchema } from "@/lib/contracts/decision";
import { policyMetadataSchema } from "@/lib/contracts/policy";

const allowed = ["section-1", "section-2"];
const output = {
  outcome: "preliminary_acceptance", greeting: "Dzień dobry", summary: "Wstępna ocena zgłoszenia",
  justification: ["Opis wskazuje potrzebę sprawdzenia"], evidence: ["Klient zgłasza brak uruchomienia"],
  policyReferences: ["section-1"], limitations: ["Wymagana kontrola pracownika"], questions: [],
  nextSteps: ["Sprawdź dokument zakupu poza aplikacją"], resaleAssessment: null, resaleExplanation: null,
};
const policy = {
  version: "fixture-v1", digest: "c".repeat(64), sourceUrl: "https://example.test/policy",
  retrievedAt: "2026-10-01T12:00:00.000Z",
  references: [{ headingId: "section-1", title: "Fixture heading", url: "https://example.test/policy#section-1" }],
};
const metadata = {
  decisionId: "129d4e48-1a61-4a99-b1ac-0d1ce4576c58", caseId: "7b40b034-5e7b-49dc-bb47-e8d8d2d5fc76",
  scenario: "complaint", policy, createdAt: "2026-10-01T12:00:00.000Z", modelId: "openai/gpt-6-luna",
  preliminary: true, employeeVerificationRequired: true,
};
const schema = () => createInitialDecisionOutputSchema("complaint", allowed);

describe("strict initial model decision", () => {
  it("exports only the four outcomes and three independent resale choices", () => {
    expect(DECISION_OUTCOMES).toEqual(["preliminary_acceptance", "preliminary_refusal", "additional_information_required", "human_verification_required"]);
    expect(RESALE_ASSESSMENTS).toEqual(["no_visible_barrier", "visible_barrier", "insufficient_evidence"]);
  });
  it.each(["preliminary_acceptance", "preliminary_refusal", "additional_information_required", "human_verification_required"])("accepts structurally supported %s", (outcome) => {
    expect(schema().safeParse({ ...output, outcome, questions: outcome === "additional_information_required" ? ["Kiedy wystąpił problem?"] : [] }).success).toBe(true);
  });
  it.each([
    ["unsupported outcome", { outcome: "approved" }], ["blank greeting", { greeting: " " }],
    ["blank summary", { summary: " " }], ["empty justification", { justification: [] }],
    ["blank evidence", { evidence: [" "] }], ["empty references", { policyReferences: [] }],
    ["unselected heading", { policyReferences: ["section-invented"] }],
    ["model-generated URL/title", { policyReferences: [{ headingId: "section-1", title: "Invented", url: "https://example.test/invented" }] }],
    ["blank limitation", { limitations: [" "] }], ["blank question", { questions: [" "] }],
    ["empty employee steps", { nextSteps: [] }], ["blank employee step", { nextSteps: [" "] }],
    ["complaint resale status", { resaleAssessment: "no_visible_barrier" }],
    ["complaint resale explanation", { resaleExplanation: "Przedmiot wygląda dobrze" }],
    ["trusted identity", { decisionId: metadata.decisionId }], ["trusted policy", { policy }],
    ["trusted preliminary flag", { preliminary: true }], ["trusted verification flag", { employeeVerificationRequired: true }],
    ["oversize generated object", { summary: "x".repeat(24_000) }],
  ])("rejects %s", (_label, patch) => {
    expect(schema().safeParse({ ...output, ...patch }).success).toBe(false);
  });
  it("requires questions for additional information and facts for preliminary refusal", () => {
    expect(schema().safeParse({ ...output, outcome: "additional_information_required", questions: [] }).success).toBe(false);
    expect(schema().safeParse({ ...output, outcome: "preliminary_refusal", evidence: [] }).success).toBe(false);
  });
  it("does not pretend schema validation certifies factual truth or infer unknown form facts", () => {
    expect(schema().safeParse({ ...output, outcome: "preliminary_acceptance", evidence: [], questions: [], limitations: [] }).success).toBe(true);
  });
  it.each(Object.keys(output))("requires model field %s", (field) => {
    const input: Record<string, unknown> = { ...output };
    delete input[field];
    expect(schema().safeParse(input).success).toBe(false);
  });
});

describe("independent return resale assessment", () => {
  for (const outcome of ["preliminary_acceptance", "preliminary_refusal", "additional_information_required", "human_verification_required"]) {
    it.each(["no_visible_barrier", "visible_barrier", "insufficient_evidence"])(`accepts ${outcome} independently of %s`, (resaleAssessment) => {
      const input = { ...output, outcome, resaleAssessment, resaleExplanation: "Ocena wyłącznie na podstawie obrazu",
        questions: outcome === "additional_information_required" ? ["Czy masz dokument zakupu?"] : [] };
      expect(createInitialDecisionOutputSchema("return", allowed).safeParse(input).success).toBe(true);
    });
  }
  it.each([
    ["null resale", { resaleAssessment: null, resaleExplanation: "Wyjaśnienie" }],
    ["unsupported resale", { resaleAssessment: "brand_new", resaleExplanation: "Wyjaśnienie" }],
    ["null explanation", { resaleAssessment: "insufficient_evidence", resaleExplanation: null }],
    ["blank explanation", { resaleAssessment: "insufficient_evidence", resaleExplanation: " " }],
  ])("rejects %s", (_label, patch) => {
    expect(createInitialDecisionOutputSchema("return", allowed).safeParse({ ...output, ...patch }).success).toBe(false);
  });
});

describe("trusted policy and flat decision metadata", () => {
  it("accepts explicit resolved reference records plus flat parsed decision fields", () => {
    expect(policyMetadataSchema.safeParse(policy).success).toBe(true);
    expect(createInitialDecisionSchema("complaint", allowed).safeParse({ ...output, ...metadata }).success).toBe(true);
  });
  it.each([
    ["nonUUID decision", { decisionId: "decision-1" }], ["nonUUID case", { caseId: "case-1" }],
    ["wrong scenario", { scenario: "return" }], ["bad timestamp", { createdAt: "2026-10-01" }],
    ["blank model", { modelId: " " }], ["not preliminary", { preliminary: false }],
    ["verification disabled", { employeeVerificationRequired: false }], ["nested output", { output }],
    ["missing used references", { policy: { ...policy, references: [] } }],
    ["unselected trusted reference", { policy: { ...policy, references: [{ ...policy.references[0], headingId: "invented" }] } }],
  ])("rejects %s", (_label, patch) => {
    expect(createInitialDecisionSchema("complaint", allowed).safeParse({ ...output, ...metadata, ...patch }).success).toBe(false);
  });
  it.each(Object.keys(metadata))("requires trusted %s", (field) => {
    const input: Record<string, unknown> = { ...output, ...metadata };
    delete input[field];
    expect(createInitialDecisionSchema("complaint", allowed).safeParse(input).success).toBe(false);
  });
  it.each([
    ["blank version", { version: " " }], ["invalid digest", { digest: "short" }],
    ["invalid source", { sourceUrl: "not-a-url" }], ["invalid retrieval", { retrievedAt: "yesterday" }],
    ["unsafe source scheme", { sourceUrl: "javascript:alert(1)" }],
    ["blank heading", { references: [{ ...policy.references[0], headingId: " " }] }],
    ["blank title", { references: [{ ...policy.references[0], title: " " }] }],
    ["invalid heading URL", { references: [{ ...policy.references[0], url: "not-a-url" }] }],
    ["unsafe heading scheme", { references: [{ ...policy.references[0], url: "data:text/html,unsafe" }] }],
    ["invented reference property", { references: [{ ...policy.references[0], modelApproved: true }] }],
  ])("rejects policy shape %s", (_label, patch) => {
    expect(policyMetadataSchema.safeParse({ ...policy, ...patch }).success).toBe(false);
  });
});
