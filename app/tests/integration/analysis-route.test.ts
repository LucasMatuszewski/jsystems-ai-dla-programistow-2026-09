import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { POST, runtime } from "@/app/api/analysis/route";
import { prepareImage } from "@/server/images/prepare-image";
import { createImageAnalysisSchema } from "@/lib/contracts/analysis";
import { errorEnvelopeSchema } from "@/lib/contracts/errors";
import { createFormFingerprint } from "@/server/cases/form-fingerprint";
import { analyzeImage } from "@/server/ai/analyze-image";
import { createOperationDeadline } from "@/server/ai/deadline";
import type { AnalysisRequest } from "@/lib/contracts/requests";

const endpoint = "http://127.0.0.1:3000/api/analysis";
const caseId = "11111111-1111-4111-8111-111111111111";
const operationId = "22222222-2222-4222-8222-222222222222";
const output = { imageQuality: "limited", observations: [{ finding: "Widoczna rysa", visibleLocation: "Obudowa" }], signsOfUse: [], possibleCauses: [], limitations: ["Nie można ocenić działania"], missingInformation: [] };
let input: AnalysisRequest;
let calls: Record<string, unknown>[];
let remote: (init?: RequestInit) => Promise<Response>;
const realFetch = globalThis.fetch;
function request(value: unknown, signal?: AbortSignal) { return new Request(endpoint, { method: "POST", body: JSON.stringify(value), headers: { "Content-Type": "application/json" }, signal }); }
function completion(evidence: unknown = output, finish = "stop") {
  return Response.json({ id: "gen-fixture-analysis-12345678", object: "chat.completion", created: 1790000000, model: "openai/gpt-6-luna", choices: [{ index: 0, message: { role: "assistant", content: JSON.stringify(evidence) }, finish_reason: finish }], usage: { prompt_tokens: 20, completion_tokens: 30, total_tokens: 50 } });
}
async function error(response: Response, status: number, code: string) {
  expect(response.status).toBe(status); expect(response.headers.get("cache-control")).toBe("no-store");
  const envelope = errorEnvelopeSchema.parse(await response.json()); expect(envelope.code).toBe(code);
  expect(JSON.stringify(envelope)).not.toContain("private"); return envelope;
}
describe("real multimodal analysis route with only remote LLM HTTP substituted", () => {
  beforeAll(async () => {
    const preparedImage = await prepareImage(await readFile(resolve("tests/fixtures/images/intact-smartphone.jpg")));
    input = { caseId, operationId, budgetMs: 120000, timeZone: "Europe/Warsaw", preparedImage, form: { scenario: "complaint", category: "smartphones-tablets", equipmentName: "Telefon", purchaseDate: "2026-01-01", deliveryDate: null, buyerStatus: "unknown", sellerStatus: "business", reason: "Rysa na obudowie", requestedRemedy: "repair" } };
  });
  beforeEach(() => {
    calls = []; remote = async () => completion();
    vi.stubEnv("OPENROUTER_API_KEY", "fixture-only-key"); vi.stubEnv("LLM_MODEL", "openai/gpt-6-luna");
    vi.stubGlobal("fetch", async (url: string | URL | Request, init?: RequestInit) => {
      if (String(url) !== "https://openrouter.ai/api/v1/chat/completions") return realFetch(url, init);
      calls.push(JSON.parse(String(init?.body))); return remote(init);
    });
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
  it("uses Node and actual SDK/file JPEG/scenario prompt, attaching only server-owned identities", async () => {
    expect(runtime).toBe("nodejs"); const started = Date.now();
    const response = await POST(request(input)); expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("no-store");
    const analysis = createImageAnalysisSchema("complaint").parse(await response.json());
    expect(analysis).toMatchObject({ ...output, scenario: "complaint", imageDigest: input.preparedImage.sha256, formFingerprint: createFormFingerprint(input.form), modelId: "openai/gpt-6-luna" });
    expect(Date.parse(analysis.createdAt)).toBeGreaterThanOrEqual(started); expect(analysis.analysisId).not.toBe(caseId); expect(analysis.analysisId).not.toBe(operationId);
    expect(calls.length).toBe(1); expect(calls[0].model).toBe("openai/gpt-6-luna"); expect(calls[0].max_tokens).toBe(8192);
    expect(calls[0].reasoning).toEqual({ effort: "low", exclude: true });
    expect("models" in calls[0]).toBe(false); expect("temperature" in calls[0]).toBe(false);
    // Boolean assertions prevent failing tests from dumping full prompts or JPEG payloads.
    const sent = JSON.stringify(calls[0].messages); expect(sent.includes("image/jpeg")).toBe(true); expect(sent.includes(input.preparedImage.imageDataUrl)).toBe(true);
    expect(sent.includes("POLICY_SOURCE")).toBe(false); expect(sent.includes("complaint")).toBe(true);
  });
  it("normalizes return facts, allows explicit Unknown and empty reason, and separates scenario evidence", async () => {
    const response = await POST(request({ ...input, form: { ...input.form, scenario: "return", reason: " ", equipmentName: " Telefon ", requestedRemedy: "repair" } }));
    expect(response.status).toBe(200); const analysis = createImageAnalysisSchema("return").parse(await response.json());
    expect(analysis.formFingerprint).toBe(createFormFingerprint({ ...input.form, scenario: "return", reason: "", requestedRemedy: null }));
    const messages = calls[0].messages as { role: string; content: { type: string; text?: string }[] }[];
    const facts = messages.find(message => message.role === "user")!.content.filter(part => part.type === "text").map(part => part.text).join("");
    expect(facts.includes('"scenario":"return"')).toBe(true); expect(facts.includes('"requestedRemedy":null')).toBe(true); expect(facts.includes('"reason":""')).toBe(true);
  });
  it.each([
    { scenario: "invalid" }, { category: "" }, { equipmentName: " " }, { purchaseDate: "2026-02-30" }, { purchaseDate: "9999-12-31" },
    { deliveryDate: "2025-12-31" }, { deliveryDate: "9999-12-31" }, { deliveryDate: undefined }, { reason: " " }, { requestedRemedy: null },
  ])("rejects invalid form %j before external HTTP and retains valid operation identity", async patch => {
    const envelope = await error(await POST(request({ ...input, form: { ...input.form, ...patch } })), 422, "VALIDATION_ERROR");
    expect(envelope.operationId).toBe(operationId); expect(calls.length).toBe(0);
  });
  it("rejects actual forged JPEG digest before external HTTP", async () => {
    await error(await POST(request({ ...input, preparedImage: { ...input.preparedImage, sha256: "0".repeat(64) } })), 422, "INVALID_IMAGE"); expect(calls.length).toBe(0);
  });
  it.each([
    { ...output, analysisId: caseId }, { ...output, observations: [{ finding: "", visibleLocation: "" }] },
    { ...output, signsOfUse: ["x".repeat(12001)] },
  ])("rejects schema-invalid generated evidence without partial success", async evidence => {
    remote = async () => completion(evidence); await error(await POST(request(input)), 502, "INVALID_AI_OUTPUT");
  });
  it("rejects return hypotheses from otherwise valid generated evidence", async () => {
    remote = async () => completion({ ...output, possibleCauses: ["Hipoteza" ] });
    await error(await POST(request({ ...input, form: { ...input.form, scenario: "return", reason: "", requestedRemedy: null } })), 502, "INVALID_AI_OUTPUT");
  });
  it.each(["length", "content_filter"])("rejects non-normal provider finish %s", async finish => {
    remote = async () => completion(output, finish); await error(await POST(request(input)), 502, "INVALID_AI_OUTPUT");
  });
  it.each([[401, "PROVIDER_AUTH_ERROR"], [429, "PROVIDER_QUOTA_OR_RATE_LIMIT"]] as const)("maps external failure %s safely with zero retries", async (status, code) => {
    remote = async () => Response.json({ error: { message: "private upstream detail", code: status } }, { status });
    await error(await POST(request(input)), status === 401 ? 502 : 503, code); expect(calls.length).toBe(1);
  });
  it("rejects malformedJSON with fresh safe error identity", async () => {
    const response = await POST(new Request(endpoint, { method: "POST", body: "private malformed", headers: { "Content-Type": "application/json" } }));
    const envelope = await error(response, 400, "VALIDATION_ERROR"); expect(envelope.operationId).not.toBe(operationId); expect(calls.length).toBe(0);
  });
  it("enforces6m streamed body without Content-Length before parsing or upstream", async () => {
    const body = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array(6000001)); controller.close(); } });
    const init: RequestInit & { duplex: "half" } = { method: "POST", body, duplex: "half", headers: { "Content-Type": "application/json" } };
    await error(await POST(new Request(endpoint, init)), 413, "PAYLOAD_LIMIT"); expect(calls.length).toBe(0);
  });
  it("clips the entire operation to remaining budget and aborts upstream with canonical504", async () => {
    remote = async init => new Promise<Response>((_, reject) => { init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true }); });
    await error(await POST(request({ ...input, budgetMs: 250 })), 504, "OPERATION_TIMEOUT"); expect(calls.length).toBe(1);
  }, 3000);
  it("propagates actual caller abort and yields empty408 rather than a completed report", async () => {
    const caller = new AbortController(); let ready!: () => void; const started = new Promise<void>(resolve => { ready = resolve; });
    remote = async init => new Promise<Response>((_, reject) => { init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true }); ready(); });
    const pending = POST(request(input, caller.signal)); await started; caller.abort(); const response = await pending;
    expect(response.status).toBe(408); expect(await response.text()).toBe(""); expect(response.headers.get("cache-control")).toBe("no-store");
  }, 3000);
  it("preserves an actual parent deadline timeout rather than reporting caller cancellation", async () => {
    const parent = createOperationDeadline("analysis", 350);
    remote = async init => new Promise<Response>((_, reject) => { init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true }); });
    try {
      await expect(analyzeImage(input, { signal: parent.signal, remainingBudgetMs: 1000 })).rejects.toMatchObject({ code: "OPERATION_TIMEOUT" });
      expect(calls.length).toBe(1);
    } finally { parent.dispose(); }
  }, 3000);
  it("retains a valid operation header when JSON body reading fails before identity is available", async () => {
    const response = await POST(new Request(endpoint, { method: "POST", headers: { "Content-Type": "application/json", "X-Operation-Id": operationId }, body: "{" }));
    expect((await error(response, 400, "VALIDATION_ERROR")).operationId).toBe(operationId); expect(calls).toHaveLength(0);
  });
  it("rejects header/body operation mismatch before generation", async () => {
    const response = await POST(new Request(endpoint, { method: "POST", headers: { "Content-Type": "application/json", "X-Operation-Id": caseId }, body: JSON.stringify(input) }));
    expect((await error(response, 422, "VALIDATION_ERROR")).operationId).toBe(caseId); expect(calls).toHaveLength(0);
  });
  it.each([undefined, "not-a-uuid"])("preserves body operation fallback for missing/invalid header %s", async header => {
    const headers = new Headers({ "Content-Type": "application/json" }); if (header) headers.set("X-Operation-Id", header);
    const response = await POST(new Request(endpoint, { method: "POST", headers, body: JSON.stringify({ ...input, form: { ...input.form, equipmentName: " " } }) }));
    expect((await error(response, 422, "VALIDATION_ERROR")).operationId).toBe(operationId); expect(calls).toHaveLength(0);
  });
  it("rejects invalid form through actual Next HTTP before provider work", async () => {
    const response = await realFetch(endpoint, { method: "POST", body: JSON.stringify({ ...input, form: { ...input.form, equipmentName: " " } }), headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(15000) });
    const envelope = await error(response, 422, "VALIDATION_ERROR"); expect(envelope.operationId).toBe(operationId);
  }, 20000);
  it("hashes canonical actual normalized facts, independent of insertion order", () => {
    const reversed = Object.fromEntries(Object.entries(input.form).reverse()) as AnalysisRequest["form"];
    expect(createFormFingerprint(reversed)).toBe(createHash("sha256").update(JSON.stringify(input.form), "utf8").digest("hex"));
  });
});
