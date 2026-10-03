import { test, expect } from "@playwright/test";
import { FORM_OPTIONS } from "../../src/lib/contracts/form";
import { choose, expectAssociatedError, expectLocalSuccess, expectOptions, fillCase, labels, localDate, preparePhoto, submit } from "./helpers/case-input";

test.use({ locale: "pl-PL", timezoneId: "Europe/Warsaw", actionTimeout: 10_000 });
test.setTimeout(30_000);

test.beforeEach(async ({ page }) => {
  const response = await page.goto("/");
  expect(response?.status(), "actual application must be healthy before form assertions").toBe(200);
  await expect(page.getByRole("radio", { name: "Reklamacja", exact: true })).toBeVisible();
});

test("exactly two unselected Polish scenarios block and focus the first invalid field", async ({ page }) => {
  const complaint = page.getByRole("radio", { name: "Reklamacja", exact: true });
  await expect(page.getByRole("group", { name: labels.scenario, exact: true })).toBeVisible();
  await expect(page.getByRole("radio")).toHaveCount(2);
  await expect(complaint).not.toBeChecked();
  await expect(page.getByRole("radio", { name: "Zwrot", exact: true })).not.toBeChecked();
  await submit(page);
  await expect(complaint).toBeFocused();
  await expectAssociatedError(complaint, "Wybierz rodzaj sprawy.");
  await expect(page.getByText("Dane formularza są poprawne.", { exact: true })).toHaveCount(0);
});

test("category, buyer, seller and complaint remedy expose canonical Polish choices", async ({ page }) => {
  await page.getByRole("radio", { name: "Reklamacja", exact: true }).check();
  for (const [label, options] of [[labels.category, FORM_OPTIONS.category], [labels.buyer, FORM_OPTIONS.buyerStatus], [labels.seller, FORM_OPTIONS.sellerStatus], [labels.remedy, FORM_OPTIONS.requestedRemedy]] as const) {
    await expectOptions(page, label, options.map((option) => option.label));
  }
  await expect(page.getByLabel(labels.purchase, { exact: true })).toHaveAttribute("type", "date");
  await expect(page.getByLabel(labels.delivery, { exact: true })).toHaveAttribute("type", "date");
});

test("missing category and whitespace equipment name retain valid draft and focus errors", async ({ page }) => {
  await page.getByRole("radio", { name: "Reklamacja", exact: true }).check();
  await page.getByLabel(labels.name, { exact: true }).fill("Telefon demonstracyjny");
  await submit(page);
  const category = page.getByRole("combobox", { name: labels.category, exact: true });
  await expect(category).toBeFocused();
  await expectAssociatedError(category, "Wybierz kategorię sprzętu.");
  await expect(page.getByLabel(labels.name, { exact: true })).toHaveValue("Telefon demonstracyjny");
  await fillCase(page);
  const name = page.getByLabel(labels.name, { exact: true });
  await name.fill("   ");
  await submit(page);
  await expect(name).toBeFocused();
  await expectAssociatedError(name, "Podaj nazwę sprzętu.");
  await expect(page.getByLabel(labels.reason, { exact: true })).toHaveValue("Urządzenie nie włącza się.");
  await name.fill("Telefon demonstracyjny");
  await preparePhoto(page);
  await submit(page);
  await expectLocalSuccess(page);
});

test("purchase date is required and tomorrow in employee local calendar is rejected", async ({ page }) => {
  await fillCase(page);
  const purchase = page.getByLabel(labels.purchase, { exact: true });
  await purchase.fill("");
  await submit(page);
  await expect(purchase).toBeFocused();
  await expectAssociatedError(purchase, "Podaj poprawną datę zakupu.");
  await purchase.fill(await localDate(page, 1));
  await submit(page);
  await expectAssociatedError(purchase, "Data zakupu nie może być późniejsza niż dzisiaj.");
  await expect(page.getByLabel(labels.name, { exact: true })).toHaveValue("Telefon demonstracyjny");
});

