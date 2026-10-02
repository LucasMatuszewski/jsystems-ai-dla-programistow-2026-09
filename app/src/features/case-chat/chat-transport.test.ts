import { describe, expect, it, vi } from "vitest";
import type { UIMessage } from "ai";
import type { ActiveCaseSnapshot } from "@/lib/contracts/session";
import { createChatRequestSchema } from "@/lib/contracts/requests";
import { ERROR_DEFINITIONS } from "@/lib/contracts/errors";
import { createCaseChatTransport, prepareChatBody, projectChatMessages, safeChatError } from "./chat-transport";

const id = "d6a7c3f7-5711-4e97-ae3e-5195c48c2b95";
const operationId = "e6a7c3f7-5711-4e97-ae3e-5195c48c2b95";
const form = { scenario: "complaint", category: "computers", equipmentName: "Laptop", purchaseDate: "2026-01-01", deliveryDate: null, buyerStatus: "unknown", sellerStatus: "business", reason: "Nie działa.", requestedRemedy: "repair" } as const;
const analysis = { analysisId: id, scenario: "complaint" as const, imageDigest: "a".repeat(64), formFingerprint: "b".repeat(64), createdAt: "2026-10-01T08:00:00Z", modelId: "private-model", imageQuality: "adequate" as const, observations: [], signsOfUse: [], possibleCauses: [], limitations: [], missingInformation: [] };
const decision = { caseId: id, decisionId: operationId, scenario: "complaint" as const, outcome: "human_verification_required" as const, greeting: "Dzień dobry.", summary: "Pełna ocena.", justification: ["Sprawdź fakty."], evidence: [], policyReferences: ["section"], limitations: [], questions: [], nextSteps: ["Sprawdź sprzęt."], resaleAssessment: null, resaleExplanation: null, policy: { version: "1", digest: "c".repeat(64), sourceUrl: "https://allegro.pl/pomoc", retrievedAt: "2026-10-01T08:00:00Z", references: [{ headingId: "section", title: "Procedura", url: "https://allegro.pl/pomoc" }] }, createdAt: "2026-10-01T08:00:00Z", modelId: "private-model", preliminary: true as const, employeeVerificationRequired: true as const };
const first = { id: "first", role: "assistant" as const, parts: [{ type: "text" as const, text: "Pełna ocena." }] };
const snapshot: ActiveCaseSnapshot = { schemaVersion: 1, caseId: id, revision: 4, screen: "chat", stage: "chat", stageStatus: "idle", draftForm: form, submittedForm: form, timeZone: "Europe/Warsaw", preparedImage: null, imageAnalysis: analysis, initialDecision: decision, messages: [first], replyStates: { first: "complete", second: "complete", partial: "interrupted" }, pendingOperation: null, storageWarning: "quota-exceeded" };
const metadata = { operationId, finishReason: "stop" as const, completionState: "complete" as const };
describe("full text-only chat request", () => {
  it("defers context reads until a request and builds the actual SDK HTTP body from current facts", async () => {
    let current = snapshot;
    const read = vi.fn(() => current);
    const fetch = vi.fn().mockResolvedValue(new Response('data: [DONE]\n\n', { headers: { "Content-Type": "text/event-stream" } }));
    vi.stubGlobal("fetch", fetch);
    const transport = createCaseChatTransport(read, () => ({ operationId, replyMessageId: "fresh-reply" }));
    expect(read).not.toHaveBeenCalled();
    current = { ...snapshot, submittedForm: { ...form, equipmentName: "Aktualny fakt" } };
    await transport.sendMessages({ chatId: id, messages: [first, { id: "user", role: "user", parts: [{ type: "text", text: "Pytanie" }] }], trigger: "submit-message", messageId: "user", abortSignal: undefined });
    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body).toMatchObject({ id, operationId, replyMessageId: "fresh-reply", trigger: "send-message", caseContext: { form: { equipmentName: "Aktualny fakt" } } });
    expect(Object.keys(body).sort()).toEqual(["caseContext", "id", "messages", "operationId", "replyMessageId", "trigger"]);
    expect(read).toHaveBeenCalledTimes(1);
  });
  it("projects actual SDK structural markers without losing text, identity or terminal metadata", () => {
    const messages: UIMessage[] = [{ id: "second", role: "assistant", parts: [{ type: "step-start" }, { type: "text", text: "Pierwsza " }, { type: "text", text: "druga", state: "done" }], metadata }];
    expect(projectChatMessages(messages)).toEqual([{ ...messages[0], parts: messages[0].parts.slice(1) }]);
  });
  it.each([undefined, { openrouter: { annotation: "PRIVATE_PROVIDER_ANNOTATION" } }])("projects SDK annotated text into canonical content without leaking provider fields: %j", providerMetadata => {
    const input: UIMessage[] = [first, { id: "u1", role: "user", parts: [{ type: "text", text: "Pytanie" }] }, { id: "second", role: "assistant", parts: [{ type: "step-start" }, { type: "text", text: "Pierwsza część ", state: "done", providerMetadata }, { type: "text", text: "ostatni fakt", state: "done", providerMetadata }], metadata }, { id: "u2", role: "user", parts: [{ type: "text", text: "Kolejne pytanie" }] }];
    const original = structuredClone(input);
    const projected = projectChatMessages(input);
    expect(projected[2]).toEqual({ id: "second", role: "assistant", parts: [{ type: "text", text: "Pierwsza część ", state: "done" }, { type: "text", text: "ostatni fakt", state: "done" }], metadata });
    expect(projected[0]).toEqual(first); expect(input).toEqual(original);
    const body = prepareChatBody(snapshot, input, operationId, "fresh-reply", "submit-message");
    expect(body.messages[2].parts.map(part => part.text).join("")).toBe("Pierwsza część ostatni fakt");
    expect(JSON.stringify({ projected, body })).not.toContain("providerMetadata");
    expect(JSON.stringify({ projected, body })).not.toContain("PRIVATE_PROVIDER_ANNOTATION");
  });
  it.each(["reasoning", "file", "dynamic-tool"])("rejects unexpected %s parts rather than silently truncating history", type => {
    expect(() => projectChatMessages([{ ...first, parts: [{ type, text: "Nie wysyłaj." }] } as unknown as UIMessage])).toThrow();
  });
  it("sends current context and every eligible preceding turn, excludes partial replies and storage/image extras", () => {
    const messages: UIMessage[] = [first, { id: "u1", role: "user", parts: [{ type: "text", text: "Pytanie pierwsze" }] }, { id: "second", role: "assistant", parts: [{ type: "step-start" }, { type: "text", text: "Cała odpowiedź" }], metadata }, { id: "u2", role: "user", parts: [{ type: "text", text: "Pytanie drugie" }] }, { id: "partial", role: "assistant", parts: [{ type: "text", text: "Część" }], metadata: { ...metadata, completionState: "incomplete" } }, { id: "u3", role: "user", parts: [{ type: "text", text: "Pełne ostatnie pytanie" }] }];
    const body = prepareChatBody(snapshot, messages, operationId, "fresh-reply", "submit-message");
    expect(createChatRequestSchema().safeParse(body).success).toBe(true);
    expect(body).toEqual({ id, operationId, replyMessageId: "fresh-reply", trigger: "send-message", caseContext: { form, timeZone: "Europe/Warsaw", imageAnalysis: analysis, initialDecision: decision }, messages: [messages[0], messages[1], { id: "second", role: "assistant", parts: [{ type: "text", text: "Cała odpowiedź" }] }, messages[3], messages[5]] });
    expect(prepareChatBody({ ...snapshot, submittedForm: { ...form, equipmentName: "Nowy fakt" } }, messages, operationId, "other-reply", "regenerate-message")).toMatchObject({ trigger: "regenerate-message", caseContext: { form: { equipmentName: "Nowy fakt" } } });
  });
  it("rejects overwriting a preceding reply and context excess rather than dropping history", () => {
    const user = { id: "user", role: "user" as const, parts: [{ type: "text" as const, text: "Pytanie" }] };
    expect(() => prepareChatBody(snapshot, [first, user], operationId, "first", "submit-message")).toThrow();
    expect(() => prepareChatBody(snapshot, [first, { ...user, parts: [{ type: "text", text: "x".repeat(4001) }] }], operationId, "fresh", "submit-message")).toThrow();
  });
  it("uses canonical Polish errors and validates operation identity without exposing provider text", () => {
    const envelope = { code: "CONTEXT_LIMIT", message: "PRIVATE_PROVIDER_BLOB", retryable: true, operationId };
    expect(safeChatError(new Error(JSON.stringify(envelope)), operationId)).toEqual({ message: ERROR_DEFINITIONS.CONTEXT_LIMIT.message, retryable: false });
    expect(safeChatError(new Error(JSON.stringify({ ...envelope, operationId: id })), operationId)).toEqual({ message: ERROR_DEFINITIONS.PROVIDER_ERROR.message, retryable: true });
    expect(safeChatError(new Error("PRIVATE_PROVIDER_BLOB"), operationId)).toEqual({ message: ERROR_DEFINITIONS.PROVIDER_ERROR.message, retryable: true });
  });
  it("maps shared context-limit validation failures to canonical safe action text", () => {
    let failure: unknown;
    try { prepareChatBody(snapshot, [first, ...Array.from({ length: 41 }, (_, index) => ({ id: `u-${index}`, role: "user" as const, parts: [{ type: "text" as const, text: "Pytanie" }] }))], operationId, "fresh", "submit-message"); } catch (error) { failure = error; }
    expect(safeChatError(failure, operationId)).toEqual({ message: ERROR_DEFINITIONS.CONTEXT_LIMIT.message, retryable: false });
  });
});
