import "server-only";
import { CallerCancelledError, OperationError } from "../http/errors";
export const STAGE_DEADLINES_MS = Object.freeze({ prepare: 30000, analysis: 60000, decision: 90000, chat: 90000 });
export interface OperationDeadline { signal: AbortSignal; remainingMs(): number; dispose(): void }
export function createOperationDeadline(kind: "prepare" | "analysis" | "decision" | "chat", budget?: number, caller?: AbortSignal) {
  if (budget !== undefined && (!Number.isInteger(budget) || budget < 1 || budget > 120000)) throw new OperationError("VALIDATION_ERROR");
  const duration = kind === "chat" ? STAGE_DEADLINES_MS.chat : Math.min(STAGE_DEADLINES_MS[kind], budget ?? 120000);
  const expiresAt = performance.now() + duration;
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const dispose = () => { if (timer !== undefined) clearTimeout(timer); timer = undefined; caller?.removeEventListener("abort", cancel); };
  const cancel = () => { controller.abort(new CallerCancelledError()); dispose(); };
  if (caller?.aborted) cancel();
  else {
    caller?.addEventListener("abort", cancel, { once: true });
    timer = setTimeout(() => { controller.abort(new OperationError("OPERATION_TIMEOUT")); dispose(); }, duration);
  }
  return { signal: controller.signal, remainingMs: () => controller.signal.aborted ? 0 : Math.max(0, Math.ceil(expiresAt - performance.now())), dispose } satisfies OperationDeadline;
}
