import { expect, test } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { formatFirstDecision } from "../../src/lib/contracts/first-message";
import { assessActualCase } from "./helpers/assessment-observations";
import { readCaseCheckpoint } from "./helpers/case-checkpoint";
import { captureChatCheckpoint, chatAssessmentNotice, chatLabels, sendActualChatTurn } from "./helpers/chat-actions";
import { localDate } from "./helpers/case-input";
import { verifyCapturedGenerations } from "./helpers/app-readiness";

test.use({ locale: "pl-PL", timezoneId: "Europe/Warsaw", actionTimeout: 10_000 });
test.setTimeout(1_500_000);

test("normal chat exposes an accessible text composer after a genuine verified initial assessment", async ({ page }, info) => {
  let browserFailures = 0;
  page.on("pageerror", () => browserFailures++);
  page.on("console", message => { if (message.type() === "error" || message.type() === "warning") browserFailures++; });
  // The helper completes native preparation and verifies both actual provider generations
  // before the chat assertion. An unhealthy initial assessment cannot count as chat RED.
  const { decision } = await assessActualCase(page, info, "example-phone");
  const saved = await readCaseCheckpoint(page, decision.caseId);
  expect(saved.submittedForm !== null && saved.imageAnalysis !== null && saved.initialDecision?.decisionId === decision.decisionId, "chat must start from the entire actual immutable case").toBe(true);
  expect(saved.messages.length === 1 && saved.messages[0].role === "assistant" && saved.messages[0].parts.map(part => part.text).join("") === formatFirstDecision(decision), "chat must retain the entire genuine first assistant assessment").toBe(true);
  const counts = { analysis: 0, decision: 0, chat: 0 };
  page.on("request", request => {
    if (request.method() !== "POST") return;
    const path = new URL(request.url()).pathname;
    if (path === "/api/analysis") counts.analysis++;
    if (path === "/api/decisions") counts.decision++;
    if (path === "/api/chat") counts.chat++;
  });
  await page.reload();
  await expect(page).toHaveURL(new URL(`/chat/${decision.caseId}`, page.url()).href);
  await expect.poll(async () => JSON.stringify(await readCaseCheckpoint(page, decision.caseId)) === JSON.stringify(saved), "hydration preserves actual case and full first message").toBe(true);
  const checkpoint = info.outputPath("normal-chat-checkpoint-scalars.json");
  writeFileSync(checkpoint, JSON.stringify({ caseId: decision.caseId, initialGenerationsVerified: true, initialMessages: saved.messages.length, fullCasePreserved: true, postHydrationRequests: counts }));
  await info.attach("normal-chat-checkpoint-scalars", { path: checkpoint, contentType: "application/json" });
  await captureChatCheckpoint(page, info, "normal-chat-ready");
  expect(counts, "hydration must never replay a completed assessment or chat turn").toEqual({ analysis: 0, decision: 0, chat: 0 });
  // This exact first assertion already established healthy pre-F07 behavioral RED.
  await expect(page.getByRole("textbox", { name: chatLabels.message, exact: true }), "a genuinely assessed case must let the employee write a text-only follow-up").toBeVisible();
  const composer = page.getByRole("textbox", { name: chatLabels.message, exact: true });
  const form = composer.locator("xpath=ancestor::form");
  await expect(form).toHaveCount(1);
  await expect(form.locator('input[type="file"]')).toHaveCount(0);
  expect((await form.getByRole("button").allTextContents()).some(text => /załącz|zdjęci|obraz|model|wyszuk|zatwierdź|zwróć środki/i.test(text)), "composer exposes no attachment, model, search or approval actions").toBe(false);
  await composer.focus(); await page.keyboard.press("Enter");
  expect(JSON.stringify((await readCaseCheckpoint(page, decision.caseId)).messages) === JSON.stringify(saved.messages), "empty input must not append a user message").toBe(true);
  expect(counts.chat).toBe(0);
  const blankFeedback = page.getByText("Wpisz wiadomość.", { exact: true });
  if (await blankFeedback.count()) await expect(blankFeedback).toBeVisible();
  await composer.fill("   \n\t");
  await composer.focus(); await page.keyboard.press("Enter");
  if (await blankFeedback.count()) await expect(blankFeedback).toBeVisible();
  expect(JSON.stringify((await readCaseCheckpoint(page, decision.caseId)).messages) === JSON.stringify(saved.messages), "whitespace must not append a user message").toBe(true);
  expect(counts.chat).toBe(0);
  const today = await localDate(page);
  const notification = await localDate(page, -7);
  const earlierClaim = await localDate(page, -12);
  const turns = [
    `Nowa informacja pracownika: sprzedający został powiadomiony o zgłoszeniu ${notification}. W teście wykonanym dziś, ${today}, telefon się uruchomił. To moje zgłoszenie wyniku testu, nie fakt potwierdzony przez zdjęcie. Wyjaśnij, jak te informacje zmieniają wcześniejszą wstępną ocenę i co nadal wymaga sprawdzenia.`,
    `Doprecyzowanie chronologii: wcześniejsza informacja klienta, że telefon nie uruchamia się, dotyczyła ${earlierClaim}. Mój dzisiejszy test z ${today} wykazał uruchomienie. Zachowaj oba wcześniejsze zdarzenia i datę powiadomienia z poprzedniej wiadomości; rozdziel zgłoszenia pracownika od ustaleń zdjęcia.`,
    "Jaka będzie jutro pogoda w Krakowie?",
    "Chcę teraz zmienić tę reklamację na zwykły zwrot po zakupie przez internet. Czy możemy w tej samej sprawie ocenić odstąpienie od umowy?",
  ];
  const successfulOperations = [];
  for (const [index, question] of turns.entries()) {
    const result = await sendActualChatTurn(page, decision.caseId, question);
    if (index === 0) {
      expect(/(?:now|dodatkow|uzupełni|zmien|aktual|wpływ)/iu.test(result.text) && /(?:uruch|włącz|działa|sprawn)/iu.test(result.text), "reply must explain the effect of newly reported technical information").toBe(true);
      expect(/pracownik|zgłosz|informacj|deklaracj/iu.test(result.text) && /zdjęci|fotograf/iu.test(result.text), "employee statements must be distinguished from image evidence").toBe(true);
    }
    if (index === 1) {
      const dateMentioned = (iso: string) => {
        const day = Number(iso.slice(-2));
        return result.text.includes(iso) || new RegExp(`(?:^|\\D)${day}(?:[.\\/]${iso.slice(5, 7)}|\\s+\\p{L}{3,})`, "u").test(result.text);
      };
      expect(dateMentioned(earlierClaim) && dateMentioned(today) && dateMentioned(notification), "follow-up must preserve earlier claim, later employee test and earlier notification chronology").toBe(true);
    }
    if (index === 2) {
      expect(/reklamac|spraw|sprzęt|telefon/iu.test(result.text) && /pogod|temat|zakres|pomóc/iu.test(result.text) && result.text.length < 1600, "off-topic answer must briefly redirect to the active case").toBe(true);
    }
    if (index === 3) {
      expect(/(?:now(?:a|ą|ej|e)|odrębn(?:a|ą|ej)|osobn(?:a|ą|ej))\s+spraw/iu.test(result.text), "scenario change must direct the employee to a new case").toBe(true);
      expect(result.completed.submittedForm?.scenario === saved.submittedForm?.scenario && JSON.stringify(result.completed.initialDecision?.policy) === JSON.stringify(saved.initialDecision?.policy), "scenario request must not mix or mutate the current pinned complaint").toBe(true);
    }
    successfulOperations.push({ caseId: decision.caseId, operationId: result.body.operationId, replyMessageId: result.body.replyMessageId, stage: "chat" as const, modelId: "openai/gpt-6-luna", messageCount: result.completed.messages.length });
    await expect(page.getByRole("article", { name: "Wiadomość asystenta", exact: true })).toHaveCount(index + 1);
    await expect(page.getByText(chatAssessmentNotice, { exact: true })).toHaveCount(index + 1);
    await captureChatCheckpoint(page, info, `normal-chat-turn-${index + 1}`);
    expect(counts.chat, "each employee activation must create exactly one request").toBe(index + 1);
  }
  const metadataWaitDeadlineMs = performance.now() + 420_000;
  const proofs = await Promise.all(successfulOperations.map(operation => verifyCapturedGenerations(operation, { metadataWaitDeadlineMs, attemptReportPath: info.outputPath(`chat-${operation.operationId}-proof.json`) })));
  expect(proofs.every(records => records.length === 1) && new Set(proofs.flat().map(record => record.generationId)).size === 4).toBe(true);
  const proofPath = info.outputPath("verified-normal-chat-scalars.json");
  writeFileSync(proofPath, JSON.stringify({ verdict: "verified", caseId: decision.caseId, actualInitialModelCalls: 2, actualChatCalls: 4, operations: successfulOperations, generationIds: proofs.flat().map(record => record.generationId), fullContextAndChronologicalHistory: true }));
  await info.attach("verified-normal-chat-scalars", { path: proofPath, contentType: "application/json" });
  const completed = await readCaseCheckpoint(page, decision.caseId);
  await page.reload();
  await expect(composer).toBeVisible();
  await expect(page.getByText(chatAssessmentNotice, { exact: true })).toHaveCount(4);
  expect(JSON.stringify((await readCaseCheckpoint(page, decision.caseId)).messages) === JSON.stringify(completed.messages), "refresh must restore the actual full completed conversation").toBe(true);
  expect(counts).toEqual({ analysis: 0, decision: 0, chat: 4 });
  expect(browserFailures, "normal conversation must not raise browser errors or warnings").toBe(0);
});
