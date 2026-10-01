import { describe, expect, it, vi } from "vitest";
vi.mock("ai", () => {
  class APICallError extends Error {
    constructor(public options: { statusCode?: number }) { super("private provider body"); }
    get statusCode() { return this.options.statusCode; }
    static isInstance(value: unknown) { return value instanceof APICallError; }
  }
  class InvalidOutput extends Error { static isInstance(value: unknown) { return value instanceof InvalidOutput; } }
  return { APICallError, NoObjectGeneratedError: InvalidOutput, NoOutputGeneratedError: InvalidOutput, TypeValidationError: InvalidOutput };
});
import { APICallError } from "ai";
import { OperationError, CallerCancelledError, classifyOperationError, createOperationErrorResponse } from "@/server/http/errors";
import { recordCompletedGeneration, recordOperationDiagnostic } from "@/server/ai/diagnostics";
const caseId = "7b40b034-5e7b-49dc-bb47-e8d8d2d5fc76";
const operationId = "129d4e48-1a61-4a99-b1ac-0d1ce4576c58";
const identity = { caseId, operationId, stage: "analysis" as const, modelId: "openai/gpt-6-luna" };
describe("safe operational errors and diagnostics", () => {
  it.each([[401, "PROVIDER_AUTH_ERROR"], [403, "PROVIDER_AUTH_ERROR"], [402, "PROVIDER_QUOTA_OR_RATE_LIMIT"], [429, "PROVIDER_QUOTA_OR_RATE_LIMIT"], [500, "PROVIDER_ERROR"]])("classifies SDK upstream HTTP %s safely", (statusCode, code) => {
    const error = new APICallError({ message: "private", url: "https://example.test", requestBodyValues: {}, statusCode: Number(statusCode) });
    expect(classifyOperationError(error)).toEqual({ kind: "error", code });
  });
  it("never trusts a browser object claiming an operational code", () => {
    expect(classifyOperationError({ code: "CONFIGURATION_ERROR", message: "private" })).toEqual({ kind: "error", code: "PROVIDER_ERROR" });
  });
  it("uses canonical localized envelope/status and no-store without raw exception fields", async () => {
    const response = createOperationErrorResponse(new Error("private prompt/key/image/body"), operationId)!;
    expect(response.status).toBe(502); expect(response.headers.get("cache-control")).toBe("no-store");
    const envelope = await response.json();
    expect(Object.keys(envelope).sort()).toEqual(["code", "message", "operationId", "retryable"]);
    expect(envelope).toMatchObject({ code: "PROVIDER_ERROR", operationId, retryable: true });
    expect(JSON.stringify(envelope)).not.toContain("private");
  });
  it("distinguishes malformed400 from valid-shape422 and emits no cancellation envelope", () => {
    expect(createOperationErrorResponse(new OperationError("VALIDATION_ERROR", { malformedInput: true }), operationId)!.status).toBe(400);
    expect(createOperationErrorResponse(new OperationError("VALIDATION_ERROR"), operationId)!.status).toBe(422);
    expect(createOperationErrorResponse(new CallerCancelledError(), operationId)).toBeNull();
  });
  it("preserves only known Polish field messages and rejects secret-bearing keys or raw validator text", async () => {
    const error = new OperationError("VALIDATION_ERROR", { fieldErrors: { equipmentName: ["Podaj nazwę sprzętu.", "private provider detail"], "private-key": ["private"], reason: ["private unknown key"] } });
    const envelope = await createOperationErrorResponse(error, operationId)!.json();
    expect(envelope.fieldErrors).toEqual({ equipmentName: ["Podaj nazwę sprzętu."] });
    expect(JSON.stringify(envelope)).not.toContain("private");
  });
  it("does not turn a real deadline into cancellation if the caller aborts later", () => {
    const caller = new AbortController(); const deadline = new AbortController();
    deadline.abort(new OperationError("OPERATION_TIMEOUT")); caller.abort();
    expect(classifyOperationError(new Error("private"), { callerSignal: caller.signal, deadlineSignal: deadline.signal })).toEqual({ kind: "error", code: "OPERATION_TIMEOUT" });
  });
  it("logs only strict actual-generation identity after successful completion", () => {
    const write = vi.fn();
    recordCompletedGeneration(identity, { response: { id: "gen-fixture-12345678" }, finishReason: "stop" }, true, write);
    expect(write).toHaveBeenCalledTimes(1);
    const record = JSON.parse(write.mock.calls[0][0].slice("[runtime-evidence] ".length));
    expect(record).toEqual({ event: "generation.completed", provider: "openrouter", ...identity, generationId: "gen-fixture-12345678", success: true });
    expect(Object.keys(record)).toHaveLength(8);
  });
  it("does not invent generation IDs or report incomplete calls successful", () => {
    const write = vi.fn();
    for (const id of [undefined, caseId, "gen-fake-12345678"]) recordCompletedGeneration(identity, { response: { id }, finishReason: "stop" }, true, write);
    recordCompletedGeneration(identity, { response: { id: "gen-fixture-12345678" }, finishReason: "length" }, true, write);
    recordCompletedGeneration(identity, { response: { id: "gen-fixture-12345678" }, finishReason: "stop" }, false, write);
    expect(write).not.toHaveBeenCalled();
  });
  it("keeps operation diagnostics separate, ignoring extra input/raw usage fields", () => {
    const write = vi.fn();
    recordOperationDiagnostic({ ...identity, elapsedMs: 12, classification: "PROVIDER_ERROR", usage: { inputTokens: 3, outputTokens: 4, totalTokens: 7, raw: { prompt: "private" } }, prompt: "private" }, write);
    const line = write.mock.calls[0][0]; expect(line).not.toContain("private"); expect(line).not.toContain("runtime-evidence");
    const record = JSON.parse(line.slice("[operation-diagnostic] ".length));
    expect(record.elapsedMs).toBe(12); expect(record.usage).toEqual({ inputTokens: 3, outputTokens: 4, totalTokens: 7 });
  });
});
