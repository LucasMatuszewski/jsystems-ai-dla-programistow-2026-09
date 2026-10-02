import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { assessActualCase, assessmentLabels } from "./helpers/assessment-observations";
import { readCaseCheckpoint, readCaseRegistry } from "./helpers/case-checkpoint";
import { fillCase, imageLabels, labels } from "./helpers/case-input";

test.use({ locale: "pl-PL", timezoneId: "Europe/Warsaw", actionTimeout: 10_000 });
test.setTimeout(700_000);

async function captureWidths(page: Page, info: TestInfo, state: string) {
  for (const width of [1440, 360]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), "continuity screens must fit the viewport").toBe(false);
    if (state === "new-case-confirmation") {
      const dialog = page.getByRole("dialog", { name: "Rozpocząć nową sprawę?", exact: true });
      expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth), "confirmation text and footer must fit their own dialog").toBe(true);
      const bounds = await dialog.boundingBox();
      expect(bounds !== null).toBe(true);
      for (const name of ["Anuluj", "Rozpocznij nową sprawę"]) {
        const button = await dialog.getByRole("button", { name, exact: true }).boundingBox();
        expect(Boolean(bounds && button && button.x >= bounds.x - 1 && button.x + button.width <= bounds.x + bounds.width + 1), "confirmation actions must remain inside the dialog at both widths").toBe(true);
      }
    }
    const path = info.outputPath(`${state}-${width}.png`);
    await page.screenshot({ path, fullPage: true });
    await info.attach(`${state}-${width}`, { path, contentType: "image/png" });
  }
}