test("delivery requires a date or explicit unknown and checks both calendar bounds", async ({ page }) => {
  await fillCase(page);
  const unknown = page.getByRole("checkbox", { name: labels.unknownDelivery, exact: true });
  const delivery = page.getByLabel(labels.delivery, { exact: true });
  await unknown.uncheck();
  await delivery.fill("");
  await submit(page);
  await expect(delivery).toBeFocused();
  await expectAssociatedError(delivery, "Podaj poprawną datę dostarczenia lub wybierz Nie wiem.");
  await delivery.fill(await localDate(page, -11));
  await submit(page);
  await expectAssociatedError(delivery, "Data dostarczenia nie może być wcześniejsza niż data zakupu.");
  await delivery.fill(await localDate(page, 1));
  await submit(page);
  await expectAssociatedError(delivery, "Data dostarczenia nie może być późniejsza niż dzisiaj.");
  await delivery.fill(await localDate(page, -10));
  await preparePhoto(page);
  await submit(page);
  await expectLocalSuccess(page);
  await unknown.check();
  await preparePhoto(page);
  await submit(page);
  await expectLocalSuccess(page);
});

test("complaint whitespace reason and missing remedy fail with associated Polish errors", async ({ page }) => {
  await fillCase(page);
  const reason = page.getByLabel(labels.reason, { exact: true });
  await reason.fill(" \n ");
  await submit(page);
  await expect(reason).toBeFocused();
  await expectAssociatedError(reason, "Podaj przyczynę reklamacji.");
  await page.reload();
  await page.getByRole("radio", { name: "Reklamacja", exact: true }).check();
  await choose(page, labels.category, FORM_OPTIONS.category[0].label);
  await page.getByLabel(labels.name, { exact: true }).fill("Telefon demonstracyjny");
  await page.getByLabel(labels.purchase, { exact: true }).fill(await localDate(page, -10));
  await page.getByRole("checkbox", { name: labels.unknownDelivery, exact: true }).check();
  await choose(page, labels.buyer, FORM_OPTIONS.buyerStatus[0].label);
  await choose(page, labels.seller, FORM_OPTIONS.sellerStatus[0].label);
  await reason.fill("Urządzenie nie włącza się.");
  // Reload restores the valid draft; explicitly choose the empty native placeholder.
  await page.getByRole("combobox", { name: labels.remedy, exact: true }).selectOption("");
  await submit(page);
  const remedy = page.getByRole("combobox", { name: labels.remedy, exact: true });
  await expect(remedy).toBeFocused();
  await expectAssociatedError(remedy, "Wybierz oczekiwane rozwiązanie lub Nie wiem.");
  await choose(page, labels.remedy, "Nie wiem");
  await preparePhoto(page);
  await submit(page);
  await expectLocalSuccess(page);
});

test("return accepts empty reason and complaint to return preserves unrelated draft", async ({ page }) => {
  await fillCase(page);
  await page.getByRole("radio", { name: "Zwrot", exact: true }).check();
  await page.getByLabel(labels.reason, { exact: true }).fill("");
  await expect(page.getByRole("combobox", { name: labels.remedy, exact: true })).toHaveCount(0);
  await expect(page.getByLabel(labels.name, { exact: true })).toHaveValue("Telefon demonstracyjny");
  await expect(page.getByLabel(labels.purchase, { exact: true })).toHaveValue(await localDate(page, -10));
  await preparePhoto(page);
  await submit(page);
  await expectLocalSuccess(page);
  await expect(page).toHaveURL(/\/$/);
});

test("keyboard can correct the focused name error without resetting input", async ({ page }) => {
  await fillCase(page, "return");
  const name = page.getByLabel(labels.name, { exact: true });
  await name.fill(" ");
  await submit(page);
  await expect(name).toBeFocused();
  await page.keyboard.type("Telefon demonstracyjny");
  await page.keyboard.press("Tab");
  await expect(page.getByLabel(labels.purchase, { exact: true })).toBeFocused();
  await expect(page.getByLabel(labels.purchase, { exact: true })).toHaveValue(await localDate(page, -10));
  await preparePhoto(page);
  await submit(page);
  await expectLocalSuccess(page);
});
