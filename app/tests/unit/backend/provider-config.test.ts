import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ create: vi.fn(), chat: vi.fn() }));
vi.mock("@openrouter/ai-sdk-provider", () => ({ createOpenRouter: mocks.create }));
import { getAiConfiguration } from "@/server/ai/configuration";
import { createAiStageOptions } from "@/server/ai/provider";
describe("lazy explicit OpenRouter configuration", () => {
  afterEach(() => vi.unstubAllEnvs());
  beforeEach(() => {
    vi.stubEnv("OPENROUTER_API_KEY", "fixture-only-key"); vi.stubEnv("LLM_MODEL", "openai/gpt-6-luna");
    mocks.create.mockReturnValue({ chat: mocks.chat }); mocks.chat.mockReturnValue({ modelId: "fixture" });
  });
  it("does not instantiate a provider at module import", () => { expect(mocks.create).not.toHaveBeenCalled(); });
  it.each(["OPENROUTER_API_KEY", "LLM_MODEL"])("rejects absent %s lazily without provider calls", key => {
    vi.stubEnv(key, " "); expect(() => createAiStageOptions("analysis", new AbortController().signal)).toThrow();
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("uses only current explicit configuration and trims incidental whitespace", () => {
    vi.stubEnv("OPENROUTER_API_KEY", " fixture-only-key ");
    expect(getAiConfiguration()).toEqual({ apiKey: "fixture-only-key", modelId: "openai/gpt-6-luna" });
    vi.stubEnv("LLM_MODEL", "vendor/other-model"); expect(getAiConfiguration().modelId).toBe("vendor/other-model");
  });
  it.each(["gpt-6-luna", "https://untrusted.test/model", "vendor/model\nprivate"])("rejects invalid model syntax %s", model => {
    vi.stubEnv("LLM_MODEL", model); expect(() => getAiConfiguration()).toThrow();
  });
  it.each([["analysis", "low", 8192], ["decision", "medium", 12288], ["chat", "medium", 8192]] as const)("freezes %s routing, reasoning suppression and zero retries", (stage, effort, maxOutputTokens) => {
    const abortSignal = new AbortController().signal;
    const options = createAiStageOptions(stage, abortSignal);
    expect(mocks.create).toHaveBeenCalledWith({ apiKey: "fixture-only-key", baseURL: "https://openrouter.ai/api/v1", compatibility: "strict" });
    expect(mocks.chat).toHaveBeenCalledWith("openai/gpt-6-luna");
    expect(options).toEqual({ model: { modelId: "fixture" }, abortSignal, maxRetries: 0, maxOutputTokens, providerOptions: { openrouter: { reasoning: { exclude: true, effort } } } });
    expect(options).not.toHaveProperty("temperature"); expect(options).not.toHaveProperty("topP");
  });
});
