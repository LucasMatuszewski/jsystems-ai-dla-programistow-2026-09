import { copyFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { POST, runtime } from "@/app/api/decisions/route";
import { initialDecision } from "@/server/ai/initial-decision";
import { createOperationDeadline } from "@/server/ai/deadline";
import { createFormFingerprint } from "@/server/cases/form-fingerprint";
import { loadPolicy, type LoadedPolicy } from "@/server/policies/policy-loader";
import { createInitialDecisionOutputSchema, createInitialDecisionSchema, type InitialDecisionOutput } from "@/lib/contracts/decision";
import { createFirstDecisionMessage } from "@/lib/contracts/first-message";
import { errorEnvelopeSchema } from "@/lib/contracts/errors";
import type { DecisionRequest } from "@/lib/contracts/requests";

const endpoint = "http://127.0.0.1:3000/api/decisions";
const upstream = "https://openrouter.ai/api/v1/chat/completions";
const caseId = "11111111-1111-4111-8111-111111111111";
const operationId = "22222222-2222-4222-8222-222222222222";
const realFetch = globalThis.fetch;
let policies: Record<"complaint" | "return", LoadedPolicy>;
let calls: Record<string, unknown>[];
let remote: (init?: RequestInit) => Promise<Response>;
function input(scenario: "complaint" | "return" = "complaint"): DecisionRequest {
  const form = { scenario, category: "smartphones-tablets" as const, equipmentName: "Telefon", purchaseDate: "2026-01-01", deliveryDate: null, buyerStatus: "unknown" as const, sellerStatus: "business" as const, reason: "Urządzenie nie włącza się", requestedRemedy: scenario === "complaint" ? "repair" as const : null } as DecisionRequest["form"];
  return { caseId, operationId, budgetMs: 120000, timeZone: "Europe/Warsaw", form, imageAnalysis: {
    analysisId: "33333333-3333-4333-8333-333333333333", scenario, imageDigest: "a".repeat(64), formFingerprint: createFormFingerprint(form), createdAt: "2026-10-01T10:00:00Z", modelId: "openai/gpt-6-luna",
    imageQuality: "limited", observations: [{ finding: "Widoczna rysa", visibleLocation: "Obudowa" }], signsOfUse: [], possibleCauses: [], limitations: ["Jedno zdjęcie nie pokazuje działania"], missingInformation: ["Wynik testu działania"],
  } } as DecisionRequest;
}
function output(scenario: "complaint" | "return" = "complaint"): InitialDecisionOutput {
  return { outcome: "human_verification_required", greeting: "Dzień dobry", summary: "Potrzebna weryfikacja przez pracownika", justification: ["Zdjęcie nie pokazuje działania urządzenia"], evidence: ["Pracownik zgłosił problem z uruchomieniem"], policyReferences: [policies[scenario].headings[0].headingId], limitations: ["Brak testu działania"], questions: ["Czy sprawdzono zasilanie?"], nextSteps: ["Pracownik powinien zweryfikować objawy przed decyzją"], resaleAssessment: scenario === "return" ? "insufficient_evidence" : null, resaleExplanation: scenario === "return" ? "Zdjęcie nie pozwala ocenić kompletności i działania" : null };
}
function request(value: unknown, signal?: AbortSignal) { return new Request(endpoint, { method: "POST", body: JSON.stringify(value), headers: { "Content-Type": "application/json" }, signal }); }
function completion(value: unknown = output(), finish = "stop", content?: string, id = "gen-fixture-decision-12345678") {
  return Response.json({ id, object: "chat.completion", created: 1790000000, model: "openai/gpt-6-luna", choices: [{ index: 0, message: { role: "assistant", content: content ?? JSON.stringify(value) }, finish_reason: finish }], usage: { prompt_tokens: 20, completion_tokens: 30, total_tokens: 50 } });
}
async function error(response: Response, status: number, code: string) {
  expect(response.status).toBe(status); expect(response.headers.get("cache-control")).toBe("no-store");
  const envelope = errorEnvelopeSchema.parse(await response.json()); expect(envelope.code).toBe(code);
  expect(JSON.stringify(envelope).includes("private")).toBe(false); return envelope;
}
describe("real initial decision stack with only external LLM HTTP substituted", () => {
  beforeAll(async () => { policies = { complaint: await loadPolicy("complaint"), return: await loadPolicy("return") }; });
  beforeEach(() => {
    calls = []; remote = async () => completion();
    vi.stubEnv("OPENROUTER_API_KEY", "fixture-only-key"); vi.stubEnv("LLM_MODEL", "openai/gpt-6-luna");
    vi.stubGlobal("fetch", async (url: string | URL | Request, init?: RequestInit) => {
      if (String(url) !== upstream) return realFetch(url, init);
      calls.push(JSON.parse(String(init?.body))); return remote(init);
    });
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
  it.each(["complaint", "return"] as const)("uses the complete selected %s policy and trusted metadata with one structured generation", async scenario => {
    remote = async () => completion(output(scenario)); const started = Date.now(); const response = await POST(request(input(scenario)));
    expect(runtime).toBe("nodejs"); expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("no-store");
    const policy = policies[scenario]; const decision = createInitialDecisionSchema(scenario, policy.headings.map(heading => heading.headingId)).parse(await response.json());
    expect(decision.caseId).toBe(caseId); expect(decision.scenario).toBe(scenario); expect(decision.decisionId).not.toBe(caseId); expect(decision.decisionId).not.toBe(operationId);
    expect(decision.modelId).toBe("openai/gpt-6-luna"); expect(Date.parse(decision.createdAt)).toBeGreaterThanOrEqual(started);
    expect(decision.preliminary).toBe(true); expect(decision.employeeVerificationRequired).toBe(true);
    expect(decision.policy).toEqual({ version: policy.provenance.version, digest: policy.provenance.digest, sourceUrl: policy.provenance.sourceUrl, retrievedAt: policy.provenance.retrievedAt, references: [policy.headings[0]] });
    expect(calls).toHaveLength(1); expect(calls[0].max_tokens).toBe(12288); expect(calls[0].reasoning).toEqual({ effort: "medium", exclude: true });
    expect("temperature" in calls[0]).toBe(false); expect("top_p" in calls[0]).toBe(false); expect("models" in calls[0]).toBe(false);
    const messages = calls[0].messages as { role: string; content: string | { type: string; text?: string }[] }[];
    const allText = messages.flatMap(message => typeof message.content === "string" ? [message.content] : message.content.filter(part => part.type === "text").map(part => part.text ?? "")).join("\n");
    expect(allText.includes(policy.html)).toBe(true); expect(allText.includes(policies[scenario === "complaint" ? "return" : "complaint"].html)).toBe(false);
    const first = createFirstDecisionMessage(decision, "first-sdk"); const text = first.parts.map(part => part.text).join("");
    for (const label of ["Dzień dobry", "Wstępna ocena początkowa", "Uzasadnienie", "Podstawa procedury", "Ograniczenia oceny", "Dalsze kroki pracownika"]) expect(text.includes(label)).toBe(true);
    if (scenario === "return") { expect(text.includes("Ocena możliwości przyjęcia zwrotu")).toBe(true); expect(text.includes("Ocena stanu do ponownej sprzedaży")).toBe(true); }
  });
  it("normalizes equivalent raw form facts before fingerprint comparison", async () => {
    const value = input(); value.form.equipmentName = " Telefon "; value.form.reason = " Urządzenie nie włącza się ";
    expect((await POST(request(value))).status).toBe(200); expect(calls).toHaveLength(1);
  });
  it.each([
    { form: { equipmentName: " " } }, { form: { purchaseDate: "9999-12-31" } }, { timeZone: "not-a-zone" }, { budgetMs: 0 },
    { imageAnalysis: { scenario: "return" } }, { imageAnalysis: { formFingerprint: "0".repeat(64) } }, { form: { reason: "Inny problem" } },
  ])("rejects invalid/currently stale evidence before upstream and retains valid operation identity: %j", async patch => {
    const value = input(); const raw = { ...value, ...patch, form: { ...value.form, ...("form" in patch ? patch.form : {}) }, imageAnalysis: { ...value.imageAnalysis, ...("imageAnalysis" in patch ? patch.imageAnalysis : {}) } };
    const envelope = await error(await POST(request(raw)), 422, "VALIDATION_ERROR"); expect(envelope.operationId).toBe(operationId); expect(calls).toHaveLength(0);
  });
  it.each([
    { decisionId: caseId }, { preliminary: false }, { outcome: "final_approval" }, { greeting: " " }, { policyReferences: ["unknown-heading"] },
    { policyReferences: [] }, { justification: [] }, { resaleAssessment: "no_visible_barrier", resaleExplanation: "Nie widać przeszkód" }, { summary: "x".repeat(24001) },
    { outcome: "preliminary_refusal", evidence: [] }, { outcome: "preliminary_refusal", justification: [] },
    { outcome: "additional_information_required", questions: [] }, { outcome: "human_verification_required", nextSteps: [] },
  ].map((patch, index) => ({ patch, label: `invalid-output-${index + 1}` })))("rejects structurally invalid generated decisions without success: $label", async ({ patch }) => {
    remote = async () => completion({ ...output(), ...patch }); await error(await POST(request(input())), 502, "INVALID_AI_OUTPUT"); expect(calls).toHaveLength(1);
  });
  it.each([{ resaleAssessment: null, resaleExplanation: null }, { resaleAssessment: "new", resaleExplanation: "Działa" }, { resaleAssessment: "insufficient_evidence", resaleExplanation: " " }])("requires distinct return resale output: %j", async patch => {
    remote = async () => completion({ ...output("return"), ...patch }); await error(await POST(request(input("return"))), 502, "INVALID_AI_OUTPUT");
  });
  it("deduplicates only used official headings without an extra formatting model call", async () => {
    const value = output(); value.policyReferences = [value.policyReferences[0], value.policyReferences[0]]; remote = async () => completion(value);
    const response = await POST(request(input())); expect(response.status).toBe(200); const decision = await response.json();
    expect(decision.policy.references).toHaveLength(1); expect(calls).toHaveLength(1);
  });
  it("rejects structurally valid output when the full deterministic first assessment exceeds the display contract", async () => {
    const policy = policies.complaint; const value = output(); value.policyReferences = Array.from({ length: 300 }, () => policy.headings[0].headingId);
    const ids = policy.headings.map(heading => heading.headingId);
    expect(createInitialDecisionOutputSchema("complaint", ids).safeParse(value).success).toBe(true);
    const decision = createInitialDecisionSchema("complaint", ids).parse({ ...value, decisionId: "44444444-4444-4444-8444-444444444444", caseId, scenario: "complaint", createdAt: "2026-10-01T10:00:00Z", modelId: "openai/gpt-6-luna", preliminary: true, employeeVerificationRequired: true,
      policy: { version: policy.provenance.version, digest: policy.provenance.digest, sourceUrl: policy.provenance.sourceUrl, retrievedAt: policy.provenance.retrievedAt, references: [policy.headings[0]] },
    });
    expect(() => createFirstDecisionMessage(decision, "validation-only")).toThrow();
    remote = async () => completion(value, "stop", undefined, "gen-overflow-decision-12345678");
    await error(await POST(request(input())), 502, "INVALID_AI_OUTPUT"); expect(calls).toHaveLength(1);
  });
  it.each(["length", "content_filter"])("rejects non-normal generation finish %s", async finish => {
    remote = async () => completion(output(), finish); await error(await POST(request(input())), 502, "INVALID_AI_OUTPUT");
  });
  it("rejects malformed generated JSON", async () => { remote = async () => completion({}, "stop", "{private malformed"); await error(await POST(request(input())), 502, "INVALID_AI_OUTPUT"); });
  it.each([[401, "PROVIDER_AUTH_ERROR", 502], [429, "PROVIDER_QUOTA_OR_RATE_LIMIT", 503], [500, "PROVIDER_ERROR", 502]] as const)("maps upstream%s safely with zero retries", async (status, code, mapped) => {
    remote = async () => Response.json({ error: { message: "private upstream error", code: status } }, { status });
    await error(await POST(request(input())), mapped, code); expect(calls).toHaveLength(1);
  });
  it("rejects missing configured model before external HTTP", async () => { vi.stubEnv("LLM_MODEL", ""); await error(await POST(request(input())), 500, "CONFIGURATION_ERROR"); expect(calls).toHaveLength(0); });
  it("blocks generation on a real missing selected policy without altering shared resources", async () => {
    const previous = process.cwd(); const root = resolve(previous, "verification-output/B07/policy-fixtures"); await mkdir(root, { recursive: true });
    const fixture = await mkdtemp(resolve(root, "missing-"));
    if (!resolve(fixture).startsWith(root + sep)) throw new Error("Unsafe fixture target");
    try {
      await mkdir(resolve(fixture, "resources/prompts"), { recursive: true });
      await copyFile(resolve(previous, "resources/prompts/complaint-decision.md"), resolve(fixture, "resources/prompts/complaint-decision.md"));
      process.chdir(fixture); await error(await POST(request(input())), 500, "POLICY_CONFIGURATION_ERROR"); expect(calls).toHaveLength(0);
    } finally { process.chdir(previous); await rm(fixture, { recursive: true, force: true }); }
  });
  it("enforces the streamed 65,536-byte body limit before JSON parsing", async () => {
    const body = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array(65537)); controller.close(); } });
    const init: RequestInit & { duplex: "half" } = { method: "POST", body, duplex: "half", headers: { "Content-Type": "application/json" } };
    await error(await POST(new Request(endpoint, init)), 413, "PAYLOAD_LIMIT"); expect(calls).toHaveLength(0);
  });
  it("returns fresh error identity for malformed operation IDs and JSON", async () => {
    const envelope = await error(await POST(request({ ...input(), operationId: "private-invalid" })), 422, "VALIDATION_ERROR"); expect(envelope.operationId).not.toBe(operationId);
    const malformed = await error(await POST(new Request(endpoint, { method: "POST", body: "{private", headers: { "Content-Type": "application/json" } })), 400, "VALIDATION_ERROR"); expect(malformed.operationId).not.toBe(operationId);
  });
  it("clips generation to remaining global budget and observes late completion without returning success", async () => {
    let settle!: () => void; const settled = new Promise<void>(resolve => { settle = resolve; });
    remote = async () => new Promise<Response>(resolve => { setTimeout(() => { resolve(completion()); settle(); }, 550); });
    const response = await POST(request({ ...input(), budgetMs: 250 })); await error(response, 504, "OPERATION_TIMEOUT"); await settled;
    expect(response.status).toBe(504); expect(calls).toHaveLength(1);
  }, 3000);
  it("preserves a parent operation timeout instead of treating it as caller cancellation", async () => {
    const parent = createOperationDeadline("decision", 250);
    remote = async init => new Promise<Response>((_, reject) => init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true }));
    try { await expect(initialDecision(input(), { signal: parent.signal, remainingBudgetMs: 1000 })).rejects.toMatchObject({ code: "OPERATION_TIMEOUT" }); }
    finally { parent.dispose(); }
  }, 3000);
  it("returns an empty408 only for actual caller abort", async () => {
    const caller = new AbortController(); let ready!: () => void; const started = new Promise<void>(resolve => { ready = resolve; });
    remote = async init => new Promise<Response>((_, reject) => { init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true }); ready(); });
    const pending = POST(request(input(), caller.signal)); await started; caller.abort(); const response = await pending;
    expect(response.status).toBe(408); expect(await response.text()).toBe(""); expect(response.headers.get("cache-control")).toBe("no-store");
  }, 3000);
  it("retains a valid operation header when JSON body reading fails before identity is available", async () => {
    const response = await POST(new Request(endpoint, { method: "POST", headers: { "Content-Type": "application/json", "X-Operation-Id": operationId }, body: "{" }));
    expect((await error(response, 400, "VALIDATION_ERROR")).operationId).toBe(operationId); expect(calls).toHaveLength(0);
  });
  it("rejects header/body operation mismatch before generation", async () => {
    const response = await POST(new Request(endpoint, { method: "POST", headers: { "Content-Type": "application/json", "X-Operation-Id": caseId }, body: JSON.stringify(input()) }));
    expect((await error(response, 422, "VALIDATION_ERROR")).operationId).toBe(caseId); expect(calls).toHaveLength(0);
  });
  it.each([undefined, "not-a-uuid"])("preserves body operation fallback for missing/invalid header %s", async header => {
    const headers = new Headers({ "Content-Type": "application/json" }); if (header) headers.set("X-Operation-Id", header);
    const value = input(); const response = await POST(new Request(endpoint, { method: "POST", headers, body: JSON.stringify({ ...value, form: { ...value.form, equipmentName: " " } }) }));
    expect((await error(response, 422, "VALIDATION_ERROR")).operationId).toBe(operationId); expect(calls).toHaveLength(0);
  });
  it("bounds a connected stalled body with the real90-second stage deadline", async () => {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new TextEncoder().encode("{")); }, cancel() { cancelled = true; } });
    const init: RequestInit & { duplex: "half" } = { method: "POST", body, duplex: "half", headers: { "Content-Type": "application/json", "X-Operation-Id": operationId } };
    const started = performance.now(); const envelope = await error(await POST(new Request(endpoint, init)), 504, "OPERATION_TIMEOUT");
    expect(envelope.operationId).toBe(operationId);
    expect(performance.now() - started).toBeGreaterThanOrEqual(89000); expect(cancelled).toBe(true); expect(calls).toHaveLength(0);
  }, 100000);
  it("rejects invalid input through actual Next HTTP before external generation", async () => {
    const response = await realFetch(endpoint, { method: "POST", body: JSON.stringify({ ...input(), form: { ...input().form, equipmentName: " " } }), headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(20000) });
    const envelope = await error(response, 422, "VALIDATION_ERROR"); expect(envelope.operationId).toBe(operationId);
  }, 25000);
});
