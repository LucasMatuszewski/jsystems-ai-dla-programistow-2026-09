import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CaseForm } from "@/lib/contracts/form";
import type { ImageAnalysis } from "@/lib/contracts/analysis";
import { buildChatPrompt, buildInitialDecisionPrompt } from "@/server/prompts/builder";
const mocks = vi.hoisted(() => ({ read: vi.fn(), parse: vi.fn(), policy: vi.fn(), references: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("node:fs/promises", () => ({ readFile: mocks.read }));
vi.mock("node:path", () => ({ resolve: (...parts: string[]) => parts.join("/") }));
vi.mock("@/lib/contracts/requests", () => ({ storedCaseFormSchema: { parse: mocks.parse }, timeZoneSchema: { parse: mocks.parse }, caseContextSchema: { parse: mocks.parse } }));
vi.mock("@/lib/contracts/analysis", () => ({ createImageAnalysisSchema: () => ({ parse: mocks.parse }) }));
vi.mock("@/lib/contracts/messages", () => ({ eligibleHistorySchema: { parse: mocks.parse } }));
vi.mock("@/server/policies/policy-loader", () => ({ loadPolicy: mocks.policy, resolvePolicyReferences: mocks.references }));
vi.mock("@/server/http/errors", () => ({ OperationError: class extends Error { constructor(public code: string) { super(code); } } }));
// These resource files are the targets under test, not runtime filesystem collaborators.
const resources = {
  complaint: readFileSync(new URL("../../../resources/prompts/complaint-decision.md", import.meta.url), "utf8"),
  return: readFileSync(new URL("../../../resources/prompts/return-decision.md", import.meta.url), "utf8"),
};
const reference = { headingId: "official-heading", title: "Oficjalna procedura", url: "https://example.test/policy#official-heading" };
const provenance = { version: "v1", digest: "a".repeat(64), sourceUrl: "https://example.test/policy", retrievedAt: "2026-10-01T10:00:00Z" };
function facts(scenario: "complaint" | "return") {
  const form = { scenario, category: "smartphones-tablets", equipmentName: "Telefon", purchaseDate: "2026-01-01", deliveryDate: null, buyerStatus: "consumer", sellerStatus: "business", reason: "Nie działa", requestedRemedy: scenario === "complaint" ? "repair" : null } as CaseForm;
  const imageAnalysis = { scenario, imageQuality: "limited", observations: [], signsOfUse: [], possibleCauses: [], limitations: ["Jedno zdjęcie"], missingInformation: [] } as unknown as ImageAnalysis;
  return { form, timeZone: "Europe/Warsaw", imageAnalysis };
}
beforeEach(() => {
  mocks.parse.mockImplementation(value => structuredClone(value));
  mocks.read.mockImplementation(async path => resources[String(path).includes("complaint-decision.md") ? "complaint" : "return"]);
  mocks.policy.mockImplementation(async scenario => ({ scenario, html: "complete selected policy fixture", provenance, headings: [reference] }));
  mocks.references.mockReturnValue([reference]);
});
describe("decision resources distinguish product Polish from machine enum values", () => {
  it.each(["complaint", "return"] as const)("explicitly preserves schema enums while translating explanatory facts for %s initial and follow-up", async scenario => {
    const selected = resources[scenario];
    expect(selected.includes("employee-facing explanatory string fields")).toBe(true);
    expect(selected.includes("category, buyer status, seller status and requested remedy")).toBe(true);
    expect(selected.includes("natural Polish")).toBe(true);
    expect(selected.includes("consumer, business and unknown")).toBe(true);
    expect(selected.includes("initial assessments and follow-up replies")).toBe(true);
    expect(selected.includes("Preserve required machine-readable enum fields")).toBe(true);
    expect(selected.includes("official policyReferences heading IDs exactly")).toBe(true);
    const initial = facts(scenario); const initialPrompt = await buildInitialDecisionPrompt(initial);
    const initialFacts = JSON.parse(initialPrompt.messages[0].content.split("\n")[1]);
    expect(initialPrompt.system.includes(selected)).toBe(true); expect(initialFacts.form).toEqual(initial.form);
    const initialDecision = { scenario, policy: { ...provenance, references: [reference] }, policyReferences: [reference.headingId] };
    const caseContext = { ...initial, initialDecision } as Parameters<typeof buildChatPrompt>[0]["caseContext"];
    const chatPrompt = await buildChatPrompt({ caseContext, messages: [{ id: "first", role: "assistant", parts: [{ type: "text", text: "Ocena początkowa" }] }, { id: "user", role: "user", parts: [{ type: "text", text: "Nowy fakt" }] }] });
    expect(chatPrompt.system.includes(selected)).toBe(true);
    expect(JSON.parse(chatPrompt.messages[0].content.split("\n")[1]).form).toEqual(initial.form);
  });
});
