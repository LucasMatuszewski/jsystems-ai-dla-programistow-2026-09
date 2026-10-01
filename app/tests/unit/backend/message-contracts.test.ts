import { describe, expect, it } from "vitest";
import { caseMessageSchema, terminalMetadataSchema, getEligibleHistory, isReplyComplete, eligibleHistorySchema, isContextLimitError } from "@/lib/contracts/messages";

const operationId = "129d4e48-1a61-4a99-b1ac-0d1ce4576c58";
const assistant = { id: "first-sdk-id", role: "assistant", parts: [{ type: "text", text: "Pełna ocena początkowa" }] };
const user = { id: "user-sdk-id", role: "user", parts: [{ type: "text", text: "Pytanie" }] };
const terminal = { operationId, finishReason: "stop", completionState: "complete" };
describe("text-only conversation contracts", () => {
  it("accepts SDK string IDs and multiple text parts with their UI states", () => {
    expect(caseMessageSchema.safeParse({ ...assistant, parts: [{ type: "text", text: "Pierwsza", state: "done" }, { type: "text", text: "Druga", state: "streaming" }] }).success).toBe(true);
  });
  it.each(["system", "developer", "tool"])("rejects %s roles", role => {
    expect(caseMessageSchema.safeParse({ ...user, role }).success).toBe(false);
  });
  it.each(["file", "reasoning", "tool-call", "source-url", "dynamic-tool"])("rejects %s parts", type => {
    expect(caseMessageSchema.safeParse({ ...user, parts: [{ type, text: "Treść" }] }).success).toBe(false);
  });
  it.each(["instructions", "providerMetadata", "tools"])("rejects extra message %s", key => {
    expect(caseMessageSchema.safeParse({ ...user, [key]: "private" }).success).toBe(false);
  });
  it("rejects provider metadata in a text part", () => {
    expect(caseMessageSchema.safeParse({ ...user, parts: [{ type: "text", text: "Treść", providerMetadata: {} }] }).success).toBe(false);
  });
  it("checks aggregated user length without erasing entered whitespace", () => {
    expect(caseMessageSchema.parse({ ...user, parts: [{ type: "text", text: "  pytanie  " }] }).parts[0].text).toBe("  pytanie  ");
    expect(caseMessageSchema.safeParse({ ...user, parts: [{ type: "text", text: " " }] }).success).toBe(false);
    expect(caseMessageSchema.safeParse({ ...user, parts: [{ type: "text", text: "a".repeat(2001) }, { type: "text", text: "b".repeat(2000) }] }).success).toBe(false);
  });
  it("allows empty assistant display placeholders but bounds aggregate assistant text", () => {
    expect(caseMessageSchema.safeParse({ ...assistant, parts: [] }).success).toBe(true);
    expect(caseMessageSchema.safeParse({ ...assistant, parts: [{ type: "text", text: "a".repeat(32001) }] }).success).toBe(false);
  });
  it.each(["length", "content-filter", "tool-calls", "error", "other", "aborted", "disconnected", "unknown"])("cannot declare %s complete", finishReason => {
    expect(terminalMetadataSchema.safeParse({ ...terminal, finishReason }).success).toBe(false);
    expect(terminalMetadataSchema.safeParse({ ...terminal, finishReason, completionState: "incomplete" }).success).toBe(true);
  });
  it("rejects extra or missing terminal metadata and non-UUID operations", () => {
    expect(terminalMetadataSchema.safeParse({ ...terminal, operationId: "id" }).success).toBe(false);
    expect(terminalMetadataSchema.safeParse({ ...terminal, prompt: "private" }).success).toBe(false);
    expect(terminalMetadataSchema.safeParse({ operationId }).success).toBe(false);
  });
  it("requires successful SDK lifecycle as well as normal server terminal stop", () => {
    expect(isReplyComplete(terminal, { status: "completed" })).toBe(true);
    for (const status of ["failed", "aborted", "unknown"] as const) expect(isReplyComplete(terminal, { status })).toBe(false);
    expect(isReplyComplete(undefined, { status: "completed" })).toBe(false);
    expect(isReplyComplete(terminal, { status: "completed" }, { aborted: true })).toBe(false);
    expect(isReplyComplete(terminal, { status: "completed" }, { disconnected: true })).toBe(false);
  });
  it("excludes only incomplete assistant text, strips UI metadata/state and preserves display history", () => {
    const display = [assistant, user, { ...assistant, id: "partial", metadata: { ...terminal, completionState: "incomplete", finishReason: "length" }, parts: [{ type: "text", text: "częściowa", state: "streaming" }] }];
    const before = JSON.stringify(display);
    expect(getEligibleHistory(display, { "first-sdk-id": "complete", partial: "failed" })).toEqual([assistant, user]);
    expect(JSON.stringify(display)).toBe(before);
    expect(getEligibleHistory([{ ...assistant, metadata: terminal, parts: [{ type: "text", text: "Pełna ocena początkowa", state: "done" }] }, user], { "first-sdk-id": "complete" })).toEqual([assistant, user]);
  });
  it("requires unique IDs, an initial assistant, and an outstanding last user", () => {
    expect(eligibleHistorySchema.safeParse([assistant, user]).success).toBe(true);
    for (const messages of [[user], [assistant], [assistant, { ...user, id: assistant.id }], [{ ...assistant, parts: [] }, user]]) expect(eligibleHistorySchema.safeParse(messages).success).toBe(false);
  });
  it("permits forty logical user turns and rejects forty-one without shortening history", () => {
    const turns = Array.from({ length: 40 }, (_, index) => ({ ...user, id: `user-${index}` }));
    expect(eligibleHistorySchema.safeParse([assistant, ...turns]).success).toBe(true);
    expect(eligibleHistorySchema.safeParse([assistant, ...turns, { ...user, id: "extra" }]).success).toBe(false);
  });
  it("distinguishes context limits from malformed parts for later route error mapping", () => {
    const limited = caseMessageSchema.safeParse({ ...user, parts: [{ type: "text", text: "a".repeat(4001) }] });
    const malformed = caseMessageSchema.safeParse({ ...user, role: "system" });
    expect(limited.success).toBe(false);
    expect(malformed.success).toBe(false);
    if (!limited.success) expect(isContextLimitError(limited.error)).toBe(true);
    if (!malformed.success) expect(isContextLimitError(malformed.error)).toBe(false);
  });
});
