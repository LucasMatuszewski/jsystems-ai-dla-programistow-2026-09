export type GenerationStage = "analysis" | "decision" | "chat";
export type EvidenceScreen = "form" | "processing" | "decision" | "chat" | "restored" | "error";

/** The caller supplies its actual completed-operation locator, never token arrival. */
export async function waitForOperationCompletion(terminal: import("@playwright/test").Locator): Promise<void> {
  await terminal.waitFor({ state: "visible", timeout: 125_000 });
}

/** Only approved demo fixtures belong in screenshot evidence. */
export async function captureDemoState(page: import("@playwright/test").Page, testInfo: import("@playwright/test").TestInfo, screen: EvidenceScreen): Promise<void> {
  const path = testInfo.outputPath(`${screen}.png`);
  await page.screenshot({ path, fullPage: true });
  await testInfo.attach(screen, { path, contentType: "image/png" });
}
export interface GenerationExpectation { caseId: string; operationId: string; stage: GenerationStage; modelId: string }
export interface RuntimeEvidence extends GenerationExpectation {
  event: "generation.completed";
  provider: "openrouter";
  generationId: string;
  success: true;
}

export function parseRuntimeEvidence(line: string): RuntimeEvidence {
  try {
    const value: unknown = JSON.parse(line);
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
    const record = value as Record<string, unknown>;
    const keys = ["event", "provider", "caseId", "operationId", "stage", "modelId", "generationId", "success"];
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (Object.keys(record).length !== keys.length || keys.some((key) => !(key in record))) throw new Error();
    if (record.event !== "generation.completed" || record.provider !== "openrouter" || record.success !== true) throw new Error();
    if (typeof record.caseId !== "string" || !uuid.test(record.caseId) || typeof record.operationId !== "string" || !uuid.test(record.operationId)) throw new Error();
    if (!["analysis", "decision", "chat"].includes(String(record.stage))) throw new Error();
    if (typeof record.modelId !== "string" || !/^[\w.-]+\/[\w.:-]+$/.test(record.modelId)) throw new Error();
    if (typeof record.generationId !== "string" || !/^gen-[A-Za-z0-9-]{8,}$/.test(record.generationId) || /(?:fake|mock|placeholder)/i.test(record.generationId)) throw new Error();
    return { event: "generation.completed", provider: "openrouter", caseId: record.caseId, operationId: record.operationId, stage: record.stage as GenerationStage, modelId: record.modelId, generationId: record.generationId, success: true };
  } catch { throw new Error("Invalid runtime evidence: actual completed generation identity required"); }
}

// Structural correlation only. Actual access/success requires verifyRealGenerations below.
export function assertRealGenerations(records: readonly RuntimeEvidence[], expected: GenerationExpectation): readonly RuntimeEvidence[] {
  const matches = records.map((record) => parseRuntimeEvidence(JSON.stringify(record))).filter((record) => record.caseId === expected.caseId && record.operationId === expected.operationId && record.stage === expected.stage && record.modelId === expected.modelId);
  if (matches.length === 0 || new Set(matches.map((record) => record.generationId)).size !== matches.length) throw new Error("Runtime evidence missing or duplicate for expected case/operation/stage/model");
  return matches;
}

async function verifyOfficialModelAlias(requestedModel: string, actualModel: string): Promise<boolean> {
  const [author, slug] = requestedModel.split("/");
  const url = `https://openrouter.ai/api/v1/model/${encodeURIComponent(author)}/${encodeURIComponent(slug)}`;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (response.status !== 200) { await response.body?.cancel(); return false; }
    const result: unknown = await response.json();
    if (!result || typeof result !== "object" || Array.isArray(result)) return false;
    const data = (result as { data?: unknown }).data;
    if (!data || typeof data !== "object" || Array.isArray(data)) return false;
    const metadata = data as Record<string, unknown>;
    return metadata.id === requestedModel && typeof metadata.canonical_slug === "string" && metadata.canonical_slug.trim().length > 0 && metadata.canonical_slug === actualModel;
  } catch { return false; }
}

/** Call only after a required actual AI journey. Catalog/key presence are not evidence. */
export async function verifyRealGenerations(records: readonly RuntimeEvidence[], expected: GenerationExpectation): Promise<readonly RuntimeEvidence[]> {
  const matches = assertRealGenerations(records, expected);
  const key = process.env.OPENROUTER_API_KEY?.trim();
  if (!key) throw new Error("Generation evidence prerequisite failed: credential missing");
  for (const record of matches) {
    const url = new URL("https://openrouter.ai/api/v1/generation");
    url.searchParams.set("id", record.generationId);
    const response = await fetch(url, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(30_000) });
    if (!response.ok) { await response.body?.cancel(); throw new Error(`Actual generation evidence unavailable (HTTP ${response.status})`); }
    const result = await response.json() as { data?: Record<string, unknown> };
    const data = result.data;
    const completionTokens = data?.tokens_completion ?? data?.native_tokens_completion;
    const finishReason = data?.finish_reason ?? data?.native_finish_reason;
    // Nullable metadata is a legal provider response, but unknown completion facts cannot prove success.
    if (!data || data.id !== record.generationId || typeof data.model !== "string" || !data.model.trim() || data.cancelled !== false || typeof completionTokens !== "number" || !Number.isFinite(completionTokens) || completionTokens <= 0 || !["stop", "length", "tool_calls"].includes(String(finishReason))) throw new Error("Actual generation evidence insufficient for expected completed model call");
    // Official alias identity cannot replace completed-generation facts above.
    if (data.model !== expected.modelId && !await verifyOfficialModelAlias(expected.modelId, data.model)) throw new Error("Actual generation evidence insufficient for expected completed model call");
  }
  return matches;
}

