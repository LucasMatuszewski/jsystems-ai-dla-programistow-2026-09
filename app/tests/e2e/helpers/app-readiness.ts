import { readFileSync, mkdirSync, appendFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync, spawn } from "node:child_process";
import { createInterface } from "node:readline";

export const APP_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
export const APP_ORIGIN = "http://127.0.0.1:3000";

export function assertRuntimePrerequisites(): void {
  if (!process.env.OPENROUTER_API_KEY?.trim()) throw new Error("E2E prerequisite failed: OPENROUTER_API_KEY missing; no AI access claim");
  let localModel = "";
  try { localModel = readFileSync(resolve(APP_ROOT, ".env.local"), "utf8").match(/^LLM_MODEL\s*=\s*([^\r\n]+)/m)?.[1]?.trim().replace(/^['"]|['"]$/g, "") ?? ""; } catch { /* Process env may supply model. */ }
  if (!(process.env.LLM_MODEL?.trim() || localModel)) throw new Error("E2E prerequisite failed: LLM_MODEL missing; no AI access claim");
}

export interface AppInstance { pid: number; cliPid: number; createdAt: string; appPathMatches: true; captureOwnerPid: number | null }

// Inspect live process ancestry, never expose process command lines or credentials.
export function inspectAppInstance(origin = APP_ORIGIN, appRoot = APP_ROOT): AppInstance | null {
  const url = new URL(origin);
  if (url.hostname !== "127.0.0.1" || url.protocol !== "http:") throw new Error("App instance requires local HTTP listener");
  if (process.platform !== "win32") throw new Error("App instance verification requires the supported Windows host");
  const port = Number(url.port || 80);
  const quote = (value: string) => `'${value.replaceAll("'", "''")}'`;
  const nextPath = resolve(appRoot, "node_modules/next/dist/bin/next").replaceAll("\\", "/").toLowerCase();
  const capturePath = resolve(appRoot, "tests/e2e/helpers/app-readiness.ts").replaceAll("\\", "/").toLowerCase();
  const script = `$ErrorActionPreference='Stop'; $listeners=@(Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue); if($listeners.Count -eq 0){Write-Output 'null';exit}; $ids=@($listeners.OwningProcess | Select-Object -Unique); if($ids.Count -ne 1){throw 'ambiguous listener'}; $listenerPid=[int]$ids[0]; $entry=Get-CimInstance Win32_Process -Filter ('ProcessId='+$listenerPid); $created=$entry.CreationDate.ToUniversalTime().ToString('o'); $walkPid=$listenerPid; $cliPid=0; $capturePid=0; for($i=0;$i -lt 16 -and $walkPid -gt 0;$i++){ $p=Get-CimInstance Win32_Process -Filter ('ProcessId='+$walkPid); if(-not $p){break}; $command=[string]$p.CommandLine; $pathMatch=[regex]::Match($command,'(?<path>[A-Za-z]:[^"\\r\\n]*next[\\\\/]dist[\\\\/]bin[\\\\/]next)'); $normalized=''; if($pathMatch.Success){$normalized=[IO.Path]::GetFullPath($pathMatch.Groups['path'].Value).Replace('\\','/').ToLower()}; if($p.Name -eq 'node.exe' -and $normalized -eq ${quote(nextPath)} -and $command -match '(?:^|\\s)dev(?:\\s|$)' -and $command -match '--hostname\\s+127\\.0\\.0\\.1' -and $command -match '--port\\s+${port}(?:\\s|$)'){$cliPid=[int]$p.ProcessId}; if($p.Name -eq 'node.exe' -and $command.Replace('\\','/').ToLower().Contains(${quote(capturePath)}) -and $command -match '(?:^|\\s)start(?:\\s|$)'){$capturePid=[int]$p.ProcessId}; $walkPid=[int]$p.ParentProcessId }; if($cliPid -eq 0){throw 'wrong app instance'}; @{pid=$listenerPid;cliPid=$cliPid;createdAt=$created;appPathMatches=$true;captureOwnerPid=$(if($capturePid -gt 0){$capturePid}else{$null})}|ConvertTo-Json -Compress`;
  try {
    return JSON.parse(execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], { encoding: "utf8", timeout: 15_000, stdio: ["ignore", "pipe", "ignore"] })) as AppInstance | null;
  } catch {
    throw new Error("App instance mismatch: listener is not the expected live Next app");
  }
}

export async function assertAppReadiness(origin = APP_ORIGIN, appRoot = APP_ROOT): Promise<{ ready: true; instance: AppInstance }> {
  const before = inspectAppInstance(origin, appRoot);
  if (!before) throw new Error("App instance missing");
  const response = await fetch(origin, { signal: AbortSignal.timeout(10_000) });
  await response.body?.cancel();
  if (response.status !== 200) throw new Error("App readiness failed");
  const after = inspectAppInstance(origin, appRoot);
  if (!after || after.pid !== before.pid || after.createdAt !== before.createdAt) throw new Error("App instance changed during readiness");
  return { ready: true, instance: after };
}

/** Required AI journeys must call this; ordinary externally owned shell reuse is insufficient. */
export async function readCapturedRuntimeEvidence(): Promise<readonly import("./runtime-evidence").RuntimeEvidence[]> {
  const { instance } = await assertAppReadiness();
  if (!instance.captureOwnerPid) throw new Error("AI evidence requires a fresh test-owned captured server; shell reuse is insufficient");
  const evidence = await import(new URL("./runtime-evidence.ts", import.meta.url).href) as typeof import("./runtime-evidence");
  try {
    const directory = resolve(APP_ROOT, "verification-output/Q01/run");
    const capture = JSON.parse(readFileSync(resolve(directory, "server-capture.json"), "utf8")) as { captureOwnerPid: number; startedAt: string };
    if (capture.captureOwnerPid !== instance.captureOwnerPid || !Number.isFinite(Date.parse(capture.startedAt))) throw new Error();
    return readFileSync(resolve(directory, "server-runtime.jsonl"), "utf8").split(/\r?\n/).filter(Boolean).map(evidence.parseRuntimeEvidence);
  } catch { throw new Error("AI evidence capture missing or invalid for the live server"); }
}

export async function verifyCapturedGenerations(expected: import("./runtime-evidence").GenerationExpectation, options: import("./runtime-evidence").GenerationVerificationOptions = {}): Promise<readonly import("./runtime-evidence").RuntimeEvidence[]> {
  const records = await readCapturedRuntimeEvidence();
  const evidence = await import(new URL("./runtime-evidence.ts", import.meta.url).href) as typeof import("./runtime-evidence");
  return evidence.verifyRealGenerations(records, expected, options);
}

async function startActualApp(): Promise<void> {
  assertRuntimePrerequisites();
  if (inspectAppInstance()) throw new Error("App already running; only authoritative config reuse is allowed");
  const evidence = await import(new URL("./runtime-evidence.ts", import.meta.url).href) as typeof import("./runtime-evidence");
  const output = resolve(APP_ROOT, "verification-output/Q01/run");
  mkdirSync(output, { recursive: true });
  writeFileSync(resolve(output, "server-runtime.jsonl"), "");
  writeFileSync(resolve(output, "server-capture.json"), JSON.stringify({ captureOwnerPid: process.pid, startedAt: new Date().toISOString() }));
  const child = spawn(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", "npm run dev"], { cwd: APP_ROOT, env: process.env, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
  for (const stream of [child.stdout, child.stderr]) {
    createInterface({ input: stream }).on("line", (line: string) => {
      const prefix = "[runtime-evidence] ";
      const start = line.indexOf(prefix);
      if (start >= 0) {
        try {
          const record = evidence.parseRuntimeEvidence(line.slice(start + prefix.length));
          appendFileSync(resolve(output, "server-runtime.jsonl"), `${JSON.stringify(record)}\n`);
        } catch { process.stderr.write("[Q01 server] Invalid runtime evidence rejected\n"); }
      } else if (/Ready in \d/.test(line)) {
        appendFileSync(resolve(output, "server-startup.log"), "Actual Next server ready\n");
        process.stdout.write("[Q01 server] Actual Next server ready\n");
      }
    });
  }
  child.on("error", () => { process.stderr.write("[Q01 server] Actual app failed to start\n"); process.exitCode = 1; });
  child.on("exit", (code) => { process.stdout.write(`[Q01 server] Actual app exited (${code ?? "signal"})\n`); process.exitCode = code ?? 1; });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url) && process.argv[2] === "start") {
  await startActualApp();
}
