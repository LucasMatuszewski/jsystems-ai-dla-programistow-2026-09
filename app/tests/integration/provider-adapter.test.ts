import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateText, streamText, Output } from "ai";
import { z } from "zod";
import { createAiStageOptions } from "@/server/ai/provider";
import { createOperationDeadline } from "@/server/ai/deadline";
import { classifyOperationError } from "@/server/http/errors";
describe("real SDK and provider with only external HTTP substituted", () => {
  beforeEach(() => { vi.stubEnv("OPENROUTER_API_KEY", "fixture-only-key"); vi.stubEnv("LLM_MODEL", "openai/gpt-6-luna"); });
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
  it.each(["analysis", "decision", "chat"] as const)("sends %s only to explicit OpenRouter model with stage settings", async stage => {
    let endpoint = ""; let body: Record<string, unknown> = {};
    vi.stubGlobal("fetch", async (input: string | URL | Request, init?: RequestInit) => {
      endpoint = String(input); body = JSON.parse(String(init?.body));
      return Response.json({ id: "gen-fixture-12345678", object: "chat.completion", created: 1790000000, model: "openai/gpt-6-luna", choices: [{ index: 0, message: { role: "assistant", content: '{"answer":"ok"}' }, finish_reason: "stop" }], usage: { prompt_tokens: 2, completion_tokens: 4, total_tokens: 6 } });
    });
    const result = await generateText({ ...createAiStageOptions(stage, new AbortController().signal), prompt: "nonsecret fixture", output: Output.object({ schema: z.object({ answer: z.string() }) }) });
    expect(result.output).toEqual({ answer: "ok" }); expect(result.response.id).toBe("gen-fixture-12345678");
    expect(endpoint).toBe("https://openrouter.ai/api/v1/chat/completions"); expect(body.model).toBe("openai/gpt-6-luna");
    expect(body.max_tokens).toBe(stage === "decision" ? 12288 : 8192);
    expect(body.reasoning).toEqual({ exclude: true, effort: stage === "analysis" ? "low" : "medium" });
    expect(body).not.toHaveProperty("temperature"); expect(body).not.toHaveProperty("top_p"); expect(body).not.toHaveProperty("models");
  });
  it("performs no automatic retries for an upstream rate limit", async () => {
    let calls = 0;
    vi.stubGlobal("fetch", async () => { calls++; return Response.json({ error: { message: "fixture rate limit", code: 429 } }, { status: 429 }); });
    let failure: unknown;
    try { await generateText({ ...createAiStageOptions("analysis", new AbortController().signal), prompt: "fixture" }); } catch (error) { failure = error; }
    expect(calls).toBe(1); expect(classifyOperationError(failure)).toEqual({ kind: "error", code: "PROVIDER_QUOTA_OR_RATE_LIMIT" });
  });
  it("uses actual SDK streaming with only external OpenRouter SSE substituted", async () => {
    let endpoint = ""; let sent: Record<string, unknown> = {};
    vi.stubGlobal("fetch", async (input: unknown, init?: RequestInit) => {
      endpoint = String(input); sent = JSON.parse(String(init?.body));
      const identity = { id: "gen-fixture-12345678", object: "chat.completion.chunk", created: 1790000000, model: "openai/gpt-6-luna" };
      const events = [{ ...identity, choices: [{ index: 0, delta: { role: "assistant", content: "Fixture tekst" }, finish_reason: null }] }, { ...identity, choices: [{ index: 0, delta: {}, finish_reason: "stop" }], usage: { prompt_tokens: 2, completion_tokens: 4, total_tokens: 6 } }];
      return new Response(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join("") + "data: [DONE]\n\n", { headers: { "Content-Type": "text/event-stream" } });
    });
    const result = streamText({ ...createAiStageOptions("chat", new AbortController().signal), prompt: "nonsecret fixture" });
    expect(await result.text).toBe("Fixture tekst"); expect(await result.finishReason).toBe("stop");
    expect((await result.response).id).toBe("gen-fixture-12345678");
    expect(endpoint).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(sent.stream).toBe(true); expect(sent.reasoning).toEqual({ exclude: true, effort: "medium" });
  });
  it("propagates the operation abort signal upstream without a completed generation", async () => {
    const caller = new AbortController(); const deadline = createOperationDeadline("chat", undefined, caller.signal);
    let started!: () => void; const ready = new Promise<void>(resolve => { started = resolve; });
    vi.stubGlobal("fetch", async (_input: unknown, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal; started();
      signal?.addEventListener("abort", () => reject(signal.reason), { once: true });
    }));
    const pending = generateText({ ...createAiStageOptions("chat", deadline.signal), prompt: "fixture" });
    await ready; caller.abort();
    await expect(pending).rejects.toBeDefined(); expect(deadline.signal.aborted).toBe(true);
    expect(classifyOperationError(deadline.signal.reason)).toEqual({ kind: "cancelled" }); deadline.dispose();
  }, 2000);
});