/** Retain only action identity/timing and approved demo screenshots; never params, bodies or logs. */
export function sanitizeTrace(archive: string): void {
  const path = resolve(archive);
  const root = resolve(process.cwd(), "verification-output/Q01/run");
  if (!path.startsWith(root + sep) || !path.endsWith(".zip")) throw new Error("Unsafe trace artifact path");
  const temporary = mkdtempSync(join(root, "trace-safe-"));
  const quote = (value: string) => `'${value.replaceAll("'", "''")}'`;
  let phase = "expand";
  try {
    execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", `$ErrorActionPreference='Stop'; Expand-Archive -LiteralPath ${quote(path)} -DestinationPath ${quote(temporary)} -Force`], { stdio: "pipe", timeout: 30_000 });
    const files: string[] = [];
    const collect = (directory: string) => {
      for (const item of readdirSync(directory, { withFileTypes: true })) {
        const child = join(directory, item.name);
        if (item.isDirectory()) collect(child); else files.push(child);
      }
    };
    collect(temporary);
    phase = "metadata";
    const screenshots = new Set<string>();
    for (const file of files.filter((item) => item.endsWith(".trace"))) {
      const safe: Record<string, unknown>[] = [];
      for (const line of readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean)) {
        const event = JSON.parse(line) as Record<string, unknown>;
        let keys: string[];
        switch (event.type) {
          case "context-options": keys = ["version", "type", "origin", "browserName", "playwrightVersion", "platform", "wallTime", "monotonicTime", "sdkLanguage"]; break;
          case "before": keys = ["type", "callId", "startTime", "class", "method", "parentId", "pageId"]; break;
          case "after": keys = ["type", "callId", "endTime"]; break;
          case "screencast-frame": {
            if (typeof event.file !== "string" || !/^screencast\/[\w@.-]+\.(?:jpeg|png)$/.test(event.file)) throw new Error("Unexpected screenshot reference");
            screenshots.add(event.file);
            keys = ["type", "pageId", "file", "width", "height", "timestamp", "frameSwapWallTime"];
            break;
          }
          default: continue;
        }
        safe.push(Object.fromEntries(keys.filter((key) => key in event).map((key) => [key, event[key]])));
      }
      writeFileSync(file, safe.map((event) => JSON.stringify(event)).join("\n") + "\n");
    }
    for (const file of files) {
      const name = relative(temporary, file).replaceAll("\\", "/");
      if (name.endsWith(".network")) writeFileSync(file, "");
      else if (!name.endsWith(".trace") && !screenshots.has(name)) rmSync(file);
    }
    // Delete raw archive before replacement; a failed sanitizer must never retain it.
    rmSync(path);
    phase = "compress";
    execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", `$ErrorActionPreference='Stop'; Compress-Archive -Path ${quote(join(temporary, "*"))} -DestinationPath ${quote(path)} -Force`], { stdio: "pipe", timeout: 30_000 });
  } catch {
    if (existsSync(path)) rmSync(path);
    throw new Error(`Trace sanitization failed (${phase}); raw archive removed`);
  } finally {
    // The exact fresh directory was created in the checked evidence subtree above.
    if (dirname(temporary) === root && temporary.startsWith(join(root, "trace-safe-"))) rmSync(temporary, { recursive: true, force: true });
  }
}

export default class SafeTraceReporter implements Reporter {
  private failed = false;
  onTestEnd(_test: TestCase, result: TestResult): void {
    for (const attachment of result.attachments.filter((item) => item.contentType === "application/zip")) {
      if (!attachment.path) continue;
      try { sanitizeTrace(attachment.path); } catch { this.failed = true; process.stderr.write("Q01: retained trace rejected; raw archive removed\n"); }
    }
  }
  async onEnd(): Promise<{ status: "failed" } | undefined> { return this.failed ? { status: "failed" } : undefined; }
}
import { execFileSync } from "node:child_process";
import { dirname, resolve, join, sep, relative } from "node:path";
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import type { Reporter, TestCase, TestResult } from "@playwright/test/reporter";
