import { test, expect } from "@playwright/test";
import { createServer } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import { existsSync, mkdtempSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import sharp from "sharp";
import { APP_ROOT, APP_ORIGIN, assertAppReadiness, readCapturedRuntimeEvidence } from "./app-readiness";
import { assertRealGenerations, parseRuntimeEvidence, sanitizeTrace } from "./runtime-evidence";

test("runner can open the actual application shell", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", () => errors.push("pageerror"));
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") errors.push(message.type());
  });
  const response = await page.goto("/");
  expect(response?.status()).toBe(200);
  await expect(page.locator("body")).toBeVisible();
  expect(errors).toEqual([]);
});

test("package exposes the one explicit E2E command", async () => {
  const manifest = JSON.parse(await readFile(`${APP_ROOT}/package.json`, "utf8")) as { scripts: Record<string, string> };
  expect(manifest.scripts["test:e2e"]).toBe("playwright test --config playwright.config.ts");
});

test("readiness accepts only the matching real app instance", async () => {
  await expect(assertAppReadiness(APP_ORIGIN, APP_ROOT)).resolves.toMatchObject({ ready: true });
});

test("AI evidence requires a captured fresh server rather than shell reuse", async ({ baseURL }, testInfo) => {
  expect(baseURL).toBe(APP_ORIGIN);
  const { instance } = await assertAppReadiness();
  const expectedOwned = testInfo.config.webServer?.reuseExistingServer === false;
  if (expectedOwned) expect(instance.captureOwnerPid).not.toBeNull();
  await testInfo.attach("actual-instance", { body: JSON.stringify({ ...instance, expectedOwned }), contentType: "application/json" });
  if (instance.captureOwnerPid) {
    expect(await readCapturedRuntimeEvidence()).toEqual([]); // Q01 has no AI journey.
  } else {
    await expect(readCapturedRuntimeEvidence()).rejects.toThrow(/captured server/i);
  }
});

