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
export interface GenerationVerificationOptions { metadataWaitDeadlineMs?: number; attemptReportPath?: string }
export type GenerationEvidenceErrorCode = "METADATA_UNAVAILABLE" | "GENERATION_HTTP_ERROR" | "INVALID_GENERATION_METADATA" | "MODEL_IDENTITY_UNVERIFIED" | "TRANSPORT_ERROR";
export class GenerationEvidenceError extends Error {
  constructor(public readonly code: GenerationEvidenceErrorCode, public readonly status?: number) {
    super(`Generation evidence verification failed: ${code}`);
    this.name = "GenerationEvidenceError";
  }
}
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

async function verifyOfficialModelAlias(requestedModel: string, actualModel: string, read: (url: string | URL, alias: boolean) => Promise<{ status: number; result: unknown }>): Promise<boolean> {
  const [author, slug] = requestedModel.split("/");
  const url = `https://openrouter.ai/api/v1/model/${encodeURIComponent(author)}/${encodeURIComponent(slug)}`;
  try {
    const { status, result } = await read(url, true);
    if (status !== 200) return false;
    if (!result || typeof result !== "object" || Array.isArray(result)) return false;
    const data = (result as { data?: unknown }).data;
    if (!data || typeof data !== "object" || Array.isArray(data)) return false;
    const metadata = data as Record<string, unknown>;
    return metadata.id === requestedModel && typeof metadata.canonical_slug === "string" && metadata.canonical_slug.trim().length > 0 && metadata.canonical_slug === actualModel;
  } catch (error) {
    if (error instanceof GenerationEvidenceError && error.code === "METADATA_UNAVAILABLE") throw error;
    return false;
  }
}

/** Call only after a required actual AI journey. Catalog/key presence are not evidence. */
export async function verifyRealGenerations(records: readonly RuntimeEvidence[], expected: GenerationExpectation, options: GenerationVerificationOptions = {}): Promise<readonly RuntimeEvidence[]> {
  const matches = assertRealGenerations(records, expected);
  const started = performance.now();
  const deadline = options.metadataWaitDeadlineMs;
  if (deadline !== undefined && (!Number.isFinite(deadline) || deadline <= started || deadline - started > 420_000)) throw new GenerationEvidenceError("METADATA_UNAVAILABLE");
  const reportPath = options.attemptReportPath === undefined ? undefined : checkedNewReportPath(options.attemptReportPath);
  const key = process.env.OPENROUTER_API_KEY?.trim();
  if (!key) throw new Error("Generation evidence prerequisite failed: credential missing");
  const attempts: { generationId: string; count: number; status?: number }[] = matches.map(record => ({ generationId: record.generationId, count: 0 }));
  const remaining = () => {
    const value = deadline === undefined ? 30_000 : deadline - performance.now();
    if (value <= 0) throw new GenerationEvidenceError("METADATA_UNAVAILABLE");
    return value;
  };
  const read = async (url: string | URL, alias: boolean): Promise<{ status: number; result: unknown }> => {
    const timeout = Math.min(30_000, remaining());
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const operation = async () => {
        const response = await fetch(url, { ...(alias ? {} : { headers: { Authorization: `Bearer ${key}` } }), signal: controller.signal });
        if (response.status !== 200) { await response.body?.cancel(); return { status: response.status, result: null }; }
        let result: unknown;
        try { result = await response.json(); } catch { throw new GenerationEvidenceError(alias ? "MODEL_IDENTITY_UNVERIFIED" : "INVALID_GENERATION_METADATA"); }
        return { status: response.status, result };
      };
      const result = await Promise.race([operation(), new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new GenerationEvidenceError(deadline !== undefined && performance.now() >= deadline ? "METADATA_UNAVAILABLE" : alias ? "MODEL_IDENTITY_UNVERIFIED" : "TRANSPORT_ERROR"));
        }, timeout);
      })]);
      remaining();
      return result;
    } catch (error) {
      if (deadline !== undefined && performance.now() >= deadline) throw new GenerationEvidenceError("METADATA_UNAVAILABLE");
      if (error instanceof GenerationEvidenceError) throw error;
      throw new GenerationEvidenceError(alias ? "MODEL_IDENTITY_UNVERIFIED" : "TRANSPORT_ERROR");
    } finally { if (timer !== undefined) clearTimeout(timer); }
  };
  let verdict = "failed";
  let failure: GenerationEvidenceErrorCode | undefined;
  try {
  for (const [index, record] of matches.entries()) {
    const url = new URL("https://openrouter.ai/api/v1/generation");
    url.searchParams.set("id", record.generationId);
    let result: unknown;
    for (;;) {
      remaining();
      attempts[index].count++;
      const response = await read(url, false);
      attempts[index].status = response.status;
      if (response.status === 200) { result = response.result; break; }
      if (response.status !== 404) throw new GenerationEvidenceError("GENERATION_HTTP_ERROR", response.status);
      if (deadline === undefined) throw new GenerationEvidenceError("METADATA_UNAVAILABLE", 404);
      await new Promise(resolve => setTimeout(resolve, Math.min(10_000, remaining())));
    }
    const data = result && typeof result === "object" && !Array.isArray(result) ? (result as { data?: Record<string, unknown> }).data : undefined;
    const completionTokens = data?.tokens_completion ?? data?.native_tokens_completion;
    const finishReason = data?.finish_reason ?? data?.native_finish_reason;
    // Nullable metadata is a legal provider response, but unknown completion facts cannot prove success.
    if (!data || Array.isArray(data) || data.id !== record.generationId || typeof data.model !== "string" || !data.model.trim() || data.cancelled !== false || typeof completionTokens !== "number" || !Number.isFinite(completionTokens) || completionTokens <= 0 || !["stop", "length", "tool_calls"].includes(String(finishReason))) throw new GenerationEvidenceError("INVALID_GENERATION_METADATA");
    // Official alias identity cannot replace completed-generation facts above.
    if (data.model !== expected.modelId && !await verifyOfficialModelAlias(expected.modelId, data.model, read)) throw new GenerationEvidenceError("MODEL_IDENTITY_UNVERIFIED");
    remaining();
  }
  verdict = "verified";
  return matches;
  } catch (error) {
    if (error instanceof GenerationEvidenceError) failure = error.code;
    throw error;
  } finally {
    if (reportPath) {
      // Recheck the real parent immediately before writing; no response bodies belong here.
      const path = checkedNewReportPath(reportPath);
      writeFileSync(path, JSON.stringify({ caseId: expected.caseId, operationId: expected.operationId, stage: expected.stage, configuredModel: expected.modelId, verdict, ...(failure ? { failure } : {}), elapsedMs: Math.max(0, performance.now() - started), attempts }) + "\n");
    }
  }
}

