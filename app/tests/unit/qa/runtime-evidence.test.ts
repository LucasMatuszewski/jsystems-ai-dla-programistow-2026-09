import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { verifyRealGenerations, type RuntimeEvidence } from "../../e2e/helpers/runtime-evidence";

const expected = { caseId: "11111111-1111-4111-8111-111111111111", operationId: "22222222-2222-4222-8222-222222222222", stage: "analysis" as const, modelId: "openai/gpt-6-luna" };
const record: RuntimeEvidence = { ...expected, event: "generation.completed", provider: "openrouter", generationId: "gen-12345678-success", success: true };
const canonical = "openai/gpt-6-luna-20260922";
const completed = (model = expected.modelId) => ({ id: record.generationId, model, cancelled: false, tokens_completion: 12, finish_reason: "stop" });
const response = (data: unknown, status = 200) => new Response(JSON.stringify({ data }), { status, headers: { "Content-Type": "application/json" } });
const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.stubEnv("OPENROUTER_API_KEY", "unit-only-credential-placeholder");
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("official actual generation and model identity evidence", () => {
  it("accepts canonical generation only after official metadata resolves the exact configured alias", async () => {
    fetchMock.mockResolvedValueOnce(response(completed(canonical))).mockResolvedValueOnce(response({ id: expected.modelId, canonical_slug: canonical }));
    await expect(verifyRealGenerations([record], expected)).resolves.toEqual([record]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0][0])).toBe(`https://openrouter.ai/api/v1/generation?id=${record.generationId}`);
    expect(String(fetchMock.mock.calls[1][0])).toBe("https://openrouter.ai/api/v1/model/openai/gpt-6-luna");
  });

  it("retains exact generation model fast path without catalog access", async () => {
    fetchMock.mockResolvedValueOnce(response(completed()));
    await expect(verifyRealGenerations([record], expected)).resolves.toEqual([record]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("encodes the entire author and requested slug without stripping variant suffix", async () => {
    const wanted = { ...expected, modelId: "openai/gpt-6-luna:extended" };
    const captured = { ...record, modelId: wanted.modelId };
    fetchMock.mockResolvedValueOnce(response(completed(canonical))).mockResolvedValueOnce(response({ id: wanted.modelId, canonical_slug: canonical }));
    await expect(verifyRealGenerations([captured], wanted)).resolves.toEqual([captured]);
    expect(String(fetchMock.mock.calls[1][0])).toBe("https://openrouter.ai/api/v1/model/openai/gpt-6-luna%3Aextended");
  });

  for (const [name, data, status] of [
    ["metadata404", { id: expected.modelId, canonical_slug: canonical }, 404],
    ["missing metadata", null, 200],
    ["array metadata", [], 200],
    ["wrong routable ID", { id: "other/gpt-6-luna", canonical_slug: canonical }, 200],
    ["missing routable ID", { canonical_slug: canonical }, 200],
    ["wrong canonical ID", { id: expected.modelId, canonical_slug: "openai/other" }, 200],
    ["blank canonical ID", { id: expected.modelId, canonical_slug: " " }, 200],
    ["missing canonical ID", { id: expected.modelId }, 200],
  ] as const) {
    it(`fails closed for ${name}`, async () => {
      fetchMock.mockResolvedValueOnce(response(completed(canonical))).mockResolvedValueOnce(response(data, status));
      await expect(verifyRealGenerations([record], expected)).rejects.toThrow();
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  }

  it("fails closed for metadata transport failure", async () => {
    fetchMock.mockResolvedValueOnce(response(completed(canonical))).mockRejectedValueOnce(new Error("external transport unavailable"));
    await expect(verifyRealGenerations([record], expected)).rejects.toThrow();
  });

  it("fails closed for malformed metadata JSON", async () => {
    fetchMock.mockResolvedValueOnce(response(completed(canonical))).mockResolvedValueOnce(new Response("not-json"));
    await expect(verifyRealGenerations([record], expected)).rejects.toThrow();
  });

  for (const [name, changes] of [
    ["different actual generation", { id: "gen-87654321-unrelated" }],
    ["cancelled", { cancelled: true }],
    ["unknown cancellation", { cancelled: undefined }],
    ["null cancellation", { cancelled: null }],
    ["zero completion tokens", { tokens_completion: 0 }],
    ["missing completion tokens", { tokens_completion: undefined }],
    ["invalid completion tokens", { tokens_completion: "12" }],
    ["invalid finish", { finish_reason: "error" }],
    ["missing finish", { finish_reason: undefined }],
    ["missing actual model", { model: undefined }],
  ] as const) {
    it(`never substitutes catalog metadata for ${name}`, async () => {
      fetchMock.mockResolvedValueOnce(response({ ...completed(), ...changes }));
      await expect(verifyRealGenerations([record], expected)).rejects.toThrow();
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  }

  for (const field of ["caseId", "operationId", "stage", "modelId"] as const) {
    it(`requires exact captured ${field} before any metadata call`, async () => {
      const value = field === "stage" ? "decision" : field === "modelId" ? "other/unrelated" : "33333333-3333-4333-8333-333333333333";
      await expect(verifyRealGenerations([{ ...record, [field]: value } as RuntimeEvidence], expected)).rejects.toThrow();
      expect(fetchMock).not.toHaveBeenCalled();
    });
  }

  it("cannot treat successful catalog lookup as an unavailable generation proof", async () => {
    fetchMock.mockResolvedValueOnce(response(null, 404));
    await expect(verifyRealGenerations([record], expected)).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("accepts valid native token/finish metadata without weakening alias proof", async () => {
    fetchMock.mockResolvedValueOnce(response({ id: record.generationId, model: canonical, cancelled: false, native_tokens_completion: 4, native_finish_reason: "length" })).mockResolvedValueOnce(response({ id: expected.modelId, canonical_slug: canonical }));
    await expect(verifyRealGenerations([record], expected)).resolves.toEqual([record]);
  });
});