test("genuine completed case survives confirmed new draft and exact UUID restoration without more AI", async ({ page }, info) => {
  // Exactly two actual provider calls: native analysis and initial decision. No fabricated case/history.
  const { decision } = await assessActualCase(page, info, "example-phone");
  const idA = decision.caseId;
  const urlA = new URL(`/chat/${idA}`, page.url()).href;
  await expect(page).toHaveURL(urlA);
  const savedA = await readCaseCheckpoint(page, idA);
  const protectedA = JSON.stringify(savedA);
  const firstText = savedA.messages[0].parts.map(part => part.text).join("");
  const counts = { analysis: 0, decisions: 0, chat: 0 };
  let pageErrors = 0;
  page.on("pageerror", () => pageErrors++);
  page.on("request", request => {
    if (request.method() !== "POST") return;
    const path = new URL(request.url()).pathname;
    if (path === "/api/analysis") counts.analysis++;
    if (path === "/api/decisions") counts.decisions++;
    if (path === "/api/chat") counts.chat++;
  });
  const card = page.getByRole("article", { name: assessmentLabels.card, exact: true });

  await page.reload();
  await expect(page).toHaveURL(urlA);
  await expect(card).toBeVisible();
  expect(JSON.stringify(await readCaseCheckpoint(page, idA)) === protectedA, "refresh preserves the entire actual saved case").toBe(true);
  await captureWidths(page, info, "restored-completed-case");

  const newCase = page.getByRole("button", { name: "Nowa sprawa", exact: true });
  await newCase.focus(); await expect(newCase).toBeFocused();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Rozpocząć nową sprawę?", exact: true });
  await expect(dialog).toBeVisible();
  await captureWidths(page, info, "new-case-confirmation");
  const cancel = dialog.getByRole("button", { name: "Anuluj", exact: true });
  await cancel.focus(); await page.keyboard.press("Enter");
  await expect(dialog).toHaveCount(0);
  await expect(page).toHaveURL(urlA);
  expect(JSON.stringify(await readCaseCheckpoint(page, idA)) === protectedA, "cancel cannot change the genuine completed case").toBe(true);

  await newCase.click();
  await expect(dialog).toBeVisible();
  const confirm = dialog.getByRole("button", { name: "Rozpocznij nową sprawę", exact: true });
  await confirm.focus(); await page.keyboard.press("Enter");
  await expect(page).toHaveURL(new URL("/", urlA).href);
  await expect(page.getByLabel(labels.name, { exact: true })).toHaveValue("");
  await expect(page.getByRole("radio", { name: "Reklamacja", exact: true })).not.toBeChecked();
  await expect(page.getByRole("radio", { name: "Zwrot", exact: true })).not.toBeChecked();
  await expect(page.getByAltText(imageLabels.preview, { exact: true })).toHaveCount(0);
  const registryB = await readCaseRegistry(page);
  const idB = registryB.activeCaseId;
  expect(idB).not.toBe(idA);
  expect(Object.keys(registryB.cases).sort()).toEqual([idA, idB].sort());
  const emptyB = registryB.cases[idB];
  expect(emptyB.messages.length === 0 && emptyB.preparedImage === null && emptyB.submittedForm === null && emptyB.imageAnalysis === null && emptyB.initialDecision === null && emptyB.pendingOperation === null).toBe(true);
  expect(JSON.stringify(registryB.cases[idA]) === protectedA, "new case preserves every saved field of the earlier case").toBe(true);
  await captureWidths(page, info, "new-empty-form");

  await fillCase(page);
  await page.getByLabel(labels.name, { exact: true }).fill("Druga sprawa demonstracyjna");
  await expect.poll(async () => (await readCaseCheckpoint(page, idB)).draftForm.equipmentName === "Druga sprawa demonstracyjna").toBe(true);
  await page.reload();
  await expect(page.getByLabel(labels.name, { exact: true })).toHaveValue("Druga sprawa demonstracyjna");
  await captureWidths(page, info, "restored-second-draft");
  await page.goto(`/chat/${idB}`);
  await expect(page).toHaveURL(new URL(`/chat/${idB}`, urlA).href);
  await expect(page.getByRole("heading", { name: "Brak ukończonej oceny sprawy", exact: true })).toBeVisible();
  await expect(card).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Wróć do formularza", exact: true })).toBeVisible();
  await captureWidths(page, info, "incomplete-second-case");

  await page.goto(urlA);
  await expect(card).toBeVisible();
  await expect(page).toHaveURL(urlA);
  expect((await readCaseCheckpoint(page, idA)).messages[0].parts.map(part => part.text).join("") === firstText, "UUID path restores the original real first message").toBe(true);
  expect(JSON.stringify(await readCaseCheckpoint(page, idA)) === protectedA).toBe(true);
  expect((await readCaseRegistry(page)).activeCaseId).toBe(idB);
  await page.goto("/chat");
  await expect(page).toHaveURL(new URL("/chat", urlA).href);
  await expect(page.getByRole("heading", { name: "Brak ukończonej oceny sprawy", exact: true })).toBeVisible();
  await expect(card).toHaveCount(0);
  expect((await readCaseRegistry(page)).activeCaseId).toBe(idB);

  for (const [path, heading, state] of [
    [`/chat/${randomUUID()}`, "Nie znaleziono zapisanej sprawy", "unknown-case"],
    ["/chat/niepoprawny-identyfikator", "Nieprawidłowy adres sprawy", "invalid-case"],
  ]) {
    const before = JSON.stringify(await readCaseRegistry(page));
    await page.goto(path);
    await expect(page).toHaveURL(new URL(path, urlA).href);
    await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
    await expect(card).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Wróć do formularza", exact: true })).toBeVisible();
    expect(JSON.stringify(await readCaseRegistry(page)) === before, "bad UUID navigation must neither reveal nor mutate another saved case").toBe(true);
    await captureWidths(page, info, state);
  }
  await page.goto(urlA);
  await expect(card).toBeVisible();
  await page.reload();
  await expect(page).toHaveURL(urlA);
  expect(JSON.stringify(await readCaseCheckpoint(page, idA)) === protectedA).toBe(true);
  expect((await readCaseCheckpoint(page, idB)).draftForm.equipmentName === "Druga sprawa demonstracyjna").toBe(true);
  expect(counts, "all continuity actions must cause zero further real AI requests").toEqual({ analysis: 0, decisions: 0, chat: 0 });
  expect(pageErrors, "continuity flow must not raise unhandled browser errors").toBe(0);
  await captureWidths(page, info, "completed-case-preserved");
});
