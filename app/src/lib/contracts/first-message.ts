import type { InitialDecision } from "./decision";
import { caseMessageSchema, type CaseMessage } from "./messages";
export const FIRST_MESSAGE_CONTRACT_REVISION = 1 as const;
export const FIRST_ASSESSMENT_NOTICE = "To wstępna ocena początkowa, a nie ostateczna decyzja. Pracownik musi zweryfikować fakty i właściwą procedurę przed podjęciem decyzji.";
export const OUTCOME_LABELS = Object.freeze({ preliminary_acceptance: "Wstępne przyjęcie", preliminary_refusal: "Wstępna odmowa", additional_information_required: "Wymagane dodatkowe informacje", human_verification_required: "Wymagana weryfikacja pracownika" });
export const RESALE_LABELS = Object.freeze({ no_visible_barrier: "Brak widocznej przeszkody", visible_barrier: "Widoczna przeszkoda", insufficient_evidence: "Niewystarczające informacje" });
const section = (heading: string, content: string) => `## ${heading}\n${content}`;
const list = (items: string[]) => items.length ? items.map(item => `- ${item}`).join("\n") : "Brak wskazanych informacji.";
// Pure deterministic explanatory text only: transport identities, model and policy digest/version stay outside product history.
export function formatFirstDecision(decision: InitialDecision): string {
  const sections = ["# Wstępna ocena początkowa", decision.greeting, section("Wstępny wynik", OUTCOME_LABELS[decision.outcome]), section("Podsumowanie", decision.summary)];
  if (decision.scenario === "return" && decision.resaleAssessment !== null && decision.resaleExplanation !== null) sections.push(section("Ocena możliwości przyjęcia zwrotu", OUTCOME_LABELS[decision.outcome]), section("Ocena stanu do ponownej sprzedaży", `${RESALE_LABELS[decision.resaleAssessment]}\n${decision.resaleExplanation}`));
  sections.push(section("Uzasadnienie", list(decision.justification)), section("Ustalenia i zgłoszone fakty", list(decision.evidence)), section("Podstawa procedury", list(decision.policyReferences.map(id => {
    const reference = decision.policy.references.find(item => item.headingId === id);
    if (!reference) throw new RangeError("Brakuje rozwiązanego odwołania do procedury.");
    return `${reference.title}: ${reference.url}`;
  }))), section("Ograniczenia oceny", list(decision.limitations)), section("Pytania uzupełniające", list(decision.questions)), section("Dalsze kroki pracownika", list(decision.nextSteps)), FIRST_ASSESSMENT_NOTICE);
  return sections.join("\n\n");
}
export function createFirstDecisionMessage(decision: InitialDecision, id: string): CaseMessage {
  // B07 maps an unusable newly generated first message to INVALID_AI_OUTPUT; never truncate its details.
  return caseMessageSchema.parse({ id, role: "assistant", parts: [{ type: "text", text: formatFirstDecision(decision) }] });
}
