import { expect, test } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { formatFirstDecision } from "../../src/lib/contracts/first-message";
import { createChatRequestSchema } from "../../src/lib/contracts/requests";
import { assessActualCase } from "./helpers/assessment-observations";
import { readCaseCheckpoint } from "./helpers/case-checkpoint";
import { assertCanonicalChatStream, assertFullChatRequest, captureChatCheckpoint, chatAssessmentNotice, chatLabels } from "./helpers/chat-actions";
import { startChatStreamObserver } from "./helpers/chat-stream-observer";
import { verifyCapturedGenerations } from "./helpers/app-readiness";

test.use({ locale: "pl-PL", timezoneId: "Europe/Warsaw", actionTimeout: 10_000 });
test.setTimeout(900_000);

test("a genuinely interrupted partial answer preserves the employee turn and exposes explicit retry", async ({ page }, info) => {
  // Native preparation and both official positive generation proofs are prerequisites.
  // A failed initial assessment or a completed-before-Stop response is not retry RED.
  const { decision } = await assessActualCase(page, info, "example-phone");
  const initial = await readCaseCheckpoint(page, decision.caseId);
  expect(initial.messages.length === 1 && initial.messages[0].role === "assistant" && initial.messages[0].parts.map(part => part.text).join("") === formatFirstDecision(decision), "retry starts from the genuine full first assessment").toBe(true);
  const observer = await startChatStreamObserver(page, { url: new URL("/api/chat", page.url()).href });
  let chatRequests = 0;
  const initialReplays = { analysis: 0, decision: 0 };
  page.on("request", request => {
    if (request.method() !== "POST") return;
    const path = new URL(request.url()).pathname;
    if (path === "/api/chat") chatRequests++;
    if (path === "/api/analysis") initialReplays.analysis++;
    if (path === "/api/decisions") initialReplays.decision++;
  });
  try {
    const text = "Pomóż pracownikowi uporządkować tę reklamację. Wyjaśnij kolejno zgłoszone fakty, ograniczenia zdjęcia, brakujące informacje, chronologię i czynności wymagające weryfikacji. Rozwiń każdy punkt w osobnym akapicie; nie podejmuj ostatecznej decyzji.";
    const sending = page.waitForRequest(request => request.method() === "POST" && new URL(request.url()).pathname === "/api/chat", { timeout: 15_000 });
    const composer = page.getByRole("textbox", { name: chatLabels.message, exact: true });
    await composer.fill(text);
    await composer.focus(); await page.keyboard.press("Enter");
    const request = await sending;
    const body = assertFullChatRequest(request.postDataJSON(), initial, text);
    const userId = body.messages.at(-1)!.id;
    const reply = page.locator(`[data-message-id="${body.replyMessageId}"]`);
    await expect(page.getByRole("status").filter({ hasText: chatLabels.pending })).toBeVisible();
    await expect.poll(async () => {
      const current = await readCaseCheckpoint(page, decision.caseId);
      const content = reply.locator("[data-message-content]");
      return current.pendingOperation?.operationId === body.operationId && current.replyStates[body.replyMessageId] === "streaming" && await content.count() === 1 && (await content.innerText()).trim().length > 0;
    }, { timeout: 125_000, intervals: [25, 50, 100], message: "healthy Stop prerequisite: this exact real reply has incremental text while still pending" }).toBe(true);
    const beforeStop = await readCaseCheckpoint(page, decision.caseId);
    const partial = beforeStop.messages.find(message => message.id === body.replyMessageId)?.parts.map(part => part.text).join("") ?? "";
    expect(beforeStop.pendingOperation?.operationId === body.operationId && partial.trim().length > 0, "response must not finish before genuine Stop activation").toBe(true);
    await page.getByRole("button", { name: chatLabels.stop, exact: true }).click();
    await expect.poll(async () => {
      const current = await readCaseCheckpoint(page, decision.caseId);
      // A durable interrupted operation can retain the retry identity. It is not
      // active pending work and must not be erased merely to satisfy this test.
      return current.stageStatus === "interrupted" && current.replyStates[body.replyMessageId] === "interrupted";
    }, { message: "actual Stop must persist an interrupted reply, never successful completion" }).toBe(true);
    await expect(page.getByRole("status").filter({ hasText: chatLabels.pending })).toHaveCount(0);
    await expect(page.getByRole("button", { name: chatLabels.stop, exact: true })).toHaveCount(0);
    const outcome = await observer.finished;
    expect(outcome.kind === "failed", "a user-aborted stream is not normal transport success or an inspector completion candidate").toBe(true);
    if (outcome.kind !== "failed") throw new Error("Cancellation prerequisite failed; private stream withheld");
    expect(outcome.diagnostics.canceled === true && outcome.diagnostics.errorCategory === "ABORTED" && outcome.diagnostics.activationReady && !outcome.diagnostics.finishSeen && !outcome.diagnostics.doneSeen, "real cancellation must occur before a canonical successful terminal").toBe(true);
    const interrupted = await readCaseCheckpoint(page, decision.caseId);
    const savedReply = interrupted.messages.find(message => message.id === body.replyMessageId);
    expect(JSON.stringify(interrupted.messages.slice(0, initial.messages.length)) === JSON.stringify(initial.messages), "Stop preserves the earlier completed assessment exactly").toBe(true);
    expect(interrupted.messages.length === initial.messages.length + 2 && interrupted.messages.filter(message => message.id === userId && message.role === "user").length === 1, "Stop preserves the accepted employee turn once").toBe(true);
    expect(savedReply?.role === "assistant" && savedReply.parts.map(part => part.text).join("").startsWith(partial) && savedReply.metadata?.completionState !== "complete", "real partial text remains incomplete without a fabricated answer").toBe(true);
    await expect(reply.getByText("Ta odpowiedź nie została ukończona.", { exact: true })).toBeVisible();
    await expect(reply.getByText(chatAssessmentNotice, { exact: true })).toBeVisible();
    expect(chatRequests).toBe(1);
    const path = info.outputPath("healthy-interrupted-chat-scalars.json");
    writeFileSync(path, JSON.stringify({ caseId: decision.caseId, operationId: body.operationId, replyMessageId: body.replyMessageId, userMessageId: userId, actualInitialModelCalls: 2, actualChatCalls: chatRequests, initialGenerationsVerified: true, replyState: "interrupted", priorAssessmentPreserved: true, userPreservedOnce: true, actualPartialPreserved: true, cancellation: outcome.diagnostics, stoppedGenerationPositiveCompletion: "not asserted" }));
    await info.attach("healthy-interrupted-chat-scalars", { path, contentType: "application/json" });
    await captureChatCheckpoint(page, info, "interrupted-before-retry");
    // Missing Retry remains the first reachable F08 RED. No extra request can be
    // submitted until this visible, explicit employee action exists.
    const retry = page.getByRole("button", { name: chatLabels.retry, exact: true });
    await expect(retry, "a genuinely interrupted answer must expose an explicit Polish retry action").toBeVisible();
    await observer.dispose();
    const retryObserver = await startChatStreamObserver(page, { url: new URL("/api/chat", page.url()).href });
    try {
      const retrySending = page.waitForRequest(request => request.method() === "POST" && new URL(request.url()).pathname === "/api/chat", { timeout: 15_000 });
      await retry.focus(); await page.keyboard.press("Enter");
      const retryRequest = await retrySending;
      const rawRetry: unknown = retryRequest.postDataJSON();
      const parsed = createChatRequestSchema().safeParse(rawRetry);
      expect(parsed.success, "actual retry must satisfy the unchanged strict B08 wire contract").toBe(true);
      if (!parsed.success) throw new Error("Invalid actual retry request; private body withheld");
      const retryBody = parsed.data;
      expect(retryBody.trigger === "regenerate-message" && retryBody.id === body.id && retryBody.replyMessageId === body.replyMessageId && retryBody.operationId !== body.operationId, "retry uses the same case and reply with a fresh operation").toBe(true);
      expect(JSON.stringify(retryBody.caseContext) === JSON.stringify(body.caseContext), "retry retains the entire immutable form, analysis, first decision and pinned policy").toBe(true);
      expect(JSON.stringify(retryBody.messages) === JSON.stringify(body.messages), "retry includes all prior completed history and the same employee turn, excluding only the interrupted assistant partial").toBe(true);
      expect(retryBody.messages.filter(message => message.role === "user" && message.id === userId).length === 1 && !retryBody.messages.some(message => message.id === body.replyMessageId), "retry never duplicates the employee or submits the failed partial as model context").toBe(true);
      expect(Object.keys(rawRetry as Record<string, unknown>).sort().join(",") === ["id", "operationId", "replyMessageId", "trigger", "caseContext", "messages"].sort().join(",") && retryBody.messages.every(message => Object.keys(message).sort().join(",") === "id,parts,role" && message.parts.every(part => Object.keys(part).sort().join(",") === "text,type")), "retry projects eligible text-only history without SDK markers or metadata").toBe(true);
      await expect(page.getByRole("status").filter({ hasText: chatLabels.pending })).toBeVisible();
      await expect(page.getByRole("button", { name: chatLabels.stop, exact: true })).toBeVisible();
      const interruptedText = savedReply!.parts.map(part => part.text).join("");
      await expect.poll(async () => {
        const current = await readCaseCheckpoint(page, decision.caseId);
        const message = current.messages.find(message => message.id === body.replyMessageId);
        const content = reply.locator("[data-message-content]");
        const freshText = message?.parts.map(part => part.text).join("") ?? "";
        return current.pendingOperation?.operationId === retryBody.operationId && current.replyStates[body.replyMessageId] === "streaming" && message?.parts.some(part => part.state === "streaming") && freshText.trim().length > 0 && freshText !== interruptedText && await content.count() === 1 && (await content.innerText()).trim().length > 0;
      }, { timeout: 125_000, intervals: [25, 50, 100], message: "the replacement reply must show fresh actual incremental text while its new operation is pending" }).toBe(true);
      await expect.poll(async () => {
        const current = await readCaseCheckpoint(page, decision.caseId);
        const message = current.messages.find(message => message.id === body.replyMessageId);
        return current.pendingOperation === null && current.stageStatus !== "pending" && current.replyStates[body.replyMessageId] === "complete" && message?.role === "assistant" && message.metadata?.operationId === retryBody.operationId && message.metadata.finishReason === "stop" && message.metadata.completionState === "complete" && message.parts.every(part => part.type === "text" && part.state !== "streaming") && message.parts.map(part => part.text).join("").trim().length > 0;
      }, { timeout: 125_000, message: "retry completion requires independent normal SDK outcome and matching fresh canonical terminal metadata" }).toBe(true);
      const capture = await retryObserver.finished;
      if (capture.kind === "failed") throw capture.error;
      // Inspector candidates alone cannot authorize completion: the independent
      // persisted SDK completion predicate above and provider proof below remain mandatory.
      const streamedText = await assertCanonicalChatStream(capture.capture, retryBody);
      const completed = await readCaseCheckpoint(page, decision.caseId);
      const completedReply = completed.messages.find(message => message.id === body.replyMessageId)!;
      expect(streamedText === completedReply.parts.map(part => part.text).join(""), "same-request retry bytes must equal the whole replacement, without concatenating the old partial").toBe(true);
      expect(completed.messages.length === interrupted.messages.length && completed.messages.filter(message => message.id === body.replyMessageId).length === 1 && JSON.stringify(completed.messages.slice(0, initial.messages.length + 1)) === JSON.stringify(interrupted.messages.slice(0, initial.messages.length + 1)), "retry replaces one stable reply and preserves the employee and all earlier completed messages exactly").toBe(true);
      expect(JSON.stringify({ form: completed.submittedForm, imageAnalysis: completed.imageAnalysis, initialDecision: completed.initialDecision, timeZone: completed.timeZone }) === JSON.stringify({ form: initial.submittedForm, imageAnalysis: initial.imageAnalysis, initialDecision: initial.initialDecision, timeZone: initial.timeZone }), "retry cannot mutate the original case context").toBe(true);
      await expect(reply.getByText(chatAssessmentNotice, { exact: true })).toBeVisible();
      await expect(reply.getByText("Ta odpowiedź nie została ukończona.", { exact: true })).toHaveCount(0);
      expect(chatRequests, "one Stop and one explicit retry produce exactly two actual chat requests").toBe(2);
      const proofs = await verifyCapturedGenerations({ caseId: decision.caseId, operationId: retryBody.operationId, stage: "chat", modelId: "openai/gpt-6-luna" }, { metadataWaitDeadlineMs: performance.now() + 420_000, attemptReportPath: info.outputPath("retry-positive-provider-proof.json") });
      expect(proofs.length, "completed retry needs one officially verified positive canonical generation").toBe(1);
      await captureChatCheckpoint(page, info, "completed-replacement");
      await page.reload(); await expect(composer).toBeVisible();
      await expect.poll(async () => JSON.stringify((await readCaseCheckpoint(page, decision.caseId)).messages) === JSON.stringify(completed.messages), "refresh restores the exact completed replacement and full history").toBe(true);
      expect(chatRequests).toBe(2); expect(initialReplays).toEqual({ analysis: 0, decision: 0 });
      await captureChatCheckpoint(page, info, "restored-replacement");
      const proofPath = info.outputPath("verified-retry-scalars.json");
      writeFileSync(proofPath, JSON.stringify({ verdict: "verified", caseId: decision.caseId, stoppedOperationId: body.operationId, retryOperationId: retryBody.operationId, replyMessageId: body.replyMessageId, userMessageId: userId, generationId: proofs[0].generationId, actualInitialModelCalls: 2, actualChatCalls: chatRequests, stableUserAndReply: true, partialExcludedFromRequest: true, exactStreamReplacement: true, priorCompletedHistoryPreserved: true, reloadWithoutReplay: true, stoppedGenerationPositiveCompletion: "not asserted" }));
      await info.attach("verified-retry-scalars", { path: proofPath, contentType: "application/json" });
    } finally {
      try { await retryObserver.dispose(); }
      finally {
        const outcome = await retryObserver.finished;
        if (outcome.kind !== "failed") outcome.capture.body.fill(0);
      }
    }
  } finally {
    try { await observer.dispose(); }
    finally {
      const outcome = await observer.finished;
      if (outcome.kind !== "failed") outcome.capture.body.fill(0);
    }
  }
});
