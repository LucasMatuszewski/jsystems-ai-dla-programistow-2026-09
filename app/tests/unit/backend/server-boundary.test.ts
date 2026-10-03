import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("server-only package boundary", () => {
  it("loads the actual marker in the legitimate server worker", async () => {
    await expect(import("server-only")).resolves.toBeDefined();
    expect(typeof document).toBe("undefined");
  });

  it("rejects an import without the server export condition", () => {
    const result = spawnSync(
      process.execPath,
      ["--input-type=module", "--eval", "import 'server-only';"],
      { cwd: process.cwd(), env: { NODE_ENV: "test" }, encoding: "utf8" },
    );
    expect(result.error).toBeUndefined();
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("cannot be imported from a Client Component");
  });
});
