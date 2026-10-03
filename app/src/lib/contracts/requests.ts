import { z } from "zod";
import { createCaseFormSchema, SCENARIOS } from "./form";
import { getEmployeeToday } from "./calendar";
import { preparedImageSchema } from "./image";
import { createImageAnalysisSchema } from "./analysis";
import { createInitialDecisionSchema } from "./decision";
import { eligibleHistorySchema, messageIdSchema } from "./messages";

export const REQUEST_CONTRACT_REVISION = 1 as const;
export const MAX_INITIAL_BUDGET_MS = 120000;
function forwardIssues(context: z.RefinementCtx, error: z.ZodError) {
  for (const issue of error.issues) {
    // Parsed issues may carry an unknown input; raw string-format issues accept only string input.
    // Keep classification, paths and messages, forwarding no potentially private input value.
    const { input: discardedInput, ...safeIssue } = issue;
    void discardedInput;
    context.addIssue(safeIssue);
  }
}
export const timeZoneSchema = z.string().refine(zone => {
  try { getEmployeeToday(zone, new Date(0)); return true; } catch { return false; }
}, { error: "Wybierz poprawną strefę czasową pracownika." });
// Reject extra nested keys before C01 normalization. Stored facts do not expire when local today changes.
export const storedCaseFormSchema = z.strictObject({ scenario: z.enum(SCENARIOS), category: z.string(), equipmentName: z.string(), purchaseDate: z.string(), deliveryDate: z.string().nullable(), buyerStatus: z.string(), sellerStatus: z.string(), reason: z.string(), requestedRemedy: z.string().nullable() }).transform((value, context) => {
  const parsed = createCaseFormSchema("9999-12-31").safeParse(value);
  if (parsed.success) return parsed.data;
  forwardIssues(context, parsed.error);
  return z.NEVER;
});
export const storedImageAnalysisSchema = z.union([createImageAnalysisSchema("complaint"), createImageAnalysisSchema("return")]);
// Browser restoration checks stored shape/used references, not availability in the current server registry.
export const storedInitialDecisionSchema = z.unknown().transform((value, context) => {
  const header = z.object({ scenario: z.enum(SCENARIOS), policyReferences: z.array(z.string()) }).safeParse(value);
  if (!header.success) { forwardIssues(context, header.error); return z.NEVER; }
  const parsed = createInitialDecisionSchema(header.data.scenario, header.data.policyReferences).safeParse(value);
  if (parsed.success) return parsed.data;
  forwardIssues(context, parsed.error);
  return z.NEVER;
});
const identity = { caseId: z.uuid(), operationId: z.uuid(), form: storedCaseFormSchema, timeZone: timeZoneSchema, budgetMs: z.number().int().min(1).max(MAX_INITIAL_BUDGET_MS) };
function checkCalendar(value: { form: z.infer<typeof storedCaseFormSchema>; timeZone: string }, context: z.RefinementCtx, now: Date, prefix: string[] = []) {
  if (!timeZoneSchema.safeParse(value.timeZone).success) return;
  const parsed = createCaseFormSchema(getEmployeeToday(value.timeZone, now)).safeParse(value.form);
  if (!parsed.success) for (const issue of parsed.error.issues) context.addIssue({ ...issue, path: [...prefix, "form", ...issue.path] });
}
export function createAnalysisRequestSchema(now = new Date()) {
  return z.strictObject({ ...identity, preparedImage: preparedImageSchema }).superRefine((value, context) => checkCalendar(value, context, now));
}
export function createDecisionRequestSchema(now = new Date()) {
  return z.strictObject({ ...identity, imageAnalysis: storedImageAnalysisSchema }).superRefine((value, context) => {
    checkCalendar(value, context, now);
    if (value.form.scenario !== value.imageAnalysis.scenario) context.addIssue({ code: "custom", path: ["imageAnalysis", "scenario"], message: "Analiza dotyczy innego rodzaju sprawy." });
  });
}
export const caseContextSchema = z.strictObject({ form: storedCaseFormSchema, timeZone: timeZoneSchema, imageAnalysis: storedImageAnalysisSchema, initialDecision: storedInitialDecisionSchema }).superRefine((value, context) => {
  if (value.imageAnalysis.scenario !== value.form.scenario || value.initialDecision.scenario !== value.form.scenario) context.addIssue({ code: "custom", message: "Kontekst dotyczy innego rodzaju sprawy." });
});
export function createChatRequestSchema(now = new Date()) {
  return z.strictObject({ id: z.uuid(), operationId: z.uuid(), replyMessageId: messageIdSchema, trigger: z.enum(["send-message", "regenerate-message"]), caseContext: caseContextSchema, messages: eligibleHistorySchema }).superRefine((value, context) => {
    checkCalendar(value.caseContext, context, now, ["caseContext"]);
    if (value.id !== value.caseContext.initialDecision.caseId) context.addIssue({ code: "custom", path: ["id"], message: "Kontekst dotyczy innej sprawy." });
    if (value.messages.some(message => message.id === value.replyMessageId)) context.addIssue({ code: "custom", path: ["replyMessageId"], message: "Odpowiedź nie może nadpisać wcześniejszej wiadomości." });
  });
}
export type AnalysisRequest = z.infer<ReturnType<typeof createAnalysisRequestSchema>>;
export type DecisionRequest = z.infer<ReturnType<typeof createDecisionRequestSchema>>;
export type ChatRequest = z.infer<ReturnType<typeof createChatRequestSchema>>;
