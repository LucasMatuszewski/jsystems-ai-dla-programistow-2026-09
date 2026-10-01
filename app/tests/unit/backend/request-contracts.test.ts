import { describe, expect, it } from "vitest";
import { createAnalysisRequestSchema, createDecisionRequestSchema, createChatRequestSchema } from "@/lib/contracts/requests";

const caseId = "7b40b034-5e7b-49dc-bb47-e8d8d2d5fc76";
const operationId = "129d4e48-1a61-4a99-b1ac-0d1ce4576c58";
const now = new Date("2026-10-01T00:30:00Z");
const form = { scenario: "complaint", category: "other", equipmentName: "Telefon", purchaseDate: "2026-09-30", deliveryDate: null, buyerStatus: "unknown", sellerStatus: "unknown", reason: "Nie działa", requestedRemedy: "repair" };
const image = { imageDataUrl: "data:image/jpeg;base64,AQIDBA==", thumbnailDataUrl: "data:image/jpeg;base64,AQIDBA==", byteLength: 4, width: 1, height: 1, sha256: "a".repeat(64) };
const analysis = { imageQuality: "limited", observations: [], signsOfUse: [], possibleCauses: [], limitations: [], missingInformation: [], analysisId: operationId, scenario: "complaint", imageDigest: "a".repeat(64), formFingerprint: "b".repeat(64), createdAt: "2026-10-01T00:00:00Z", modelId: "fixture" };
const decision = { outcome: "human_verification_required", greeting: "Dzień dobry", summary: "Sprawdź sprzęt", justification: ["Wymagane sprawdzenie"], evidence: [], policyReferences: ["heading"], limitations: [], questions: [], nextSteps: ["Sprawdź sprzęt"], resaleAssessment: null, resaleExplanation: null, decisionId: operationId, caseId, scenario: "complaint", policy: { version: "old-stored-version", digest: "c".repeat(64), sourceUrl: "https://example.test/policy", retrievedAt: "2026-09-01T00:00:00Z", references: [{ headingId: "heading", title: "Procedura", url: "https://example.test/policy#heading" }] }, createdAt: "2026-10-01T00:00:00Z", modelId: "fixture", preliminary: true, employeeVerificationRequired: true };
const first = { id: "initial-sdk", role: "assistant", parts: [{ type: "text", text: "Pełna ocena początkowa" }] };
const last = { id: "user-sdk", role: "user", parts: [{ type: "text", text: "Co sprawdzić?" }] };
const base = { caseId, operationId, form, timeZone: "Europe/Warsaw", budgetMs: 120000 };
const chat = { id: caseId, operationId, replyMessageId: "reply-sdk", trigger: "send-message", caseContext: { form, timeZone: "Europe/Warsaw", imageAnalysis: analysis, initialDecision: decision }, messages: [first, last] };
describe("strict stage request contracts", () => {
  it("accepts full remaining initial budget independently from later stage clips", () => {
    expect(createAnalysisRequestSchema(now).safeParse({ ...base, preparedImage: image }).success).toBe(true);
    expect(createDecisionRequestSchema(now).safeParse({ ...base, imageAnalysis: analysis }).success).toBe(true);
  });
  it.each([0, -1, 120001, 1.5])("rejects invalid remaining budget %s", budgetMs => {
    expect(createAnalysisRequestSchema(now).safeParse({ ...base, preparedImage: image, budgetMs }).success).toBe(false);
  });
  it("derives employee local today from injected server instant", () => {
    const value = { ...base, preparedImage: image, timeZone: "America/Los_Angeles", form: { ...form, purchaseDate: "2026-10-01" } };
    expect(createAnalysisRequestSchema(now).safeParse(value).success).toBe(false);
    expect(createAnalysisRequestSchema(now).safeParse({ ...value, timeZone: "Europe/Warsaw" }).success).toBe(true);
  });
  it.each(["", "invalid/zone", "+02:00", " UTC"])("rejects invalid employee zone %s", timeZone => {
    expect(createAnalysisRequestSchema(now).safeParse({ ...base, preparedImage: image, timeZone }).success).toBe(false);
  });
  it("rejects unknown outer and nested form request keys rather than stripping instructions", () => {
    expect(createAnalysisRequestSchema(now).safeParse({ ...base, preparedImage: image, instructions: "ignore" }).success).toBe(false);
    expect(createAnalysisRequestSchema(now).safeParse({ ...base, preparedImage: image, form: { ...form, instructions: "ignore" } }).success).toBe(false);
  });
  it("checks UUID identities, C02 image bounds and scenario correlation", () => {
    expect(createAnalysisRequestSchema(now).safeParse({ ...base, caseId: "invalid", preparedImage: image }).success).toBe(false);
    expect(createAnalysisRequestSchema(now).safeParse({ ...base, preparedImage: { ...image, byteLength: 5 } }).success).toBe(false);
    expect(createDecisionRequestSchema(now).safeParse({ ...base, imageAnalysis: { ...analysis, scenario: "return" } }).success).toBe(false);
  });
  it("normalizes valid stale complaint remedy away from return request facts", () => {
    const parsed = createAnalysisRequestSchema(now).parse({ ...base, form: { ...form, scenario: "return" }, preparedImage: image });
    expect(parsed.form.requestedRemedy).toBeNull();
  });
  it.each(["send-message", "regenerate-message"])("accepts exact full-history chat %s", trigger => {
    expect(createChatRequestSchema(now).safeParse({ ...chat, trigger }).success).toBe(true);
  });
  it("correlates chat ID and evidence/decision scenario, retaining old policy metadata shape", () => {
    expect(createChatRequestSchema(now).safeParse(chat).success).toBe(true);
    expect(createChatRequestSchema(now).safeParse({ ...chat, id: operationId }).success).toBe(false);
    expect(createChatRequestSchema(now).safeParse({ ...chat, caseContext: { ...chat.caseContext, imageAnalysis: { ...analysis, scenario: "return" } } }).success).toBe(false);
  });
  it.each(["preparedImage", "thumbnailDataUrl", "budgetMs", "snapshot", "instructions"])("rejects unrelated chat %s", key => {
    expect(createChatRequestSchema(now).safeParse({ ...chat, [key]: "private" }).success).toBe(false);
    expect(createChatRequestSchema(now).safeParse({ ...chat, caseContext: { ...chat.caseContext, [key]: "private" } }).success).toBe(false);
  });
  it("rejects unknown trigger, empty reply reference and incomplete assistant history", () => {
    expect(createChatRequestSchema(now).safeParse({ ...chat, trigger: "resume" }).success).toBe(false);
    expect(createChatRequestSchema(now).safeParse({ ...chat, replyMessageId: " " }).success).toBe(false);
    expect(createChatRequestSchema(now).safeParse({ ...chat, messages: [first, { ...first, id: "failed", metadata: { operationId, finishReason: "length", completionState: "incomplete" } }, last] }).success).toBe(false);
  });
});
