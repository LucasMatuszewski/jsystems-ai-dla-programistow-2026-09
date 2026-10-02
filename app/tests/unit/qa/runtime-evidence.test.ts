import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SafeTraceReporter, { assertRealGenerations, GenerationEvidenceError, sanitizeTrace, verifyRealGenerations, type RuntimeEvidence } from "../../e2e/helpers/runtime-evidence";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { execFileSync, spawnSync } from "node:child_process";
import type { TestCase, TestResult } from "@playwright/test/reporter";

const expected = { caseId: "11111111-1111-4111-8111-111111111111", operationId: "22222222-2222-4222-8222-222222222222", stage: "analysis" as const, modelId: "openai/gpt-6-luna" };
const record: RuntimeEvidence = { ...expected, event: "generation.completed", provider: "openrouter", generationId: "gen-12345678-success", success: true };
const canonical = "openai/gpt-6-luna-20260922";
const completed = (model = expected.modelId) => ({ id: record.generationId, model, cancelled: false, tokens_completion: 12, finish_reason: "stop" });
const response = (data: unknown, status = 200) => new Response(JSON.stringify({ data }), { status, headers: { "Content-Type": "application/json" } });
const fetchMock = vi.fn<typeof fetch>();

it("imports the evidence helper with native Node strip-only TypeScript without starting the app", () => {
  const url = pathToFileURL(resolve("tests/e2e/helpers/runtime-evidence.ts")).href;
  const script = `const module = await import(${JSON.stringify(url)}); const error = new module.GenerationEvidenceError('METADATA_UNAVAILABLE',404); if(error.code !== 'METADATA_UNAVAILABLE' || error.status !== 404 || !(error instanceof Error) || typeof module.verifyRealGenerations !== 'function') process.exit(2);`;
  const child = spawnSync(process.execPath, ["--input-type=module", "--eval", script], { encoding: "utf8", timeout: 30_000, windowsHide: true });
  const evidence = resolve("verification-output/Q01/20261002-native-import");
  mkdirSync(evidence, { recursive: true });
  writeFileSync(join(evidence, "native-import-result.json"), JSON.stringify({ exitCode: child.status, unsupportedTypeScriptSyntax: child.stderr?.includes("ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX") ?? false, passed: child.status === 0 }) + "\n");
  expect(child.status === 0, "the actual native Node import must support the QA helper without transforms or server startup").toBe(true);
}, 35_000);

beforeEach(() => {
  vi.stubEnv("OPENROUTER_API_KEY", "unit-only-credential-placeholder");
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});

