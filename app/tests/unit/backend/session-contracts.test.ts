import { describe, expect, it } from "vitest";
import { draftFormSchema, activeCaseSnapshotSchema, ACTIVE_CASE_STORAGE_KEY, SESSION_CONTRACT_REVISION } from "@/lib/contracts/session";
const caseId = "7b40b034-5e7b-49dc-bb47-e8d8d2d5fc76";
const operationId = "129d4e48-1a61-4a99-b1ac-0d1ce4576c58";
const draft = { scenario: "", category: "", equipmentName: "  wpisana nazwa  ", purchaseDate: "2026-99-99", deliveryDate: "", buyerStatus: "", sellerStatus: "", reason: "  ", requestedRemedy: "" };
const form = { ...draft, scenario: "complaint", category: "other", equipmentName: "Telefon", purchaseDate: "2026-09-30", deliveryDate: null, buyerStatus: "unknown", sellerStatus: "unknown", reason: "Nie działa", requestedRemedy: "repair" };
const analysis = { imageQuality: "limited", observations: [], signsOfUse: [], possibleCauses: [], limitations: [], missingInformation: [], analysisId: operationId, scenario: "complaint", imageDigest: "a".repeat(64), formFingerprint: "b".repeat(64), createdAt: "2026-10-01T00:00:00Z", modelId: "fixture" };
const decision = { outcome: "human_verification_required", greeting: "Dzień dobry", summary: "Sprawdź", justification: ["Wymagane sprawdzenie"], evidence: [], policyReferences: ["heading"], limitations: [], questions: [], nextSteps: ["Sprawdź"], resaleAssessment: null, resaleExplanation: null, decisionId: operationId, caseId, scenario: "complaint", policy: { version: "old-unavailable-version", digest: "c".repeat(64), sourceUrl: "https://example.test/policy", retrievedAt: "2026-09-01T00:00:00Z", references: [{ headingId: "heading", title: "Procedura", url: "https://example.test/policy#heading" }] }, createdAt: "2026-10-01T00:00:00Z", modelId: "fixture", preliminary: true, employeeVerificationRequired: true };
const snapshot = { schemaVersion: 1, caseId, revision: 0, screen: "form", stage: "form", stageStatus: "idle", draftForm: draft, submittedForm: null, timeZone: "Europe/Warsaw", preparedImage: null, imageAnalysis: null, initialDecision: null, messages: [], replyStates: {}, pendingOperation: null, storageWarning: null };
describe("browser snapshot revision one", () => {
  it("freezes the storage key and revision", () => {
    expect(ACTIVE_CASE_STORAGE_KEY).toBe("hardware-service-copilot.active-case");
    expect(SESSION_CONTRACT_REVISION).toBe(1);
  });
  it("preserves incomplete invalid raw draft including whitespace and stale return remedy", () => {
    expect(draftFormSchema.parse(draft)).toEqual(draft);
    expect(draftFormSchema.parse({ ...draft, scenario: "return", requestedRemedy: "repair" }).requestedRemedy).toBe("repair");
    expect(activeCaseSnapshotSchema.safeParse(snapshot).success).toBe(true);
  });
  it.each([0, 2, "1"])("rejects unknown schemaVersion %s without merging fields", schemaVersion => {
    expect(activeCaseSnapshotSchema.safeParse({ ...snapshot, schemaVersion }).success).toBe(false);
  });
  it.each(["apiKey", "serverPrompts", "policyText", "originalFile", "reasoning"])("rejects forbidden stored %s", key => {
    expect(activeCaseSnapshotSchema.safeParse({ ...snapshot, [key]: "private" }).success).toBe(false);
  });
  it("rejects invalid submitted form, missing snapshot fields and unknown enum values", () => {
    expect(activeCaseSnapshotSchema.safeParse({ ...snapshot, submittedForm: draft }).success).toBe(false);
    expect(activeCaseSnapshotSchema.safeParse({ ...snapshot, stage: "complete" }).success).toBe(false);
    expect(activeCaseSnapshotSchema.safeParse({ ...snapshot, revision: -1 }).success).toBe(false);
    expect(activeCaseSnapshotSchema.safeParse({ ...snapshot, timeZone: "+01:00" }).success).toBe(false);
    const { messages: omitted, ...missing } = snapshot;
    void omitted;
    expect(activeCaseSnapshotSchema.safeParse(missing).success).toBe(false);
  });
  it("allows readable stored resolved policy metadata without a live registry", () => {
    expect(activeCaseSnapshotSchema.safeParse({ ...snapshot, submittedForm: form, imageAnalysis: analysis, initialDecision: decision }).success).toBe(true);
  });
  it("rejects cross-case and cross-scenario successful artifacts", () => {
    expect(activeCaseSnapshotSchema.safeParse({ ...snapshot, submittedForm: form, initialDecision: { ...decision, caseId: operationId } }).success).toBe(false);
    expect(activeCaseSnapshotSchema.safeParse({ ...snapshot, submittedForm: form, imageAnalysis: { ...analysis, scenario: "return" } }).success).toBe(false);
  });
  it("requires a real pending operation and validates discriminated chat references", () => {
    expect(activeCaseSnapshotSchema.safeParse({ ...snapshot, stage: "analysis", stageStatus: "pending" }).success).toBe(false);
    expect(activeCaseSnapshotSchema.safeParse({ ...snapshot, stage: "analysis", stageStatus: "pending", pendingOperation: { kind: "analysis", operationId, startedAt: "2026-10-01T00:00:00Z" } }).success).toBe(true);
    expect(activeCaseSnapshotSchema.safeParse({ ...snapshot, stage: "chat", stageStatus: "pending", pendingOperation: { kind: "chat", operationId, startedAt: "2026-10-01T00:00:00Z" } }).success).toBe(false);
  });
  it("retains partial text and stable SDK references in an interrupted snapshot", () => {
    const messages = [{ id: "user-sdk", role: "user", parts: [{ type: "text", text: "Pytanie" }] }, { id: "reply-sdk", role: "assistant", parts: [{ type: "text", text: "Częściowa odpowiedź", state: "streaming" }] }];
    const value = { ...snapshot, stage: "chat", stageStatus: "interrupted", messages, replyStates: { "reply-sdk": "interrupted" }, pendingOperation: { kind: "chat", operationId, startedAt: "2026-10-01T00:00:00Z", userMessageId: "user-sdk", replyMessageId: "reply-sdk" } };
    expect(activeCaseSnapshotSchema.parse(value).messages).toEqual(messages);
    expect(activeCaseSnapshotSchema.safeParse({ ...value, pendingOperation: { ...value.pendingOperation, userMessageId: "other" } }).success).toBe(false);
  });
  it.each(["unavailable", "quota-exceeded", "snapshot-too-large"])("accepts in-memory warning %s", storageWarning => {
    expect(activeCaseSnapshotSchema.safeParse({ ...snapshot, storageWarning }).success).toBe(true);
  });
});