test("readiness rejects a real unrelated listener even with identical shell text", async () => {
  const appResponse = await fetch(APP_ORIGIN);
  const actualShell = await appResponse.text();
  const server = createServer((_request, response) => {
    response.writeHead(200, { "Content-Type": "text/html" });
    response.end(actualShell);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Unrelated listener did not start");
  try {
    await expect(assertAppReadiness(`http://127.0.0.1:${address.port}`, APP_ROOT)).rejects.toThrow(/instance/i);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("successful AI evidence cannot be inferred from missing or invented IDs", () => {
  const identity = { caseId: "550e8400-e29b-41d4-a716-446655440000", operationId: "550e8400-e29b-41d4-a716-446655440001", stage: "analysis" as const, modelId: "openai/gpt-6-luna" };
  // Parser-only structural example from the official docs; never treated as a real provider result.
  const structural = { event: "generation.completed", provider: "openrouter", ...identity, generationId: "gen-1234567890", success: true };
  expect(parseRuntimeEvidence(JSON.stringify(structural))).toEqual(structural);
  expect(() => assertRealGenerations([], identity)).toThrow(/evidence/i);
  for (const generationId of [undefined, "", "fake", "gen-fake", "mock-generation", "gen-123-placeholder"]) {
    expect(() => parseRuntimeEvidence(JSON.stringify({ ...structural, generationId }))).toThrow(/evidence/i);
  }
  const parsed = parseRuntimeEvidence(JSON.stringify(structural));
  for (const mismatch of [{ caseId: "550e8400-e29b-41d4-a716-446655440002" }, { operationId: "550e8400-e29b-41d4-a716-446655440003" }, { stage: "chat" as const }, { modelId: "openai/other-model" }]) {
    expect(() => assertRealGenerations([parsed], { ...identity, ...mismatch })).toThrow(/evidence/i);
  }
  expect(() => assertRealGenerations([parsed, parsed], identity)).toThrow(/evidence/i);
  expect(() => parseRuntimeEvidence(JSON.stringify({ ...structural, prompt: "never retain" }))).toThrow(/evidence/i);
});

test("failure-trace settings exclude a real request body sentinel", async ({ browserName }, testInfo) => {
  expect(browserName).toBe("chromium");
  const sentinel = "Q01_PUBLIC_NONSECRET_BODY_SENTINEL";
  const archive = testInfo.outputPath("sentinel-trace.zip");
  const directory = testInfo.outputPath("sentinel-trace");
  // Separate real listener/browser process: no Playwright Test tracing hooks and no app substitution.
  const script = `import { chromium } from '@playwright/test'; import { createServer } from 'node:http';
    const server=createServer((req,res)=>{req.resume();res.end('OK')});
    await new Promise(r=>server.listen(0,'127.0.0.1',r));
    const browser=await chromium.launch({channel:'chrome'}); const context=await browser.newContext();
    try { await context.tracing.start({screenshots:true,snapshots:false,sources:false}); const page=await context.newPage();
      await page.goto('http://127.0.0.1:'+server.address().port);
      await page.evaluate(async body=>{await fetch(location.href,{method:'POST',body})},${JSON.stringify(sentinel)});
      await context.tracing.stop({path:${JSON.stringify(archive)}});
    } finally {await context.close();await browser.close();await new Promise(r=>server.close(r))}`;
  execFileSync(process.execPath, ["--input-type=module", "-e", script], { cwd: APP_ROOT, stdio: "pipe", timeout: 30_000 });
  const quote = (value: string) => `'${value.replaceAll("'", "''")}'`;
  const contents = execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", `Expand-Archive -LiteralPath ${quote(archive)} -DestinationPath ${quote(directory)}; Get-ChildItem -LiteralPath ${quote(directory)} -Recurse -File | Where-Object { $_.Extension -in '.trace','.network' } | ForEach-Object { Get-Content -LiteralPath $_.FullName -Raw }`], { encoding: "utf8" });
  expect(contents).toContain(sentinel); // Current installed trace API records arguments despite snapshots:false.
  sanitizeTrace(archive);
  const safeDirectory = mkdtempSync(join(APP_ROOT, "verification-output/Q01/run/screenshot-proof-"));
  const safeContents = execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", `Expand-Archive -LiteralPath ${quote(archive)} -DestinationPath ${quote(safeDirectory)}; Get-ChildItem -LiteralPath ${quote(safeDirectory)} -Recurse -File | Where-Object { $_.Extension -in '.trace','.network' } | ForEach-Object { Get-Content -LiteralPath $_.FullName -Raw }`], { encoding: "utf8" });
  expect(safeContents).not.toContain(sentinel);
  expect(safeContents).not.toContain('"params"');
  expect(safeContents).toContain('"method":"evaluateExpression"');
  expect(safeContents).toContain('"screencast-frame"');
  const frame = safeContents.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line) as { type: string; file?: string }).find((event) => event.type === "screencast-frame");
  expect(frame?.file).toBeTruthy();
  const screenshot = join(safeDirectory, frame!.file!);
  expect(existsSync(screenshot)).toBe(true);
  const image = await sharp(screenshot).metadata();
  expect(image.format).toBe("jpeg");
  expect(image.width).toBeGreaterThan(0);
  expect(image.height).toBeGreaterThan(0);
  expect((await sharp(screenshot).resize(16, 16).raw().toBuffer()).byteLength).toBeGreaterThan(0);
});

test("a sanitizer failure removes the raw archive", async ({ browserName }, testInfo) => {
  expect(browserName).toBe("chromium");
  const archive = testInfo.outputPath("invalid-trace.zip");
  await writeFile(archive, "Q01_PUBLIC_NONSECRET_INVALID_ARCHIVE");
  expect(() => sanitizeTrace(archive)).toThrow(/raw archive removed/);
  expect(existsSync(archive)).toBe(false);
});