describe("actual failure artifact privacy", () => {
  const root = resolve("verification-output/Q01-privacy/run");
  const sentinel = "SYNTHETIC_PRIVATE_CARD_SENTINEL";
  const safePixel = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=", "base64");
  let directory: string;
  beforeEach(() => { mkdirSync(root, { recursive: true }); directory = mkdtempSync(join(root, "unit-artifact-")); });
  afterEach(() => {
    // Delete only this fresh checked fixture directory, never other test evidence.
    if (dirname(directory) === root && directory.startsWith(join(root, "unit-artifact-"))) rmSync(directory, { recursive: true, force: true });
  });
  const resultFor = (attachments: TestResult["attachments"]) => ({ status: "failed", retry: 0, attachments } as TestResult);
  const testCase = { id: "safe-test-identity" } as TestCase;
  const powershellQuote = (value: string) => `'${value.replaceAll("'", "''")}'`;

  it("replaces actual-shaped error context at onTestEnd while retaining screenshots and safe failure identity", async () => {
    const markdown = join(directory, "error-context.md"), screenshot = join(directory, "test-failed-1.png");
    writeFileSync(markdown, `# Error context\n${sentinel}\n# Page snapshot\n${sentinel}`);
    writeFileSync(screenshot, safePixel);
    const result = resultFor([{ name: "error-context", contentType: "text/markdown", path: markdown }, { name: "screenshot", contentType: "image/png", path: screenshot }]);
    const reporter = new SafeTraceReporter(); reporter.onTestEnd(testCase, result);
    const saved = readFileSync(markdown, "utf8");
    expect(saved.includes(sentinel)).toBe(false);
    expect(saved.includes(testCase.id) && saved.includes("failed")).toBe(true);
    expect(readFileSync(screenshot).equals(safePixel)).toBe(true);
    expect(await reporter.onEnd()).toBeUndefined();
  });

  it("sanitizes in-memory error-context attachments without retaining page text", () => {
    const result = resultFor([{ name: "error-context", contentType: "text/markdown", body: Buffer.from(sentinel) }]);
    new SafeTraceReporter().onTestEnd(testCase, result);
    expect(result.attachments[0].body?.toString().includes(sentinel)).toBe(false);
  });

  it("sanitizes an authorized feature trace retaining safe action identity and referenced screenshot", () => {
    const input = join(directory, "trace-input"); mkdirSync(join(input, "screencast"), { recursive: true });
    writeFileSync(join(input, "test.trace"), [
      { type: "before", callId: "call@1", startTime: 1, class: "Page", method: "click", params: { private: sentinel } },
      { type: "after", callId: "call@1", endTime: 2, result: { private: sentinel }, error: { message: sentinel } },
      { type: "log", message: sentinel },
      { type: "screencast-frame", pageId: "page@1", file: "screencast/frame.png", width: 1, height: 1, timestamp: 1 },
    ].map(value => JSON.stringify(value)).join("\n"));
    writeFileSync(join(input, "test.network"), sentinel);
    writeFileSync(join(input, "screencast/frame.png"), safePixel);
    writeFileSync(join(input, "unreferenced.txt"), sentinel);
    const archive = join(directory, "trace.zip");
    const started = performance.now();
    execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", `Compress-Archive -Path ${powershellQuote(join(input, "*"))} -DestinationPath ${powershellQuote(archive)}`], { stdio: "pipe", timeout: 30_000 });
    const setupFinished = performance.now();
    expect(() => sanitizeTrace(archive)).not.toThrow();
    const sanitizerFinished = performance.now();
    const output = join(directory, "trace-output");
    execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", `Expand-Archive -LiteralPath ${powershellQuote(archive)} -DestinationPath ${powershellQuote(output)}`], { stdio: "pipe", timeout: 30_000 });
    const auditFinished = performance.now();
    const timingRoot = resolve("verification-output/Q01-metadata/run");
    mkdirSync(timingRoot, { recursive: true });
    writeFileSync(join(timingRoot, "native-zip-phase-timings.json"), JSON.stringify({ setupCompressMs: setupFinished - started, sanitizerExpandAndCompressMs: sanitizerFinished - setupFinished, auditExpandMs: auditFinished - sanitizerFinished, totalMs: auditFinished - started, nativePhaseLimitMs: 30_000, composedTestLimitMs: 125_000 }) + "\n");
    const text = readFileSync(join(output, "test.trace"), "utf8");
    expect(text.includes(sentinel)).toBe(false); expect(text.includes("call@1")).toBe(true);
    expect(readFileSync(join(output, "test.network"), "utf8")).toBe("");
    expect(existsSync(join(output, "unreferenced.txt"))).toBe(false);
    expect(readFileSync(join(output, "screencast/frame.png")).equals(safePixel)).toBe(true);
  }, 125_000); // Four separately bounded native ZIP operations, plus assertion/FS margin.

  it("removes a checked feature raw archive when sanitization fails", () => {
    const archive = join(directory, "trace.zip"); writeFileSync(archive, sentinel);
    expect(() => sanitizeTrace(archive)).toThrow();
    expect(existsSync(archive)).toBe(false);
  }, 30_000);

  it("rejects unsafe extension and outside path without deleting unrelated files", () => {
    const file = join(directory, "user-note.txt"); writeFileSync(file, sentinel);
    expect(() => sanitizeTrace(file)).toThrow();
    expect(readFileSync(file, "utf8").includes(sentinel)).toBe(true);
    expect(() => sanitizeTrace(resolve("../outside-user-trace.zip"))).toThrow();
  });
});

