import { describe, expect, it } from "vitest";
import { formatFirstDecision, createFirstDecisionMessage, FIRST_ASSESSMENT_NOTICE } from "@/lib/contracts/first-message";
import { createInitialDecisionSchema, type InitialDecision } from "@/lib/contracts/decision";
const decision: InitialDecision = { outcome: "preliminary_acceptance", greeting: "Dzień dobry", summary: "Sprawa wymaga weryfikacji", justification: ["Powód pierwszy", "Powód drugi"], evidence: ["Opis klienta"], policyReferences: ["heading"], limitations: ["Brak testu urządzenia"], questions: ["Czy jest dokument zakupu?"], nextSteps: ["Sprawdź sprzęt poza aplikacją"], resaleAssessment: null, resaleExplanation: null, decisionId: "129d4e48-1a61-4a99-b1ac-0d1ce4576c58", caseId: "7b40b034-5e7b-49dc-bb47-e8d8d2d5fc76", scenario: "complaint", policy: { version: "fixture-version", digest: "c".repeat(64), sourceUrl: "https://example.test/policy", retrievedAt: "2026-09-01T00:00:00Z", references: [{ headingId: "heading", title: "Oficjalna sekcja", url: "https://example.test/policy#heading" }] }, createdAt: "2026-10-01T00:00:00Z", modelId: "private-model", preliminary: true, employeeVerificationRequired: true };
describe("deterministic full first assistant message", () => {
  it("preserves every explanation and official resolved title/link in fixed section order", () => {
    const text = formatFirstDecision(decision);
    for (const detail of [decision.greeting, decision.summary, ...decision.justification, ...decision.evidence, ...decision.limitations, ...decision.questions, ...decision.nextSteps, "Oficjalna sekcja", "https://example.test/policy#heading", FIRST_ASSESSMENT_NOTICE]) expect(text).toContain(detail);
    const headings = ["Wstępna ocena początkowa", "Wstępny wynik", "Podsumowanie", "Uzasadnienie", "Ustalenia i zgłoszone fakty", "Podstawa procedury", "Ograniczenia oceny", "Pytania uzupełniające", "Dalsze kroki pracownika"];
    expect(headings.map(heading => text.indexOf(heading))).toEqual([...headings.map(heading => text.indexOf(heading))].sort((a, b) => a - b));
    for (const heading of headings) expect(text).toContain(heading);
  });
  it.each(["preliminary_acceptance", "preliminary_refusal", "additional_information_required", "human_verification_required"] as const)("labels %s in Polish", outcome => {
    expect(formatFirstDecision({ ...decision, outcome })).not.toContain(outcome);
    expect(formatFirstDecision({ ...decision, outcome })).toMatch(/Wstępne przyjęcie|Wstępna odmowa|Wymagane dodatkowe informacje|Wymagana weryfikacja pracownika/);
  });
  it("keeps return eligibility and resale distinct and preserves resale explanation", () => {
    const text = formatFirstDecision({ ...decision, scenario: "return", resaleAssessment: "visible_barrier", resaleExplanation: "Widoczna przeszkoda: pęknięcie" });
    expect(text).toContain("Ocena możliwości przyjęcia zwrotu");
    expect(text).toContain("Ocena stanu do ponownej sprzedaży");
    expect(text).toContain("Widoczna przeszkoda: pęknięcie");
    expect(text).not.toContain("visible_barrier");
  });
  it("uses explicit empty-list text without inventing findings", () => {
    expect(formatFirstDecision({ ...decision, evidence: [], limitations: [], questions: [] })).toContain("Brak wskazanych informacji.");
    expect(formatFirstDecision(decision)).not.toContain("Ocena stanu do ponownej sprzedaży");
  });
  it("never exposes internal transport metadata or mutates the initial decision", () => {
    const before = JSON.stringify(decision);
    const text = formatFirstDecision(decision);
    for (const internal of [decision.caseId, decision.decisionId, decision.modelId, decision.policy.version, decision.policy.digest, decision.createdAt]) expect(text).not.toContain(internal);
    expect(JSON.stringify(decision)).toBe(before);
    expect(formatFirstDecision(decision)).toBe(text);
  });
  it("creates exactly one complete stable assistant text without a synthetic user", () => {
    expect(createFirstDecisionMessage(decision, "initial-sdk-id")).toEqual({ id: "initial-sdk-id", role: "assistant", parts: [{ type: "text", text: formatFirstDecision(decision) }] });
  });
  it("rejects an over-budget first message from valid trusted references without truncating details", () => {
    const longTitle = "Oficjalna sekcja ".repeat(2200);
    const expanded = { ...decision, policy: { ...decision.policy, references: [{ ...decision.policy.references[0], title: longTitle }] } };
    expect(createInitialDecisionSchema("complaint", ["heading"]).safeParse(expanded).success).toBe(true);
    const full = formatFirstDecision(expanded);
    expect(full.length).toBeGreaterThan(32000);
    expect(full).toContain(longTitle);
    expect(full).toContain(FIRST_ASSESSMENT_NOTICE);
    expect(() => createFirstDecisionMessage(expanded, "initial-sdk-id")).toThrow();
    expect(formatFirstDecision(expanded)).toBe(full);
  });
});
