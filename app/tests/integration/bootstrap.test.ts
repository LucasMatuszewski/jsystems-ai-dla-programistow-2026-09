import { readFile } from "node:fs/promises";
import sharp from "sharp";
import "server-only";
import { describe, expect, it } from "vitest";
import { APP_ORIGIN } from "./app-origin";

describe("real Node integration runner", () => {
  it("uses the real filesystem and native image processing", async () => {
    const favicon = await readFile(new URL("../../public/favicon.ico", import.meta.url));
    expect(favicon.byteLength).toBeGreaterThan(0);
    const image = await sharp({
      create: { width: 2, height: 3, channels: 3, background: "#ff5a00" },
    }).png().toBuffer();
    const metadata = await sharp(image).metadata();
    expect(metadata).toMatchObject({ width: 2, height: 3, format: "png" });
    expect(typeof document).toBe("undefined");
  });

  it("serves the actual generated shell on the leased local server", async () => {
    const response = await fetch(`${APP_ORIGIN}/`, {
      signal: AbortSignal.timeout(15_000),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    const html = await response.text();
    expect(html).toMatch(/<html(?:\s|>)/i);
    expect(html).toMatch(/<main(?:\s|>)/i);
  });

  it("serves the real favicon without the console-breaking 404 regression", async () => {
    const expected = await readFile(new URL("../../public/favicon.ico", import.meta.url));
    const response = await fetch(`${APP_ORIGIN}/favicon.ico`, {
      signal: AbortSignal.timeout(15_000),
    });
    expect(response.status).toBe(200);
    expect(Buffer.from(await response.arrayBuffer())).toEqual(expected);
  });
});
