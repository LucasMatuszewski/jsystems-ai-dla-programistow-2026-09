import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AnalysisRequest, DecisionRequest } from "@/lib/contracts/requests";
import { analyzeInitialCase, decideInitialCase } from "./initial-api-client";

const schemas = vi.hoisted(() => ({ analysis: vi.fn(), decision: vi.fn(), error: vi.fn(), request: vi.fn(), scenario: vi.fn() }));
vi.mock("@/lib/contracts/analysis", () => ({ createImageAnalysisSchema: (scenario: string) => { schemas.scenario(scenario); return { safeParse: schemas.analysis }; } }));
vi.mock("@/lib/contracts/requests", () => ({ storedInitialDecisionSchema: { safeParse: schemas.decision }, createAnalysisRequestSchema: () => ({ safeParse: schemas.request }), createDecisionRequestSchema: () => ({ safeParse: schemas.request }) }));
vi.mock("@/lib/contracts/errors", () => ({ errorEnvelopeSchema: { safeParse: schemas.error }, createErrorEnvelope: (code: string, options: { operationId: string }) => ({ code, operationId: options.operationId, retryable: code !== "PAYLOAD_LIMIT", message: "Bezpieczny komunikat." }) }));

const caseId = "d6a7c3f7-5711-4e97-ae3e-5195c48c2b95";
const operationId = "e6a7c3f7-5711-4e97-ae3e-5195c48c2b95";
const form = { scenario: "complaint", category: "computers", equipmentName: "Laptop", purchaseDate: "2026-01-01", deliveryDate: null, buyerStatus: "unknown", sellerStatus: "business", reason: "Nie działa.", requestedRemedy: "repair" } as const;
const image = { imageDataUrl: "data:image/jpeg;base64,YQ==", thumbnailDataUrl: "data:image/jpeg;base64,YQ==", byteLength: 1, width: 1, height: 1, sha256: "a".repeat(64) };
const analysis = { analysisId: caseId, scenario: "complaint", imageDigest: image.sha256, formFingerprint: "b".repeat(64), createdAt: "2026-10-01T08:00:00Z", modelId: "private-model", imageQuality: "adequate", observations: [], signsOfUse: [], possibleCauses: [], limitations: [], missingInformation: [] } as const;
const request: AnalysisRequest = { caseId, operationId, form, timeZone: "Europe/Warsaw", preparedImage: image, budgetMs: 119999 };
const decisionRequest: DecisionRequest = { caseId, operationId, form, timeZone: request.timeZone, imageAnalysis: { ...analysis, observations: [], signsOfUse: [], possibleCauses: [], limitations: [], missingInformation: [] }, budgetMs: 74000 };
const decision = { caseId, scenario: "complaint", decisionId: operationId, policyReferences: ["section"], policy: { references: [{ headingId: "section", title: "Procedura", url: "https://allegro.pl/pomoc" }] } };
const fetchMock = vi.fn();
const options = () => ({ signal: new AbortController().signal });
beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock); fetchMock.mockReset();
  for (const schema of [schemas.analysis, schemas.decision, schemas.error, schemas.request]) schema.mockImplementation(data => ({ success: true, data }));
});

