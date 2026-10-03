import { describe, expect, it } from "vitest";
import type { UIMessage } from "ai";
import { completedReply, retryTurn } from "./reply-lifecycle";
const operationId = "e6a7c3f7-5711-4e97-ae3e-5195c48c2b95";
const reply: UIMessage = { id: "reply", role: "assistant", parts: [{ type: "text", text: "Odpowiedź", state: "done" }], metadata: { operationId, finishReason: "stop", completionState: "complete" } };
describe("explicit outstanding reply lifecycle", () => {
  it.each(["abort", "disconnect", "error", "length", "missing", "operation", "reply", "empty"])("rejects apparent completion after %s", failure => {
    const message = { ...reply, ...(failure === "reply" ? { id: "foreign" } : {}), ...(failure === "empty" ? { parts: [] } : {}), metadata: failure === "missing" ? undefined : { operationId: failure === "operation" ? "d6a7c3f7-5711-4e97-ae3e-5195c48c2b95" : operationId, finishReason: failure === "length" ? "length" : "stop", completionState: failure === "length" ? "incomplete" : "complete" } };
    expect(completedReply(message, { operationId, replyMessageId: reply.id, errorSeen: false }, { isAbort: failure === "abort", isDisconnect: failure === "disconnect", isError: failure === "error" })).toBe(false);
  });
  it("requires normal SDK outcome and exact successful non-empty terminal", () => {
    expect(completedReply(reply, { operationId, replyMessageId: reply.id, errorSeen: false }, {})).toBe(true);
    expect(completedReply(reply, { operationId, replyMessageId: reply.id, errorSeen: true }, {})).toBe(false);
  });
  it("identifies a durable zero-text interrupted turn without creating content or another user", () => {
    const messages: UIMessage[] = [{ id: "first", role: "assistant", parts: [] }, { id: "user", role: "user", parts: [{ type: "text", text: "Pytanie" }] }, { ...reply, parts: [], metadata: { operationId, finishReason: "aborted", completionState: "incomplete" } }];
    expect(retryTurn(messages, { first: "complete", reply: "interrupted" })).toEqual({ userMessageId: "user", replyMessageId: "reply", operationId });
    expect(retryTurn([...messages, { id: "later", role: "assistant", parts: [{ type: "text", text: "Ukończona" }] }], { reply: "interrupted", later: "complete" })).toBeNull();
    expect(retryTurn(messages, { reply: "complete" })).toBeNull();
  });
  it("does not offer retry for a persisted terminal failure", () => {
    const messages: UIMessage[] = [{ id: "first", role: "assistant", parts: [] }, { id: "user", role: "user", parts: [{ type: "text", text: "Pytanie" }] }, { ...reply, parts: [], metadata: { operationId, finishReason: "error", completionState: "incomplete", retryable: false } }];
    expect(retryTurn(messages, { first: "complete", reply: "failed" })).toBeNull();
  });
});
