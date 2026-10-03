import { defineConfig, devices } from "@playwright/test";
import { resolve } from "node:path";
import { APP_ORIGIN, APP_ROOT, assertRuntimePrerequisites, inspectAppInstance } from "./tests/e2e/helpers/app-readiness";

assertRuntimePrerequisites();
const existingInstance = inspectAppInstance();

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 300_000,
  expect: { timeout: 10_000 },
  outputDir: "verification-output/Q01/run/results",
  reporter: [["list"], ["./tests/e2e/helpers/runtime-evidence.ts"]],
  use: {
    baseURL: APP_ORIGIN,
    ...devices["Desktop Chrome"],
    channel: "chrome",
    screenshot: "only-on-failure",
    trace: { mode: "retain-on-failure", screenshots: true, snapshots: false, sources: false },
  },
  webServer: {
    command: `node "${resolve(APP_ROOT, "tests/e2e/helpers/app-readiness.ts")}" start`,
    cwd: APP_ROOT,
    url: APP_ORIGIN,
    reuseExistingServer: existingInstance !== null,
    timeout: 120_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
