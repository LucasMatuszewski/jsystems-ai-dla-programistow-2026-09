import { expect, type Locator, type Page } from "@playwright/test";
import { FORM_OPTIONS, type CaseForm } from "../../../src/lib/contracts/form";

export const labels = {
  scenario: "Rodzaj sprawy", category: "Kategoria sprzętu", name: "Nazwa sprzętu",
  purchase: "Data zakupu", delivery: "Data dostarczenia", unknownDelivery: "Nie znam daty dostarczenia",
  buyer: "Status kupującego", seller: "Status sprzedawcy", reason: "Przyczyna zgłoszenia",
  remedy: "Oczekiwane rozwiązanie", submit: "Dalej",
} as const;

export async function choose(page: Page, label: string, option: string): Promise<void> {
  const control = page.getByRole("combobox", { name: label, exact: true });
  if (await control.evaluate((element) => element.tagName === "SELECT")) {
    await control.selectOption({ label: option });
  } else {
    await control.click();
    await page.getByRole("option", { name: option, exact: true }).click();
  }
}

export async function expectOptions(page: Page, label: string, expected: readonly string[]): Promise<void> {
  const control = page.getByRole("combobox", { name: label, exact: true });
  const native = await control.evaluate((element) => element.tagName === "SELECT");
  if (!native) await control.click();
  const options = native ? control.locator("option") : page.getByRole("option");
  const actual = (await options.allTextContents()).map((value) => value.trim());
  expect(actual.filter((value) => expected.includes(value))).toEqual(expected);
  // A placeholder is permitted; additional domain choices are not.
  expect(actual.filter((value) => value && !expected.includes(value)).length).toBeLessThanOrEqual(native ? 1 : 0);
  if (!native) await page.keyboard.press("Escape");
}

export async function localDate(page: Page, offset = 0): Promise<string> {
  return page.evaluate((days) => {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }, offset);
}

export async function fillCase(page: Page, scenario: CaseForm["scenario"] = "complaint"): Promise<void> {
  await page.getByRole("radio", { name: scenario === "complaint" ? "Reklamacja" : "Zwrot", exact: true }).check();
  await choose(page, labels.category, FORM_OPTIONS.category[0].label);
  await page.getByLabel(labels.name, { exact: true }).fill("Telefon demonstracyjny");
  await page.getByLabel(labels.purchase, { exact: true }).fill(await localDate(page, -10));
  await page.getByRole("checkbox", { name: labels.unknownDelivery, exact: true }).check();
  await choose(page, labels.buyer, FORM_OPTIONS.buyerStatus[0].label);
  await choose(page, labels.seller, FORM_OPTIONS.sellerStatus[0].label);
  if (scenario === "complaint") {
    await page.getByLabel(labels.reason, { exact: true }).fill("Urządzenie nie włącza się.");
    await choose(page, labels.remedy, FORM_OPTIONS.requestedRemedy[0].label);
  }
}

export async function expectAssociatedError(control: Locator, message: string): Promise<void> {
  await expect(control.page().getByText(message, { exact: true })).toBeVisible();
  await expect(control).toHaveAttribute("aria-invalid", "true");
  await expect(control).toHaveAccessibleDescription(new RegExp(message.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
}

export async function submit(page: Page): Promise<void> {
  await page.getByRole("button", { name: labels.submit, exact: true }).click();
}

export async function expectLocalSuccess(page: Page): Promise<void> {
  await expect(page.getByRole("status")).toContainText("Dane formularza są poprawne.");
}
