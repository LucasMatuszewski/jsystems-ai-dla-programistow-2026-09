import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { InitialDecision } from "@/lib/contracts/decision";
import { FIRST_ASSESSMENT_NOTICE, OUTCOME_LABELS, RESALE_LABELS } from "@/lib/contracts/first-message";
import { InitialDecisionDetails } from "./initial-decision-details";
const base: InitialDecision = { caseId: "d6a7c3f7-5711-4e97-ae3e-5195c48c2b95", decisionId: "e6a7c3f7-5711-4e97-ae3e-5195c48c2b95", scenario: "complaint", outcome: "human_verification_required", greeting: "Dzień dobry pracowniku.", summary: "Zgłoszony laptop wymaga sprawdzenia.", justification: ["Uzasadnienie pierwsze.", "Uzasadnienie drugie."], evidence: ["Zgłoszony fakt o sprzęcie."], policyReferences: ["section"], limitations: ["Zdjęcie nie potwierdza działania."], questions: ["Czy wykonano test urządzenia?"], nextSteps: ["Sprawdź sprzęt u pracownika."], resaleAssessment: null, resaleExplanation: null, policy: { version: "private-version", digest: "c".repeat(64), sourceUrl: "https://allegro.pl/pomoc", retrievedAt: "2026-10-01T08:00:00Z", references: [{ headingId: "section", title: "Oficjalna procedura", url: "https://allegro.pl/pomoc/procedura" }] }, createdAt: "2026-10-01T08:00:00Z", modelId: "private-model", preliminary: true, employeeVerificationRequired: true };
describe("immutable full first decision card", () => {
  it("renders each trusted used policy reference once when generated IDs contain duplicates", () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    render(<InitialDecisionDetails decision={{ ...base, policyReferences: ["section", "section"] }} />);
    expect(screen.getAllByRole("link", { name: "Oficjalna procedura" })).toHaveLength(1);
    expect(errors).not.toHaveBeenCalled();
  });
  it("renders greeting, every full section, resolved policy links and fixed verification notice", () => {
    render(<InitialDecisionDetails decision={base} />);
    const article = screen.getByRole("article", { name: "Wstępna ocena początkowa" });
    for (const heading of ["Wstępny wynik", "Podsumowanie", "Uzasadnienie", "Ustalenia i zgłoszone fakty", "Podstawa procedury", "Ograniczenia oceny", "Pytania uzupełniające", "Dalsze kroki pracownika"]) expect(within(article).getByRole("heading", { name: heading })).toBeVisible();
    for (const text of [base.greeting, base.summary, ...base.justification, ...base.evidence, ...base.limitations, ...base.questions, ...base.nextSteps, FIRST_ASSESSMENT_NOTICE]) expect(within(article).getByText(text)).toBeVisible();
    expect(screen.getByRole("link", { name: "Oficjalna procedura" })).toHaveAttribute("href", base.policy.references[0].url);
    expect(article.textContent).not.toContain("private-model"); expect(article.textContent).not.toContain("private-version"); expect(article.textContent).not.toContain(base.policy.digest);
    expect(screen.queryByRole("heading", { name: "Ocena stanu do ponownej sprzedaży" })).not.toBeInTheDocument();
  });
  it.each(Object.entries(OUTCOME_LABELS))("labels outcome %s in Polish", (outcome, label) => {
    render(<InitialDecisionDetails decision={{ ...base, outcome: outcome as InitialDecision["outcome"] }} />); expect(screen.getByText(label)).toBeVisible();
  });
  it.each(Object.entries(RESALE_LABELS))("separates return eligibility from resale %s", (assessment, label) => {
    render(<InitialDecisionDetails decision={{ ...base, scenario: "return", resaleAssessment: assessment as NonNullable<InitialDecision["resaleAssessment"]>, resaleExplanation: "Osobne wyjaśnienie stanu sprzedażowego." }} />);
    expect(screen.getByRole("heading", { name: "Ocena możliwości przyjęcia zwrotu" })).toBeVisible(); expect(screen.getByRole("heading", { name: "Ocena stanu do ponownej sprzedaży" })).toBeVisible(); expect(screen.getByText(label)).toBeVisible(); expect(screen.getByText("Osobne wyjaśnienie stanu sprzedażowego.")).toBeVisible();
  });
  it("shows full long content safely as text without interpreting HTML or truncating", () => {
    const long = "Pełna treść ".repeat(1200) + "OSTATNI FAKT <img src=x onerror=alert(1)>";
    const { container } = render(<InitialDecisionDetails decision={{ ...base, summary: long, limitations: [], questions: [] }} />);
    expect(screen.getByText(long)).toBeVisible(); expect(container.querySelector("img")).toBeNull(); expect(screen.getAllByText("Brak wskazanych informacji.").length).toBeGreaterThanOrEqual(2);
  });
});
