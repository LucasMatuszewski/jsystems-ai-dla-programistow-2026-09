import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { preparedImageSchema } from "../../src/lib/contracts/image";
import { ACTIVE_CASE_STORAGE_KEY } from "../../src/lib/contracts/session";
import { parseCaseCheckpoint } from "./helpers/case-checkpoint";
import { choose, fillCase, imageFixture, imageLabels, imagePicker, labels } from "./helpers/case-input";

const manifest = JSON.parse(readFileSync("tests/fixtures/example-images-provenance.json", "utf8")) as { files: { originalName: string; sha256: string }[] };
test.use({ locale: "pl-PL", timezoneId: "Europe/Warsaw", actionTimeout: 10_000 });
test.setTimeout(45_000);

for (const fixture of manifest.files) {
  test(`unchanged ${fixture.originalName} is prepared by the real native image flow`, async ({ page }, info) => {
    let consoleFailures = 0;
    page.on("console", message => { if (["error", "warning"].includes(message.type())) consoleFailures++; });
    page.on("pageerror", () => consoleFailures++);
    const requests: string[] = [];
    page.on("request", request => { const path = new URL(request.url()).pathname; if (path.startsWith("/api/")) requests.push(path); });
    expect((await page.goto("/"))?.status()).toBe(200);
    await fillCase(page);
    const laptop = fixture.originalName.startsWith("laptop-");
    await choose(page, labels.category, laptop ? "Komputery" : "Smartfony i tablety");
    await page.getByLabel(labels.name, { exact: true }).fill(laptop ? "Laptop demonstracyjny" : "Telefon demonstracyjny");
    const source = imageFixture(`example-images/${fixture.originalName}`);
    expect(createHash("sha256").update(readFileSync(source)).digest("hex")).toBe(fixture.sha256);
    const input = page.getByLabel(imageLabels.input, { exact: true });
    await input.focus();
    await expect(input).toBeFocused();
    const responsePromise = page.waitForResponse(response => response.url().endsWith("/api/images/prepare") && response.request().method() === "POST");
    const chooserPromise = page.waitForEvent("filechooser");
    await input.click();
    await (await chooserPromise).setFiles(source);
    const response = await responsePromise;
    expect(response.status()).toBe(200);
    expect(response.headers()["cache-control"]).toBe("no-store");
    const parsed = preparedImageSchema.safeParse(await response.json());
    expect(parsed.success, "actual normalized response must satisfy the contract without payload diagnostics").toBe(true);
    if (!parsed.success) throw new Error("Invalid actual prepared image contract");
    const image = parsed.data;
    const bytes = Buffer.from(image.imageDataUrl.split(",")[1], "base64");
    expect(bytes.length).toBe(image.byteLength);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(image.sha256);
    const metadata = await sharp(bytes, { failOn: "warning" }).metadata();
    expect({ format: metadata.format, width: metadata.width, height: metadata.height }).toEqual({ format: "jpeg", width: image.width, height: image.height });
    expect(Boolean(metadata.exif || metadata.xmp || metadata.iptc || metadata.icc || metadata.orientation)).toBe(false);
    expect((await sharp(bytes, { failOn: "warning" }).raw().toBuffer()).length).toBeGreaterThan(0);
    const thumbnail = Buffer.from(image.thumbnailDataUrl.split(",")[1], "base64");
    const thumb = await sharp(thumbnail, { failOn: "warning" }).metadata();
    expect(thumb.format).toBe("jpeg");
    expect(Math.max(thumb.width ?? 0, thumb.height ?? 0)).toBeLessThanOrEqual(512);
    expect((await sharp(thumbnail, { failOn: "warning" }).raw().toBuffer()).length).toBeGreaterThan(0);
    await expect(imagePicker(page).getByRole("status")).toHaveText(imageLabels.ready);
    const preview = page.getByAltText(imageLabels.preview, { exact: true });
    await expect(preview).toBeVisible();
    expect(await preview.getAttribute("src") === image.thumbnailDataUrl).toBe(true);
    await expect.poll(async () => {
      const raw = await page.evaluate(key => localStorage.getItem(key), ACTIVE_CASE_STORAGE_KEY);
      const saved = parseCaseCheckpoint(raw);
      return saved.success && saved.data.preparedImage?.sha256 === image.sha256 && saved.data.preparedImage.imageDataUrl === image.imageDataUrl && saved.data.preparedImage.thumbnailDataUrl === image.thumbnailDataUrl && saved.data.screen === "form" && saved.data.imageAnalysis === null && saved.data.initialDecision === null && saved.data.messages.length === 0 && !JSON.stringify(saved.data).includes(readFileSync(source).toString("base64"));
    }).toBe(true);
    for (const width of [1440, 360]) {
      await page.setViewportSize({ width, height: 1000 });
      await expect(preview).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
      const path = info.outputPath(`prepared-${width}.png`);
      await page.screenshot({ path, fullPage: true });
      await info.attach(`prepared-${width}`, { path, contentType: "image/png" });
    }
    expect(requests).toEqual(["/api/images/prepare"]);
    expect(consoleFailures).toBe(0);
    // No Dalej activation: this suite prepares images and never invokes analysis or a model.
  });
}
