import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ActiveCaseSnapshot } from "@/lib/contracts/session";
import type { CaseForm } from "@/lib/contracts/form";
import type { ImageAnalysis } from "@/lib/contracts/analysis";
import type { InitialDecision } from "@/lib/contracts/decision";
import type { InitialApiResult } from "./initial-api-client";
import { createInitialWorkflowController, type InitialWorkflowDependencies, type InitialWorkflowView } from "./initial-workflow-controller";

const formatter = vi.hoisted(() => ({ seed: vi.fn() }));
vi.mock("@/lib/contracts/first-message", () => ({ createFirstDecisionMessage: formatter.seed }));
vi.mock("@/lib/contracts/errors", () => ({ createErrorEnvelope: (code: string, options: { operationId: string }) => ({ code, operationId: options.operationId, retryable: true, message: code === "OPERATION_TIMEOUT" ? "Przekroczono czas operacji. Spróbuj ponownie." : "Odpowiedź AI jest niepoprawna. Spróbuj ponownie." }) }));
const caseId = "d6a7c3f7-5711-4e97-ae3e-5195c48c2b95";
const operationId = "e6a7c3f7-5711-4e97-ae3e-5195c48c2b95";
const nextOperationId = "f6a7c3f7-5711-4e97-ae3e-5195c48c2b95";
const form: CaseForm = { scenario: "complaint", category: "computers", equipmentName: "Laptop", purchaseDate: "2026-01-01", deliveryDate: null, buyerStatus: "unknown", sellerStatus: "business", reason: "Nie działa.", requestedRemedy: "repair" };
const image = { imageDataUrl: "data:image/jpeg;base64,YQ==", thumbnailDataUrl: "data:image/jpeg;base64,YQ==", byteLength: 1, width: 1, height: 1, sha256: "a".repeat(64) };
const analysis: ImageAnalysis = { analysisId: caseId, scenario: "complaint", imageDigest: image.sha256, formFingerprint: "b".repeat(64), createdAt: "2026-10-01T08:00:00Z", modelId: "private-model", imageQuality: "adequate", observations: [], signsOfUse: [], possibleCauses: [], limitations: [], missingInformation: [] };
const decision: InitialDecision = { caseId, decisionId: nextOperationId, scenario: "complaint", outcome: "human_verification_required", greeting: "Dzień dobry.", summary: "Ocena sprawy.", justification: ["Wymagana weryfikacja."], evidence: [], policyReferences: ["section"], limitations: [], questions: [], nextSteps: ["Sprawdź fakty."], resaleAssessment: null, resaleExplanation: null, policy: { version: "1", digest: "c".repeat(64), sourceUrl: "https://allegro.pl/pomoc", retrievedAt: "2026-10-01T08:00:00Z", references: [{ headingId: "section", title: "Procedura", url: "https://allegro.pl/pomoc" }] }, createdAt: "2026-10-01T08:00:00Z", modelId: "private-model", preliminary: true, employeeVerificationRequired: true };
const seed = { id: "first-assessment", role: "assistant" as const, parts: [{ type: "text" as const, text: "Pełna wstępna ocena początkowa." }] };
function blank(): ActiveCaseSnapshot { return { schemaVersion: 1, caseId, revision: 0, screen: "form", stage: "form", stageStatus: "idle", draftForm: { ...form }, submittedForm: null, timeZone: "Europe/Warsaw", preparedImage: image, imageAnalysis: null, initialDecision: null, messages: [], replyStates: {}, pendingOperation: null, storageWarning: null }; }
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
function harness(initial = blank(), now = () => Date.now()) {
  let snapshot = initial;
  const checkpoints: ActiveCaseSnapshot[] = [];
  const analyze = vi.fn<InitialWorkflowDependencies["analyze"]>().mockResolvedValue({ status: "success", value: analysis });
  const decide = vi.fn<InitialWorkflowDependencies["decide"]>().mockResolvedValue({ status: "success", value: decision });
  const prepare = vi.fn<InitialWorkflowDependencies["prepare"]>().mockResolvedValue({ status: "prepared", preparedImage: image });
  const onComplete = vi.fn(); const views: InitialWorkflowView[] = [];
  const onView = vi.fn((view: InitialWorkflowView) => { views.push(view); });
  const makeOperationId = vi.fn().mockReturnValueOnce(operationId).mockReturnValue(nextOperationId);
  const makeMessageId = vi.fn(() => seed.id);
  let file: File | null = null;
  const controller = createInitialWorkflowController({ readCase: () => snapshot, checkpoint: next => { snapshot = next; checkpoints.push(next); }, readOriginalFile: () => file, analyze, decide, prepare, now, makeOperationId, makeMessageId, onView, onComplete });
  return { controller, checkpoints, analyze, decide, prepare, views, onView, onComplete, makeMessageId, get snapshot() { return snapshot; }, replace: (next: ActiveCaseSnapshot) => { snapshot = next; }, setFile: (next: File) => { file = next; } };
}
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-01T08:00:00Z")); formatter.seed.mockReturnValue(seed); });
afterEach(() => { vi.useRealTimers(); });
describe("sequential initial assessment checkpoints", () => {
  it("does not force persistence writes for clean draft edits before any initial operation", () => {
    const h = harness(); h.controller.invalidate(); expect(h.checkpoints).toHaveLength(0);
  });
  it("does not issue a zero-budget request when the deadline expires between stage entry and request creation", async () => {
    const base = Date.now();
    const now = vi.fn().mockReturnValue(base + 120000).mockReturnValueOnce(base).mockReturnValueOnce(base + 119999).mockReturnValueOnce(base + 119999);
    const h = harness(blank(), now); await h.controller.start(form);
    expect(h.analyze).not.toHaveBeenCalled(); expect(h.views.at(-1)?.error?.code).toBe("OPERATION_TIMEOUT");
  });
  it("uses prepared image once, checkpoints the report before decisions, and navigates only after one full seed", async () => {
    const h = harness(); h.decide.mockImplementation(async () => {
      expect(h.snapshot.imageAnalysis).toEqual(analysis); expect(h.snapshot.submittedForm).toEqual(form); expect(h.onComplete).not.toHaveBeenCalled();
      return { status: "success", value: decision };
    });
    await h.controller.start(form);
    expect(h.prepare).not.toHaveBeenCalled(); expect(h.analyze).toHaveBeenCalledTimes(1); expect(h.decide).toHaveBeenCalledTimes(1);
    expect(h.checkpoints.some(s => s.stage === "analysis" && s.stageStatus === "pending" && s.pendingOperation?.operationId === operationId)).toBe(true);
    expect(h.snapshot).toMatchObject({ screen: "chat", stage: "chat", stageStatus: "idle", pendingOperation: null, imageAnalysis: analysis, initialDecision: decision, messages: [seed], replyStates: { [seed.id]: "complete" } });
    expect(formatter.seed).toHaveBeenCalledExactlyOnceWith(decision, seed.id); expect(h.onComplete).toHaveBeenCalledTimes(1);
  });
  it("freezes normalized submitted facts even when the caller subsequently mutates its form", async () => {
    const h = harness(); const pending = deferred<InitialApiResult<ImageAnalysis>>(); h.analyze.mockReturnValue(pending.promise); const input = { ...form };
    const run = h.controller.start(input); input.equipmentName = "Zmieniona nazwa";
    expect(h.snapshot.submittedForm?.equipmentName).toBe("Laptop"); pending.resolve({ status: "success", value: analysis }); await run;
    expect(h.decide.mock.calls[0]?.[0].form.equipmentName).toBe("Laptop");
  });
  it("locks repeated submits synchronously without a second operation or first answer", async () => {
    const h = harness(); const pending = deferred<InitialApiResult<ImageAnalysis>>(); h.analyze.mockReturnValue(pending.promise);
    const first = h.controller.start(form); const second = h.controller.start(form); expect(h.analyze).toHaveBeenCalledTimes(1);
    pending.resolve({ status: "success", value: analysis }); await Promise.all([first, second]);
    expect(h.decide).toHaveBeenCalledTimes(1); expect(formatter.seed).toHaveBeenCalledTimes(1); expect(h.makeMessageId).toHaveBeenCalledTimes(1);
  });
  it("passes diminishing integer budgets to both model requests", async () => {
    const h = harness(); h.analyze.mockImplementation(async () => { vi.setSystemTime(Date.now() + 45001); return { status: "success", value: analysis }; });
    await h.controller.start(form);
    expect(h.analyze.mock.calls[0]?.[0].budgetMs).toBe(120000); expect(h.decide.mock.calls[0]?.[0].budgetMs).toBe(74999);
  });
  it("aborts at the global deadline and refuses late report, decision, seed, or navigation", async () => {
    const h = harness(); const pending = deferred<InitialApiResult<ImageAnalysis>>(); h.analyze.mockReturnValue(pending.promise); const run = h.controller.start(form);
    await vi.advanceTimersByTimeAsync(120000);
    expect(h.views.at(-1)).toMatchObject({ pending: false, error: { code: "OPERATION_TIMEOUT" } });
    expect(h.analyze.mock.calls[0]?.[1].signal.aborted).toBe(true);
    pending.resolve({ status: "success", value: analysis }); await run;
    expect(h.snapshot.imageAnalysis).toBeNull(); expect(h.decide).not.toHaveBeenCalled(); expect(h.onComplete).not.toHaveBeenCalled();
  });
  it("return to form invalidates first and preserves only draft and unchanged prepared image", async () => {
    const h = harness(); const pending = deferred<InitialApiResult<ImageAnalysis>>(); h.analyze.mockReturnValue(pending.promise); const run = h.controller.start(form);
    h.controller.returnToForm(); expect(h.analyze.mock.calls[0]?.[1].signal.aborted).toBe(true);
    expect(h.snapshot).toMatchObject({ stage: "form", stageStatus: "idle", submittedForm: null, pendingOperation: null, imageAnalysis: null, initialDecision: null, messages: [], draftForm: form, preparedImage: image });
    const count = h.checkpoints.length; pending.resolve({ status: "success", value: analysis }); await run;
    expect(h.checkpoints).toHaveLength(count); expect(h.onComplete).not.toHaveBeenCalled();
  });
  it("retries only failed decisions with the saved report and a fresh operation/deadline", async () => {
    const h = harness(); h.decide.mockResolvedValueOnce({ status: "failed", error: { code: "PROVIDER_ERROR", operationId, retryable: true, message: "Spróbuj ponownie." } });
    await h.controller.start(form); expect(h.snapshot.imageAnalysis).toEqual(analysis); expect(h.snapshot.initialDecision).toBeNull();
    vi.setSystemTime(Date.now() + 50000); await h.controller.retry();
    expect(h.analyze).toHaveBeenCalledTimes(1); expect(h.prepare).not.toHaveBeenCalled(); expect(h.decide).toHaveBeenCalledTimes(2);
    expect(h.decide.mock.calls[1]?.[0]).toMatchObject({ operationId: nextOperationId, budgetMs: 120000, imageAnalysis: analysis }); expect(h.onComplete).toHaveBeenCalledTimes(1);
  });
  it("retries failed analysis without repeating successful image preparation", async () => {
    const h = harness(); h.analyze.mockResolvedValueOnce({ status: "failed", error: { code: "PROVIDER_ERROR", operationId, retryable: true, message: "Spróbuj ponownie." } });
    await h.controller.start(form); expect(h.decide).not.toHaveBeenCalled(); await h.controller.retry();
    expect(h.analyze).toHaveBeenCalledTimes(2); expect(h.prepare).not.toHaveBeenCalled(); expect(h.onComplete).toHaveBeenCalledTimes(1);
  });
  it("does not begin analysis after image preparation fails", async () => {
    const h = harness({ ...blank(), preparedImage: null }); h.setFile(new File(["image"], "image.png", { type: "image/png" }));
    h.prepare.mockResolvedValueOnce({ status: "failed", message: "Nie udało się przygotować zdjęcia.", retryable: true });
    await h.controller.start(form); expect(h.prepare).toHaveBeenCalledTimes(1); expect(h.analyze).not.toHaveBeenCalled(); expect(h.decide).not.toHaveBeenCalled(); expect(h.onComplete).not.toHaveBeenCalled();
    expect(h.views.at(-1)?.pending).toBe(false);
  });
  it("does not invent a file when recovering interrupted preparation", async () => {
    const h = harness({ ...blank(), preparedImage: null, submittedForm: form, stage: "preparation", stageStatus: "interrupted", pendingOperation: { kind: "preparation", operationId, startedAt: "2026-10-01T08:00:00Z" } });
    await h.controller.retry(); expect(h.prepare).not.toHaveBeenCalled(); expect(h.analyze).not.toHaveBeenCalled(); expect(h.views.at(-1)?.error).toBeTruthy();
  });
  it("invalidates edited facts and ignores a response captured for the previous case", async () => {
    const h = harness(); const pending = deferred<InitialApiResult<ImageAnalysis>>(); h.analyze.mockReturnValue(pending.promise); const run = h.controller.start(form);
    h.controller.invalidate(); expect(h.analyze).toHaveBeenCalledTimes(1); expect(h.analyze.mock.calls[0]?.[1].signal.aborted).toBe(true);
    h.replace({ ...blank(), caseId: nextOperationId, draftForm: { ...form, equipmentName: "Inny sprzęt" } });
    pending.resolve({ status: "success", value: analysis }); await run;
    expect(h.snapshot.caseId).toBe(nextOperationId); expect(h.snapshot.imageAnalysis).toBeNull(); expect(h.decide).not.toHaveBeenCalled(); expect(h.onComplete).not.toHaveBeenCalled();
  });
  it("rejects an unusable full seed without truncation or successful navigation", async () => {
    formatter.seed.mockImplementation(() => { throw new RangeError("Message exceeds accepted bound"); }); const h = harness(); await h.controller.start(form);
    expect(h.views.at(-1)).toMatchObject({ error: { code: "INVALID_AI_OUTPUT" } }); expect(h.snapshot.messages).toEqual([]); expect(h.snapshot.screen).toBe("form"); expect(h.onComplete).not.toHaveBeenCalled();
  });
  it("does not start decisions when analysis consumed the entire common deadline", async () => {
    const h = harness(); h.analyze.mockImplementation(async () => { vi.setSystemTime(Date.now() + 120000); return { status: "success", value: analysis }; }); await h.controller.start(form);
    expect(h.analyze).toHaveBeenCalledTimes(1); expect(h.decide).not.toHaveBeenCalled(); expect(h.onComplete).not.toHaveBeenCalled(); expect(h.views.at(-1)?.error?.code).toBe("OPERATION_TIMEOUT");
  });
  it("preserves the report but refuses a late decision after cancel", async () => {
    const h = harness(); const pending = deferred<InitialApiResult<InitialDecision>>(); h.decide.mockReturnValue(pending.promise); const run = h.controller.start(form);
    await vi.advanceTimersByTimeAsync(0); expect(h.decide).toHaveBeenCalledTimes(1); h.controller.returnToForm();
    expect(h.decide.mock.calls[0]?.[1].signal.aborted).toBe(true); pending.resolve({ status: "success", value: decision }); await run;
    expect(h.snapshot.initialDecision).toBeNull(); expect(h.snapshot.messages).toEqual([]); expect(h.onComplete).not.toHaveBeenCalled();
  });
});