describe("opt-in bounded official metadata availability", () => {
  const root = resolve("verification-output/Q01-metadata/run");
  let directory: string;
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
    mkdirSync(root, { recursive: true }); directory = mkdtempSync(join(root, "unit-proof-"));
  });
  afterEach(() => {
    vi.useRealTimers();
    if (dirname(directory) === root && directory.startsWith(join(root, "unit-proof-"))) rmSync(directory, { recursive: true, force: true });
  });
  const observe = (proof: ReturnType<typeof verifyRealGenerations>) => proof.then(records => ({ records, error: null }), error => ({ records: null, error: error as Error }));

  it("polls only404 of the same captured generation then requires actual valid200", async () => {
    const calls: { url: string; time: number }[] = [];
    fetchMock.mockImplementation(async input => {
      calls.push({ url: String(input), time: performance.now() });
      return calls.length < 3 ? response(null, 404) : response(completed());
    });
    const proof = observe(verifyRealGenerations([record], expected, { metadataWaitDeadlineMs: performance.now() + 420_000 }));
    await vi.advanceTimersByTimeAsync(20_000);
    const result = await proof;
    expect(result.error === null).toBe(true);
    expect(result.records).toEqual([record]);
    expect(calls.map(call => call.time)).toEqual([0, 10_000, 20_000]);
    expect(calls.every(call => call.url === `https://openrouter.ai/api/v1/generation?id=${record.generationId}`)).toBe(true);
  });

  it("preserves default singleGET404 failure without an opt-in budget", async () => {
    fetchMock.mockResolvedValue(response(null, 404));
    await expect(verifyRealGenerations([record], expected)).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  for (const status of [401, 403, 429, 500, 502]) {
    it(`never retries HTTP${status} even with a metadata budget`, async () => {
      fetchMock.mockResolvedValue(response(null, status));
      const result = await observe(verifyRealGenerations([record], expected, { metadataWaitDeadlineMs: 420_000 }));
      expect(result.error instanceof GenerationEvidenceError).toBe(true);
      expect((result.error as GenerationEvidenceError).code).toBe("GENERATION_HTTP_ERROR");
      expect(fetchMock).toHaveBeenCalledTimes(1); expect(vi.getTimerCount()).toBe(0);
    });
  }

  it("never retries transport failure", async () => {
    fetchMock.mockRejectedValue(new Error("synthetic-private-transport-detail"));
    const result = await observe(verifyRealGenerations([record], expected, { metadataWaitDeadlineMs: 420_000 }));
    expect(result.error instanceof GenerationEvidenceError).toBe(true);
    expect((result.error as GenerationEvidenceError).code).toBe("TRANSPORT_ERROR");
    expect(result.error?.message.includes("synthetic-private-transport-detail")).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  for (const invalid of [new Response("not-json"), response({ ...completed(), cancelled: true }), response({ ...completed(), tokens_completion: 0 })]) {
    it("does not poll invalid actual200 completion facts", async () => {
      fetchMock.mockResolvedValue(invalid.clone());
      const result = await observe(verifyRealGenerations([record], expected, { metadataWaitDeadlineMs: 420_000 }));
      expect(result.error instanceof GenerationEvidenceError).toBe(true);
      expect((result.error as GenerationEvidenceError).code).toBe("INVALID_GENERATION_METADATA");
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  }

  it("never retries an official model-alias404 after valid generation metadata", async () => {
    fetchMock.mockResolvedValueOnce(response(completed(canonical))).mockResolvedValueOnce(response(null, 404));
    const result = await observe(verifyRealGenerations([record], expected, { metadataWaitDeadlineMs: 420_000 }));
    expect(result.error instanceof GenerationEvidenceError).toBe(true);
    expect((result.error as GenerationEvidenceError).code).toBe("MODEL_IDENTITY_UNVERIFIED");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("shares one deadline across all fixed matching generation IDs without resetting", async () => {
    const second = { ...record, generationId: "gen-87654321-complete" };
    fetchMock.mockResolvedValueOnce(response(null, 404)).mockResolvedValueOnce(response(completed())).mockResolvedValue(response(null, 404));
    const proof = observe(verifyRealGenerations(assertRealGenerations([record, second], expected), expected, { metadataWaitDeadlineMs: 15_000 }));
    await vi.advanceTimersByTimeAsync(30_000);
    const result = await proof;
    expect(result.error instanceof GenerationEvidenceError).toBe(true);
    expect((result.error as GenerationEvidenceError).code).toBe("METADATA_UNAVAILABLE");
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(String(fetchMock.mock.calls[2][0])).toBe(`https://openrouter.ai/api/v1/generation?id=${second.generationId}`);
  });

  it("cannot publish alias success after the shared metadata IO budget expires", async () => {
    fetchMock.mockResolvedValueOnce(response(completed(canonical))).mockImplementationOnce(async () => {
      await new Promise(resolve => setTimeout(resolve, 16_000)); return response({ id: expected.modelId, canonical_slug: canonical });
    });
    const proof = observe(verifyRealGenerations([record], expected, { metadataWaitDeadlineMs: 15_000 }));
    await vi.advanceTimersByTimeAsync(16_000);
    const result = await proof;
    expect(result.error instanceof GenerationEvidenceError).toBe(true);
    expect((result.error as GenerationEvidenceError).code).toBe("METADATA_UNAVAILABLE");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  for (const deadline of [NaN, Infinity, -1, 0, 420_001]) {
    it("rejects invalid or already exhausted opt-in budget before external access", async () => {
      fetchMock.mockResolvedValue(response(completed()));
      await expect(verifyRealGenerations([record], expected, { metadataWaitDeadlineMs: deadline })).rejects.toThrow();
      expect(fetchMock).not.toHaveBeenCalled();
    });
  }

  it("persists only safe scalar proof-end identity/attempt facts in the checked evidence subtree", async () => {
    const path = join(directory, "proof.json"); fetchMock.mockResolvedValue(response(completed()));
    await verifyRealGenerations([record], expected, { metadataWaitDeadlineMs: 420_000, attemptReportPath: path });
    expect(existsSync(path)).toBe(true);
    if (!existsSync(path)) return;
    const text = readFileSync(path, "utf8"), report = JSON.parse(text) as unknown;
    const forbidden = /tokens_completion|finish_reason|cancelled|Authorization|unit-only-credential-placeholder|imageDataUrl|prompt|parts/;
    expect(forbidden.test(text)).toBe(false);
    expect(text.includes(record.generationId) && text.includes(expected.operationId) && text.includes(expected.modelId)).toBe(true);
    expect(report !== null).toBe(true);
  });

  it("rejects outside or unsafe report destinations without modifying user files or fetching", async () => {
    fetchMock.mockResolvedValue(response(completed()));
    for (const path of [resolve("../outside-user-proof.json"), join(directory, "user-note.txt")]) {
      await expect(verifyRealGenerations([record], expected, { metadataWaitDeadlineMs: 420_000, attemptReportPath: path })).rejects.toThrow();
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });
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