describe("initial same-origin API boundaries", () => {
  it("correlates early body errors through the same operation header for both stages", async () => {
    const error = { code: "OPERATION_TIMEOUT", operationId, retryable: true, message: "Przekroczono czas operacji." };
    fetchMock.mockImplementation(async (_url, init) => ({ ok: false, json: async () => ({ ...error, operationId: new Headers(init.headers).get("X-Operation-Id") }) }));
    for (const result of [await analyzeInitialCase(request, options()), await decideInitialCase(decisionRequest, options())]) {
      expect(result).toEqual({ status: "failed", error });
    }
    for (const [, init] of fetchMock.mock.calls) {
      expect(new Headers(init.headers).get("X-Operation-Id")).toBe(JSON.parse(init.body).operationId);
      expect(new Headers(init.headers).get("Content-Type")).toBe("application/json");
    }
  });
  it("sends one JSON analysis request and validates the actual response schema", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => analysis }); const opts = options();
    expect(await analyzeInitialCase(request, opts)).toEqual({ status: "success", value: analysis });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/analysis"); expect(init).toMatchObject({ method: "POST", signal: opts.signal, cache: "no-store" });
    expect(JSON.parse(init.body)).toEqual(request); expect(schemas.scenario).toHaveBeenCalledWith("complaint"); expect(schemas.analysis).toHaveBeenCalledWith(analysis);
  });
  it("sends only report and facts to decisions, never JPEG or a fabricated first message", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => decision });
    expect(await decideInitialCase(decisionRequest, options())).toEqual({ status: "success", value: decision });
    const [url, init] = fetchMock.mock.calls[0]; expect(url).toBe("/api/decisions"); expect(JSON.parse(init.body)).toEqual(decisionRequest);
    expect(init.body).not.toContain("data:image"); expect(init.body).not.toContain("preparedImage"); expect(schemas.decision).toHaveBeenCalledWith(decision);
  });
  it.each([{ scenario: "return" }, { imageDigest: "c".repeat(64) }])("rejects analysis with mismatched checkpoint %j", async mismatch => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ ...analysis, ...mismatch }) });
    expect(await analyzeInitialCase(request, options())).toMatchObject({ status: "failed", error: { code: "INVALID_AI_OUTPUT", operationId } });
  });
  it.each([{ caseId: operationId }, { scenario: "return" }])("rejects a decision belonging to different facts %j", async mismatch => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ ...decision, ...mismatch }) });
    expect(await decideInitialCase(decisionRequest, options())).toMatchObject({ status: "failed", error: { code: "INVALID_AI_OUTPUT" } });
  });
  it("does not publish a schema-rejected decision or raw malformed output", async () => {
    schemas.decision.mockReturnValue({ success: false }); fetchMock.mockResolvedValue({ ok: true, json: async () => ({ private: "raw-model-detail" }) });
    const result = await decideInitialCase(decisionRequest, options());
    expect(result).toMatchObject({ status: "failed", error: { code: "INVALID_AI_OUTPUT" } }); expect(JSON.stringify(result)).not.toContain("raw-model-detail");
  });
  it("retains matching canonical operation error and rejects a foreign operation error", async () => {
    const error = { code: "OPERATION_TIMEOUT", message: "Przekroczono czas operacji. Spróbuj ponownie.", retryable: true, operationId };
    fetchMock.mockResolvedValue({ ok: false, json: async () => error });
    expect(await analyzeInitialCase(request, options())).toEqual({ status: "failed", error });
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({ ...error, operationId: caseId }) });
    expect(await analyzeInitialCase(request, options())).toMatchObject({ status: "failed", error: { code: "PROVIDER_ERROR", operationId } });
  });
  it("distinguishes network/malformed failures from explicit cancellation", async () => {
    fetchMock.mockRejectedValue(new Error("private diagnostics"));
    expect(await analyzeInitialCase(request, options())).toMatchObject({ status: "failed", error: { code: "PROVIDER_ERROR" } });
    fetchMock.mockResolvedValue({ ok: true, json: async () => { throw new SyntaxError("private payload"); } });
    expect(await analyzeInitialCase(request, options())).toMatchObject({ status: "failed", error: { code: "INVALID_AI_OUTPUT" } });
    fetchMock.mockClear(); const controller = new AbortController(); controller.abort();
    expect(await analyzeInitialCase(request, { signal: controller.signal })).toEqual({ status: "aborted" }); expect(fetchMock).not.toHaveBeenCalled();
  });
  it("ignores a late successful response after cancellation", async () => {
    const controller = new AbortController(); fetchMock.mockImplementation(async () => { controller.abort(); return { ok: true, json: async () => analysis }; });
    expect(await analyzeInitialCase(request, { signal: controller.signal })).toEqual({ status: "aborted" }); expect(fetchMock).toHaveBeenCalledTimes(1); expect(schemas.analysis).not.toHaveBeenCalled();
  });
  it("blocks the actual JSON byte limit before a request", async () => {
    const oversized = { ...decisionRequest, form: { ...form, reason: "ą".repeat(40000) } };
    expect(await decideInitialCase(oversized, options())).toMatchObject({ status: "failed", error: { code: "PAYLOAD_LIMIT", retryable: false } }); expect(fetchMock).not.toHaveBeenCalled();
  });
});
