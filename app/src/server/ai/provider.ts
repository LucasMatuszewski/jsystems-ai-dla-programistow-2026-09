import "server-only";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { getAiConfiguration } from "./configuration";
export function createAiStageOptions(stage: "analysis" | "decision" | "chat", abortSignal: AbortSignal) {
  abortSignal.throwIfAborted();
  const { apiKey, modelId } = getAiConfiguration();
  const provider = createOpenRouter({ apiKey, baseURL: "https://openrouter.ai/api/v1", compatibility: "strict" });
  return { model: provider.chat(modelId), abortSignal, maxRetries: 0, maxOutputTokens: stage === "decision" ? 12288 : 8192,
    providerOptions: { openrouter: { reasoning: { exclude: true, effort: stage === "analysis" ? "low" as const : "medium" as const } } },
  };
}
