import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { ACTIVE_CASE_STORAGE_KEY } from "../../src/lib/contracts/session";
import { parseCaseCheckpoint } from "./helpers/case-checkpoint";
import { preparedImageSchema, type PreparedImage } from "../../src/lib/contracts/image";
import { expectAssociatedError, expectLocalSuccess, fillCase, imageFixture, imageLabels, imagePicker, labels, preparePhoto, submit } from "./helpers/case-input";

test.use({ locale: "pl-PL", timezoneId: "Europe/Warsaw", actionTimeout: 10_000 });
test.setTimeout(45_000);

test.beforeEach(async ({ page }) => {
  expect((await page.goto("/"))?.status(), "real application must be healthy").toBe(200);
  await expect(page.getByRole("radio", { name: "Reklamacja", exact: true })).toBeVisible();
});

function trackActualRequests(page: Page): string[] {
  const paths: string[] = [];
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (path.startsWith("/api/")) paths.push(path);
  });
  return paths;
}

async function storedSnapshot(page: Page) {
  const raw = await page.evaluate((key) => localStorage.getItem(key), ACTIVE_CASE_STORAGE_KEY);
  if (!raw) throw new Error("Prepared checkpoint is missing");
  const parsed = parseCaseCheckpoint(raw);
  // Do not expose the snapshot or image payload in assertion diagnostics.
  expect(parsed.success, "actual saved checkpoint must satisfy C03").toBe(true);
  if (!parsed.success) throw new Error("Invalid prepared checkpoint");
  return parsed.data;
}

async function expectPreparedCheckpoint(page: Page, image: PreparedImage) {
  await expect.poll(async () => {
    const raw = await page.evaluate((key) => localStorage.getItem(key), ACTIVE_CASE_STORAGE_KEY);
    if (!raw) return false;
    const parsed = parseCaseCheckpoint(raw);
    return parsed.success && parsed.data.preparedImage?.sha256 === image.sha256;
  }).toBe(true);
  const snapshot = await storedSnapshot(page);
  expect(snapshot.screen).toBe("form");
  expect(snapshot.imageAnalysis).toBeNull();
  expect(snapshot.initialDecision).toBeNull();
  expect(snapshot.messages).toHaveLength(0);
  expect(snapshot.preparedImage?.sha256).toBe(image.sha256);
  expect(snapshot.preparedImage?.imageDataUrl === image.imageDataUrl).toBe(true);
  expect(snapshot.preparedImage?.thumbnailDataUrl === image.thumbnailDataUrl).toBe(true);
  expect(snapshot.draftForm.equipmentName).toBe("Telefon demonstracyjny");
  // Strict C03 schema has no original File/data URL field. Verify exact source bytes are absent too.
  const source = readFileSync(imageFixture()).toString("base64");
  expect(JSON.stringify(snapshot).includes(source), "original photo bytes must not be persisted").toBe(false);
}

async function decodeActual(image: PreparedImage) {
  const bytes = Buffer.from(image.imageDataUrl.split(",")[1], "base64");
  expect(bytes.length).toBe(image.byteLength);
  expect(createHash("sha256").update(bytes).digest("hex")).toBe(image.sha256);
  const metadata = await sharp(bytes, { failOn: "warning" }).metadata();
  await sharp(bytes, { failOn: "warning" }).raw().toBuffer();
  expect({ format: metadata.format, width: metadata.width, height: metadata.height }).toEqual({ format: "jpeg", width: image.width, height: image.height });
  expect(Boolean(metadata.exif || metadata.xmp || metadata.iptc || metadata.icc || metadata.orientation)).toBe(false);
}

