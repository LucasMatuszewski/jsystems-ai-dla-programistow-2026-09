import "server-only";
import { z } from "zod";
import { ERROR_CODES } from "../../lib/contracts/errors";
const identityShape = { caseId: z.uuid(), operationId: z.uuid(), stage: z.enum(["analysis", "decision", "chat"]), modelId: z.string().regex(/^[\w.-]+\/[\w.:-]+$/) };
const identitySchema = z.strictObject(identityShape);
const completionSchema = z.object({ response: z.object({ id: z.string().regex(/^gen-[A-Za-z0-9-]{8,}$/).refine(id => !/(?:fake|mock|placeholder)/i.test(id)) }), finishReason: z.literal("stop") });
// The service calls this only after actual SDK success plus output/terminal validation. Shape checks alone are not provider-access proof.
export function recordCompletedGeneration(identity: unknown, result: unknown, complete: boolean, write: (line: string) => void = console.log): void {
  if (!complete) return;
  const context = identitySchema.safeParse(identity); const completion = completionSchema.safeParse(result);
  if (!context.success || !completion.success) return;
  write("[runtime-evidence] " + JSON.stringify({ event: "generation.completed", provider: "openrouter", ...context.data, generationId: completion.data.response.id, success: true }));
}
const tokenCount = z.number().int().nonnegative().optional();
const diagnosticSchema = z.object({ ...identityShape, elapsedMs: z.number().finite().nonnegative(), classification: z.enum([...ERROR_CODES, "completed", "cancelled"]),
  usage: z.object({ inputTokens: tokenCount, outputTokens: tokenCount, totalTokens: tokenCount }).optional(),
});
export function recordOperationDiagnostic(input: unknown, write: (line: string) => void = console.log): void {
  const parsed = diagnosticSchema.safeParse(input);
  if (parsed.success) write("[operation-diagnostic] " + JSON.stringify({ event: "operation.finished", ...parsed.data }));
}
