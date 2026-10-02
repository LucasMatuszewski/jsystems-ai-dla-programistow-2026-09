import { test, expect, type Locator, type Page, type TestInfo } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { assessActualCase } from "./helpers/assessment-observations";
import { observeTextContrast } from "./helpers/text-contrast";

test.use({ locale: "pl-PL", timezoneId: "Europe/Warsaw", actionTimeout: 10_000 });
test.setTimeout(600_000);

async function keyboardFocus(page: Page, target: Locator) {
  await page.mouse.move(0, 0);
  for (let count = 0; count < 80; count++) {
    await page.keyboard.press("Tab");
    if (await target.evaluate(element => element === document.activeElement)) return;
  }
  throw new Error("Keyboard focus did not reach contrast target");
}
async function verifyStates(page: Page, info: TestInfo, target: Locator, identity: string) {
  const observations = [];
  for (const state of ["normal", "hover", "keyboard-focus"] as const) {
    if (state === "normal") await page.mouse.move(0, 0);
    if (state === "hover") await target.hover();
    if (state === "keyboard-focus") await keyboardFocus(page, target);
    // Await real style transitions; no clocks, styles, network or storage are replaced.
    await page.waitForTimeout(250);
    const sample = await observeTextContrast(target);
    observations.push({ state, ...sample, applicationMinimum: 4.5 });
    const screenshot = info.outputPath(`${identity}-${state}.png`);
    await page.screenshot({ path: screenshot, fullPage: true });
    await info.attach(`${identity}-${state}`, { path: screenshot, contentType: "image/png" });
    expect.soft(sample.ratio, "Application text contrast minimum 4.5").toBeGreaterThanOrEqual(4.5);
  }
  const scalars = info.outputPath(`${identity}-contrast-scalars.json`);
  writeFileSync(scalars, JSON.stringify(observations));
  await info.attach(`${identity}-contrast-scalars`, { path: scalars, contentType: "application/json" });
}

test("enabled primary action satisfies text contrast in normal hover and keyboard focus", async ({ page }, info) => {
  const apiRequests: string[] = [];
  let browserFailures = 0;
  page.on("request", request => { const path = new URL(request.url()).pathname; if (path.startsWith("/api/")) apiRequests.push(path); });
  page.on("console", message => { if (["warning", "error"].includes(message.type())) browserFailures++; });
  page.on("pageerror", () => browserFailures++);
  expect((await page.goto("/"))?.status()).toBe(200);
  const button = page.getByRole("button", { name: "Dalej", exact: true });
  await expect(button).toBeEnabled();
  await verifyStates(page, info, button, "primary-action");
  expect(apiRequests.length).toBe(0);
  expect(browserFailures).toBe(0);
});

test("actual initial policy reference links satisfy text contrast in all interaction states", async ({ page }, info) => {
  await assessActualCase(page, info, "example-phone");
  const links = page.getByRole("article", { name: "Wstępna ocena początkowa", exact: true }).getByRole("link");
  expect(await links.count()).toBeGreaterThan(0);
  for (let index = 0; index < await links.count(); index++) await verifyStates(page, info, links.nth(index), `policy-link-${index}`);
});
