import { z } from "zod";
import { SCENARIOS, CATEGORIES, BUYER_STATUSES, SELLER_STATUSES, REMEDIES } from "./form";
import { preparedImageSchema } from "./image";
import { timeZoneSchema, storedCaseFormSchema, storedImageAnalysisSchema, storedInitialDecisionSchema } from "./requests";
import { displayMessagesSchema, messageIdSchema, replyStateSchema } from "./messages";

export const ACTIVE_CASE_STORAGE_KEY = "hardware-service-copilot.active-case";
export const SESSION_CONTRACT_REVISION = 1 as const;
export const SNAPSHOT_SOFT_UTF16_BUDGET = 4000000;
export const draftFormSchema = z.strictObject({
  scenario: z.enum([...SCENARIOS, ""]), category: z.enum([...CATEGORIES, ""]), equipmentName: z.string(), purchaseDate: z.string(), deliveryDate: z.string().nullable(),
  buyerStatus: z.enum([...BUYER_STATUSES, ""]), sellerStatus: z.enum([...SELLER_STATUSES, ""]), reason: z.string(), requestedRemedy: z.enum([...REMEDIES, ""]).nullable(),
});
export type DraftForm = z.infer<typeof draftFormSchema>;
const pendingBase = { operationId: z.uuid(), startedAt: z.iso.datetime() };
export const pendingOperationSchema = z.discriminatedUnion("kind", [
  z.strictObject({ ...pendingBase, kind: z.literal("preparation") }),
  z.strictObject({ ...pendingBase, kind: z.literal("analysis") }),
  z.strictObject({ ...pendingBase, kind: z.literal("decision") }),
  z.strictObject({ ...pendingBase, kind: z.literal("chat"), userMessageId: messageIdSchema, replyMessageId: messageIdSchema }),
]);
export const activeCaseSnapshotSchema = z.strictObject({
  schemaVersion: z.literal(1), caseId: z.uuid(), revision: z.number().int().min(0), screen: z.enum(["form", "chat"]),
  stage: z.enum(["form", "preparation", "analysis", "decision", "chat"]), stageStatus: z.enum(["idle", "pending", "interrupted"]),
  draftForm: draftFormSchema, submittedForm: storedCaseFormSchema.nullable(), timeZone: timeZoneSchema,
  preparedImage: preparedImageSchema.nullable(), imageAnalysis: storedImageAnalysisSchema.nullable(), initialDecision: storedInitialDecisionSchema.nullable(),
  messages: displayMessagesSchema, replyStates: z.record(messageIdSchema, replyStateSchema), pendingOperation: pendingOperationSchema.nullable(),
  storageWarning: z.enum(["unavailable", "quota-exceeded", "snapshot-too-large"]).nullable(),
}).superRefine((value, context) => {
  const scenario = value.submittedForm?.scenario ?? value.imageAnalysis?.scenario ?? value.initialDecision?.scenario;
  if ((value.imageAnalysis && value.imageAnalysis.scenario !== scenario) || (value.initialDecision && value.initialDecision.scenario !== scenario)) context.addIssue({ code: "custom", message: "Zapisane wyniki dotyczą innego rodzaju sprawy." });
  if (value.initialDecision && value.initialDecision.caseId !== value.caseId) context.addIssue({ code: "custom", path: ["initialDecision", "caseId"], message: "Ocena dotyczy innej sprawy." });
  if (value.preparedImage && value.imageAnalysis && value.preparedImage.sha256 !== value.imageAnalysis.imageDigest) context.addIssue({ code: "custom", path: ["imageAnalysis", "imageDigest"], message: "Analiza dotyczy innego zdjęcia." });
  if (value.stageStatus === "pending" && (!value.pendingOperation || value.pendingOperation.kind !== value.stage)) context.addIssue({ code: "custom", path: ["pendingOperation"], message: "Brakuje zgodnej oczekującej operacji." });
  for (const id of Object.keys(value.replyStates)) if (!value.messages.some(message => message.id === id && message.role === "assistant")) context.addIssue({ code: "custom", path: ["replyStates", id], message: "Stan odpowiedzi nie ma zgodnej wiadomości." });
  if (value.pendingOperation?.kind === "chat") {
    const operation = value.pendingOperation;
    if (!value.messages.some(message => message.id === operation.userMessageId && message.role === "user")) context.addIssue({ code: "custom", path: ["pendingOperation", "userMessageId"], message: "Brakuje wiadomości pracownika." });
    // A reply placeholder may not exist yet, but any existing reference must identify an assistant.
    if (operation.userMessageId === operation.replyMessageId || value.messages.some(message => message.id === operation.replyMessageId && message.role !== "assistant")) context.addIssue({ code: "custom", path: ["pendingOperation", "replyMessageId"], message: "Nieprawidłowy identyfikator odpowiedzi." });
  }
});
export type ActiveCaseSnapshot = z.infer<typeof activeCaseSnapshotSchema>;
export const localCaseRegistrySchema = z.strictObject({
  schemaVersion: z.literal(2), activeCaseId: z.uuid(), cases: z.record(z.uuid(), activeCaseSnapshotSchema),
}).superRefine((value, context) => {
  if (!value.cases[value.activeCaseId]) context.addIssue({ code: "custom", path: ["activeCaseId"], message: "Brakuje aktywnej sprawy w zapisanym rejestrze." });
  for (const [id, snapshot] of Object.entries(value.cases)) if (id !== snapshot.caseId) context.addIssue({ code: "custom", path: ["cases", id, "caseId"], message: "Zapis sprawy ma niezgodny identyfikator." });
});
export type LocalCaseRegistry = z.infer<typeof localCaseRegistrySchema>;
export type PendingOperation = z.infer<typeof pendingOperationSchema>;
