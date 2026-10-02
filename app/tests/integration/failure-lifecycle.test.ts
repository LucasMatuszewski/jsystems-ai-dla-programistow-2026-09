import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as analyze } from "@/app/api/analysis/route";
import { POST as decide } from "@/app/api/decisions/route";
import { POST as followUp } from "@/app/api/chat/route";
import { prepareImage } from "@/server/images/prepare-image";
import { createFormFingerprint } from "@/server/cases/form-fingerprint";
import { getAiConfiguration } from "@/server/ai/configuration";
import { loadPolicy, type LoadedPolicy } from "@/server/policies/policy-loader";
import { createImageAnalysisSchema, type ImageAnalysis } from "@/lib/contracts/analysis";
import { createInitialDecisionSchema } from "@/lib/contracts/decision";
import { createFirstDecisionMessage } from "@/lib/contracts/first-message";
import { createChatRequestSchema, type AnalysisRequest, type ChatRequest, type DecisionRequest } from "@/lib/contracts/requests";
import { ERROR_DEFINITIONS, errorEnvelopeSchema, getErrorStatus, type ErrorCode } from "@/lib/contracts/errors";
import { terminalMetadataSchema } from "@/lib/contracts/messages";

const upstream = "https://openrouter.ai/api/v1/chat/completions";
const caseId = "11111111-1111-4111-8111-111111111111";
const operation = (index: number) => `22222222-2222-4222-8222-${String(index).padStart(12, "0")}`;
const realFetch = globalThis.fetch;
const evidence = { imageQuality: "limited", observations: [{ finding: "Widoczna rysa", visibleLocation: "Obudowa" }], signsOfUse: [], possibleCauses: [], limitations: ["Zdjęcie nie pokazuje działania"], missingInformation: ["Wynik testu zasilania"] };
let preparedImage: AnalysisRequest["preparedImage"];
let policy: LoadedPolicy;
let modelId: string;
let calls: { stage: "analysis" | "decision" | "chat"; body: Record<string, unknown> }[];
let remote: (body: Record<string, unknown>, init?: RequestInit) => Promise<Response>;
function deferred<T>() { let release!: (value: T) => void; const promise = new Promise<T>(resolvePromise => { release = resolvePromise; }); return { promise, release }; }
function request(path: string, value: unknown) { return new Request(`http://127.0.0.1:3000/api/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(value) }); }
function analysisInput(index = 1): AnalysisRequest {
  return { caseId, operationId: operation(index), budgetMs: 120000, timeZone: "Europe/Warsaw", preparedImage,
    form: { scenario: "complaint", category: "smartphones-tablets", equipmentName: "Telefon B09", purchaseDate: "2026-01-01", deliveryDate: null, buyerStatus: "unknown", sellerStatus: "business", reason: "Nie włącza się", requestedRemedy: "repair" } };
}
function decisionOutput() { return { outcome: "human_verification_required", greeting: "Dzień dobry", summary: "Wymagana weryfikacja pracownika", justification: ["Zdjęcie nie pokazuje działania"], evidence: ["Pracownik zgłosił brak zasilania"], policyReferences: [policy.headings[0].headingId], limitations: ["Brak testu zasilania"], questions: ["Czy sprawdzono zasilacz?"], nextSteps: ["Pracownik powinien sprawdzić działanie"], resaleAssessment: null, resaleExplanation: null }; }
function storedReport(): ImageAnalysis {
  const value = analysisInput();
  return createImageAnalysisSchema("complaint").parse({ ...evidence, analysisId: "33333333-3333-4333-8333-333333333333", scenario: "complaint", imageDigest: preparedImage.sha256, formFingerprint: createFormFingerprint(value.form), createdAt: "2026-10-02T10:00:00Z", modelId });
}
function chatInput(index: number): ChatRequest {
  const value = analysisInput();
  const initialDecision = createInitialDecisionSchema("complaint", policy.headings.map(heading => heading.headingId)).parse({ ...decisionOutput(), caseId, decisionId: "44444444-4444-4444-8444-444444444444", scenario: "complaint", createdAt: "2026-10-02T10:00:00Z", modelId, preliminary: true, employeeVerificationRequired: true,
    policy: { version: policy.provenance.version, digest: policy.provenance.digest, sourceUrl: policy.provenance.sourceUrl, retrievedAt: policy.provenance.retrievedAt, references: [policy.headings[0]] } });
  return { id: caseId, operationId: operation(index), replyMessageId: `reply-${index}`, trigger: "send-message", caseContext: { form: value.form, timeZone: value.timeZone, imageAnalysis: storedReport(), initialDecision }, messages: [createFirstDecisionMessage(initialDecision, "seed-b09"), { id: "employee-b09", role: "user", parts: [{ type: "text", text: "Zasilacz działa z innym urządzeniem. Jak zmienia to ocenę?" }] }] };
}
function completion(value: unknown, id: string, raw?: string) { return Response.json({ id, object: "chat.completion", created: 1790000000, model: modelId, choices: [{ index: 0, message: { role: "assistant", content: raw ?? JSON.stringify(value) }, finish_reason: "stop" }], usage: { prompt_tokens: 20, completion_tokens: 30, total_tokens: 50 } }); }
function event(content: string | null, finish: string | null = null) { return { id: "gen-b09-fixture-stream-12345678", object: "chat.completion.chunk", created: 1790000000, model: modelId, choices: [{ index: 0, delta: content === null ? {} : { role: "assistant", content }, finish_reason: finish }] }; }
function sse(events: unknown[]) { return new Response(events.map(value => `data: ${JSON.stringify(value)}\n\n`).join("") + "data: [DONE]\n\n", { headers: { "Content-Type": "text/event-stream" } }); }
type Chunk = { type: string; messageId?: string; delta?: string; errorText?: string; messageMetadata?: unknown };
async function chunks(response: Response): Promise<Chunk[]> { const text = await response.text(); return text.split("\n").filter(line => line.startsWith("data: ") && line !== "data: [DONE]").map(line => JSON.parse(line.slice(6))); }
async function expectHttpError(response: Response, status: number, code: ErrorCode, operationId: string) {
  expect(response.status).toBe(status); expect(response.headers.get("cache-control")).toBe("no-store");
  const envelope = errorEnvelopeSchema.parse(await response.json()); expect(envelope.code).toBe(code); expect(envelope.operationId).toBe(operationId);
  expect(envelope.message).toBe(ERROR_DEFINITIONS[code].message); expect(JSON.stringify(envelope).includes("provider-private-b09")).toBe(false);
}
function inspectFailure(parts: Chunk[], operationId: string, code: ErrorCode) {
  const metadata = terminalMetadataSchema.parse([...parts].reverse().find(part => part.messageMetadata !== undefined)?.messageMetadata);
  expect(metadata.operationId).toBe(operationId); expect(metadata.completionState).toBe("incomplete");
  expect(JSON.stringify(parts).includes("provider-private-b09")).toBe(false);
  const frame = parts.find(part => part.type === "error"); expect(Boolean(frame)).toBe(true);
  const envelope = errorEnvelopeSchema.parse(JSON.parse(frame!.errorText!)); expect(envelope.operationId).toBe(operationId);
  expect(envelope.code).toBe(code); expect(envelope.message).toBe(ERROR_DEFINITIONS[code].message); expect(getErrorStatus(envelope.code)).toBe(getErrorStatus(code));
}

describe("cross-stage failures with actual SDK/files/contracts and external LLM HTTP fixtures only", () => {
  beforeAll(async () => {
    preparedImage = await prepareImage(await readFile(resolve("tests/fixtures/images/intact-smartphone.jpg")));
    policy = await loadPolicy("complaint");
  });
  beforeEach(() => {
    // Authorized test-process-only inputs; never read/copy/change real server credentials.
    vi.stubEnv("OPENROUTER_API_KEY", "fixture-only-key"); vi.stubEnv("LLM_MODEL", "openai/gpt-6-luna");
    modelId = getAiConfiguration().modelId;
    calls = []; remote = async () => sse([event("Ocena nadal wymaga weryfikacji pracownika."), event(null, "stop")]);
    vi.stubGlobal("fetch", async (url: string | URL | Request, init?: RequestInit) => {
      if (String(url) !== upstream) return realFetch(url, init);
      const body = JSON.parse(String(init?.body)); const stage = body.stream ? "chat" : body.max_tokens === 12288 ? "decision" : "analysis";
      calls.push({ stage, body }); return remote(body, init);
    });
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
  it("has a healthy real SDK partial-text/error/stop fixture and standard incomplete UI response", async () => {
    const value = chatInput(500); expect(createChatRequestSchema().safeParse(value).success).toBe(true);
    remote = async () => sse([event("Częściowa odpowiedź."), { error: { code: 500, message: "provider-private-b09" } }, event(null, "stop")]);
    const response = await followUp(request("chat", value)); expect(response.status).toBe(200); expect(response.headers.get("x-vercel-ai-ui-message-stream")).toBe("v1");
    const parts = await chunks(response); expect(parts.some(part => part.type === "text-delta")).toBe(true); inspectFailure(parts, value.operationId, "PROVIDER_ERROR"); expect(calls).toHaveLength(1);
  });
  it.each([[401, "PROVIDER_AUTH_ERROR"], [403, "PROVIDER_AUTH_ERROR"], [402, "PROVIDER_QUOTA_OR_RATE_LIMIT"], [429, "PROVIDER_QUOTA_OR_RATE_LIMIT"]] as const)("maps embedded SSE%s after partial text/HTTP200 without treating laterstop as completion", async (status, code) => {
    const value = chatInput(status);
    remote = async () => sse([event("Częściowa odpowiedź."), { error: { code: status, message: "provider-private-b09" } }, event(null, "stop")]);
    const response = await followUp(request("chat", value)); expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("no-store");
    const parts = await chunks(response); expect(parts.some(part => part.type === "text-delta")).toBe(true); expect(parts.find(part => part.type === "start")?.messageId).toBe(value.replyMessageId);
    inspectFailure(parts, value.operationId, code); expect(calls).toHaveLength(1);
  });
  it.each(["analysis", "chat"] as const)("maps an actual external HTTP transport rejection in %s without retry or input mutation", async stage => {
    remote = async () => { throw new TypeError("provider-private-b09 network disconnect"); };
    const value = stage === "analysis" ? analysisInput(601) : chatInput(602); const before = JSON.stringify(value);
    const response = stage === "analysis" ? await analyze(request("analysis", value)) : await followUp(request("chat", value));
    if (stage === "analysis") await expectHttpError(response, 502, "PROVIDER_ERROR", value.operationId);
    else { expect(response.status).toBe(200); inspectFailure(await chunks(response), value.operationId, "PROVIDER_ERROR"); }
    expect(JSON.stringify(value) === before).toBe(true); expect(calls).toHaveLength(1);
  });
  it("rejects truncated generated image evidence as invalid output, retaining full submitted facts", async () => {
    remote = async () => completion({}, "gen-b09-fixture-truncated-12345678", '{"imageQuality":"limited","observations":[');
    const value = analysisInput(603); const before = JSON.stringify(value);
    await expectHttpError(await analyze(request("analysis", value)), 502, "INVALID_AI_OUTPUT", value.operationId); expect(JSON.stringify(value) === before).toBe(true); expect(calls).toHaveLength(1);
  });
  it("rejects late analysis after its remaining budget even when external transport ignores abort", async () => {
    const ready = deferred<void>(); const late = deferred<Response>(); const settled = deferred<void>(); let signal: AbortSignal | null | undefined;
    remote = async (_body, init) => { signal = init?.signal; ready.release(); return late.promise.finally(() => settled.release()); };
    const value = { ...analysisInput(604), budgetMs: 500 }; const pending = analyze(request("analysis", value));
    try {
      await ready.promise; await expectHttpError(await pending, 504, "OPERATION_TIMEOUT", value.operationId); expect(signal?.aborted).toBe(true);
    } finally { late.release(completion(evidence, "gen-b09-fixture-late-analysis-12345678")); }
    await settled.promise; await new Promise<void>(resolveTick => setImmediate(resolveTick)); expect(calls).toHaveLength(1);
  }, 5000);
  it("honors remaining initial budget and permits explicit decision-only retry from the saved actual analysis checkpoint", async () => {
    const late = deferred<Response>(); const settled = deferred<void>(); let decisionAttempts = 0; let expiredSignal: AbortSignal | null | undefined;
    remote = async (body, init) => {
      if (body.max_tokens !== 12288) return completion(evidence, "gen-b09-fixture-checkpoint-analysis-12345678");
      decisionAttempts++;
      if (decisionAttempts === 1) { expiredSignal = init?.signal; return late.promise.finally(() => settled.release()); }
      return completion(decisionOutput(), "gen-b09-fixture-retry-decision-12345678");
    };
    const started = performance.now(); const initialBudget = 1000; const formInput = { ...analysisInput(610), budgetMs: initialBudget };
    const response = await analyze(request("analysis", formInput)); expect(response.status).toBe(200);
    const report = createImageAnalysisSchema("complaint").parse(await response.json()); const checkpoint = JSON.stringify({ form: formInput.form, report });
    const remaining = Math.floor(initialBudget - (performance.now() - started)); expect(remaining).toBeGreaterThan(0); expect(remaining).toBeLessThan(initialBudget);
    const value: DecisionRequest = { caseId, operationId: operation(611), budgetMs: remaining, form: formInput.form, timeZone: formInput.timeZone, imageAnalysis: report };
    try {
      await expectHttpError(await decide(request("decisions", value)), 504, "OPERATION_TIMEOUT", value.operationId);
      expect(expiredSignal?.aborted).toBe(true); expect(performance.now() - started).toBeLessThan(1800);
      const retry = await decide(request("decisions", { ...value, operationId: operation(612), budgetMs: 120000 })); expect(retry.status).toBe(200);
      const result = createInitialDecisionSchema("complaint", policy.headings.map(heading => heading.headingId)).parse(await retry.json()); expect(result.caseId).toBe(caseId);
      expect(JSON.stringify({ form: formInput.form, report }) === checkpoint).toBe(true); expect(calls.map(call => call.stage)).toEqual(["analysis", "decision", "decision"]);
    } finally { late.release(completion(decisionOutput(), "gen-b09-fixture-late-decision-12345678")); }
    await settled.promise; await new Promise<void>(resolveTick => setImmediate(resolveTick)); expect(decisionAttempts).toBe(2);
  }, 5000);
});