test("missing image is an associated keyboard-correctable error on an otherwise valid form", async ({ page }, testInfo) => {
  await fillCase(page);
  for (const width of [1440, 360]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.screenshot({ path: testInfo.outputPath(`healthy-form-${width}.png`), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  }
  const input = page.getByLabel(imageLabels.input, { exact: true });
  await expect(input, "F04 must expose an accessible native image chooser").toBeVisible();
  await expect(input).toHaveAttribute("type", "file");
  expect(await input.evaluate((element) => element.hasAttribute("multiple"))).toBe(false);
  await submit(page);
  await expectAssociatedError(input, imageLabels.missing);
  await expect(input).toBeFocused();
  await expect(page.getByText("Dane formularza są poprawne.", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel(labels.name, { exact: true })).toHaveValue("Telefon demonstracyjny");
});

test("native chooser uses real preparation and persists normalized JPEG only before local continue", async ({ page }) => {
  const requests = trackActualRequests(page);
  await fillCase(page);
  const responsePromise = page.waitForResponse((response) => response.url().endsWith("/api/images/prepare"));
  const chooserPromise = page.waitForEvent("filechooser");
  await page.getByLabel(imageLabels.input, { exact: true }).click();
  await (await chooserPromise).setFiles(imageFixture());
  const response = await responsePromise;
  expect(response.status()).toBe(200);
  expect(response.headers()["cache-control"]).toBe("no-store");
  const parsed = preparedImageSchema.safeParse(await response.json());
  expect(parsed.success, "actual response must be exact PreparedImage").toBe(true);
  if (!parsed.success) throw new Error("Invalid normalized image response");
  const image = parsed.data;
  await decodeActual(image);
  await expect(imagePicker(page).getByRole("status")).toHaveText(imageLabels.ready);
  const preview = page.getByAltText(imageLabels.preview, { exact: true });
  await expect(preview).toBeVisible();
  expect(await preview.getAttribute("src") === image.thumbnailDataUrl).toBe(true);
  await expectPreparedCheckpoint(page, image);
  await submit(page);
  await expectLocalSuccess(page);
  await expect(page).toHaveURL(/\/$/);
  expect(requests).toEqual(["/api/images/prepare"]);
});

test("PNG replaces one current image and preserves the unrelated form draft", async ({ page }) => {
  const requests = trackActualRequests(page);
  await fillCase(page);
  await preparePhoto(page);
  const original = (await storedSnapshot(page)).preparedImage?.sha256;
  const responsePromise = page.waitForResponse((response) => response.url().endsWith("/api/images/prepare"));
  await preparePhoto(page, "transparent.png");
  const parsed = preparedImageSchema.safeParse(await (await responsePromise).json());
  expect(parsed.success).toBe(true);
  if (!parsed.success) throw new Error("Invalid PNG preparation response");
  expect(parsed.data.sha256).not.toBe(original);
  await decodeActual(parsed.data);
  await expect(page.getByAltText(imageLabels.preview, { exact: true })).toHaveCount(1);
  expect(await page.getByAltText(imageLabels.preview, { exact: true }).getAttribute("src") === parsed.data.thumbnailDataUrl).toBe(true);
  await expectPreparedCheckpoint(page, parsed.data);
  await expect(page.getByLabel(labels.reason, { exact: true })).toHaveValue("Urządzenie nie włącza się.");
  expect(requests).toEqual(["/api/images/prepare", "/api/images/prepare"]);
});

test("keyboard removal clears saved prepared image but retains draft and blocks continue", async ({ page }) => {
  const requests = trackActualRequests(page);
  await fillCase(page);
  await preparePhoto(page);
  const remove = page.getByRole("button", { name: imageLabels.remove, exact: true });
  await remove.focus();
  await expect(remove).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByAltText(imageLabels.preview, { exact: true })).toHaveCount(0);
  await expect.poll(async () => (await storedSnapshot(page)).preparedImage === null).toBe(true);
  await expect(page.getByLabel(labels.name, { exact: true })).toHaveValue("Telefon demonstracyjny");
  await submit(page);
  await expectAssociatedError(page.getByLabel(imageLabels.input, { exact: true }), imageLabels.missing);
  await expect(page.getByText("Dane formularza są poprawne.", { exact: true })).toHaveCount(0);
  expect(requests).toEqual(["/api/images/prepare"]);
});

test("10000001-byte file is rejected locally without preparation or model requests", async ({ page }) => {
  const requests = trackActualRequests(page);
  await fillCase(page);
  await page.getByLabel(imageLabels.input, { exact: true }).setInputFiles(imageFixture("oversize.jpg"));
  await expectAssociatedError(page.getByLabel(imageLabels.input, { exact: true }), "Zdjęcie może mieć maksymalnie 10 MB. Wybierz mniejszy plik.");
  await expect(page.getByAltText(imageLabels.preview, { exact: true })).toHaveCount(0);
  await submit(page);
  await expect(page.getByText("Dane formularza są poprawne.", { exact: true })).toHaveCount(0);
  expect(requests).toEqual([]);
});

for (const [name, file, payload] of [["corrupt JPEG", "corrupt.bin", true], ["animated WebP", "animated.webp", false]] as const) {
  test(`${name} reaches real decoder, shows Polish failure and cannot continue`, async ({ page }) => {
    const requests = trackActualRequests(page);
    await fillCase(page);
    const responsePromise = page.waitForResponse((response) => response.url().endsWith("/api/images/prepare"));
    await page.getByLabel(imageLabels.input, { exact: true }).setInputFiles(payload ? {
      name: "uszkodzone.jpg", mimeType: "image/jpeg", buffer: readFileSync(imageFixture(file)),
    } : imageFixture(file));
    const response = await responsePromise;
    expect(response.status()).toBe(422);
    const error = await response.json() as { code: string; message: string };
    expect(error.code).toBe("INVALID_IMAGE");
    expect(error.message).toBe("Nie można odczytać obrazu. Wybierz inny plik.");
    await expectAssociatedError(page.getByLabel(imageLabels.input, { exact: true }), error.message);
    await expect(page.getByAltText(imageLabels.preview, { exact: true })).toHaveCount(0);
    await expect(imagePicker(page).getByText(imageLabels.ready, { exact: true })).toHaveCount(0);
    await expect(page.getByLabel(labels.reason, { exact: true })).toHaveValue("Urządzenie nie włącza się.");
    await submit(page);
    await expect(page.getByText("Dane formularza są poprawne.", { exact: true })).toHaveCount(0);
    expect(requests).toEqual(["/api/images/prepare"]);
  });
}