function checkedNewReportPath(file: string): string {
  const root = realpathSync(resolve(dirname(fileURLToPath(import.meta.url)), "../../..", "verification-output"));
  const path = resolve(file);
  const inside = (candidate: string) => {
    const name = relative(root, candidate);
    return name !== "" && name !== ".." && !name.startsWith(".." + sep) && !isAbsolute(name);
  };
  if (!inside(path) || extname(path).toLowerCase() !== ".json" || !inside(realpathSync(dirname(path)))) throw new Error("Unsafe evidence report path");
  if (existsSync(path) && realpathSync(path) !== path) throw new Error("Unsafe evidence report path");
  return path;
}

function checkedArtifactPath(file: string, extension: string): { path: string; root: string } {
  const root = realpathSync(resolve(dirname(fileURLToPath(import.meta.url)), "../../..", "verification-output"));
  const requested = resolve(file);
  const inside = (path: string) => {
    const name = relative(root, path);
    return name !== "" && name !== ".." && !name.startsWith(".." + sep) && !isAbsolute(name);
  };
  if (!inside(requested) || extname(requested).toLowerCase() !== extension) throw new Error("Unsafe evidence artifact path");
  const path = realpathSync(requested);
  if (!inside(path) || extname(path).toLowerCase() !== extension) throw new Error("Unsafe evidence artifact path");
  return { path, root };
}

/** Retain only action identity/timing and approved demo screenshots; never params, bodies or logs. */
export function sanitizeTrace(archive: string): void {
  const { path, root } = checkedArtifactPath(archive, ".zip");
  let temporary: string | undefined;
  const quote = (value: string) => `'${value.replaceAll("'", "''")}'`;
  let phase = "prepare";
  try {
    temporary = mkdtempSync(join(root, "trace-safe-"));
    phase = "expand";
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
    if (temporary && dirname(temporary) === root && temporary.startsWith(join(root, "trace-safe-"))) rmSync(temporary, { recursive: true, force: true });
  }
}

export default class SafeTraceReporter implements Reporter {
  private failed = false;
  onTestEnd(test: TestCase, result: TestResult): void {
    // Playwright attaches this full error/page snapshot before onTestEnd. Keep only safe failure identity.
    for (const attachment of result.attachments.filter(item => item.name === "error-context" && item.contentType === "text/markdown")) {
      const id = /^[\w@.-]+$/.test(test.id) ? test.id : "withheld";
      const status = ["passed", "failed", "timedOut", "skipped", "interrupted"].includes(result.status) ? result.status : "withheld";
      const safe = `# Failure context withheld\nTest: ${id}\nStatus: ${status}\nRetry: ${Number.isInteger(result.retry) ? result.retry : 0}\nApproved screenshot attachments are retained.\n`;
      if (attachment.body) attachment.body = Buffer.from(safe);
      try {
        if (attachment.path) {
          const { path } = checkedArtifactPath(attachment.path, ".md");
          if (basename(path) !== "error-context.md") throw new Error("Unsafe error context artifact name");
          try { writeFileSync(path, safe); } catch { rmSync(path, { force: true }); throw new Error("Error context write failed"); }
        }
      } catch { this.failed = true; process.stderr.write("Q01: error context artifact rejected; removal not confirmed\n"); }
    }
    for (const attachment of result.attachments.filter((item) => item.name === "trace" && item.contentType === "application/zip")) {
      if (!attachment.path) continue;
      try { sanitizeTrace(attachment.path); } catch { this.failed = true; process.stderr.write("Q01: trace artifact rejected; removal not confirmed for unsafe paths\n"); }
    }
  }
  async onEnd(): Promise<{ status: "failed" } | undefined> { return this.failed ? { status: "failed" } : undefined; }
}
import { execFileSync } from "node:child_process";
import { dirname, resolve, join, sep, relative, isAbsolute, extname, basename } from "node:path";
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync, rmSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Reporter, TestCase, TestResult } from "@playwright/test/reporter";
