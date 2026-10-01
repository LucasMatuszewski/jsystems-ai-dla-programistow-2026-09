import "server-only";
import { OperationError } from "../http/errors";
export function getAiConfiguration(): { apiKey: string; modelId: string } {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  const modelId = process.env.LLM_MODEL?.trim();
  if (!apiKey || /[\r\n]/.test(apiKey) || !modelId || !/^[\w.-]+\/[\w.:-]+$/.test(modelId)) throw new OperationError("CONFIGURATION_ERROR");
  return { apiKey, modelId };
}
