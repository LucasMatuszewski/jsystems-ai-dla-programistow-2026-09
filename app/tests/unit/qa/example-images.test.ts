// @vitest-environment node
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import sharp from "sharp";
import { describe, expect, it } from "vitest";

const names = ["laptop-1.png", "laptop-2.webp", "phone-1.jpg", "phone-2.jpeg", "phone-3.jpeg"];
const root = new URL("../../fixtures/", import.meta.url);
type Entry = { originalName: string; sourcePath: string; bytes: number; sha256: string; format: string; width: number; height: number; pages: number };
async function manifest(): Promise<{ schemaVersion: number; sourceCommit: string; rights: string; files: Entry[] }> {
  return JSON.parse(await readFile(new URL("example-images-provenance.json", root), "utf8"));
}

describe("unchanged user-provided example images", () => {
  it("registers exactly five original names and neutral technical provenance", async () => {
    const value = await manifest();
    expect(Object.keys(value).sort()).toEqual(["schemaVersion", "sourceCommit", "rights", "files"].sort());
    expect(value.schemaVersion).toBe(1);
    expect(value.sourceCommit).toBe("7629ca3813757336f932d5d61ce438d4b03653a4");
    expect(value.rights).toBe("User-provided; use instructed in this task");
    expect(value.files.map(file => file.originalName).sort()).toEqual(names);
    expect((await readdir(new URL("images/example-images/", root))).sort()).toEqual([...names, "README.md"].sort());
    for (const file of value.files) {
      expect(Object.keys(file).sort()).toEqual(["originalName", "sourcePath", "bytes", "sha256", "format", "width", "height", "pages"].sort());
      expect(file.sourcePath).toBe(`assets/example-images/${file.originalName}`);
    }
  });

  it("matches both original and fixture bytes and fully decodes every registered file", async () => {
    const value = await manifest();
    expect((await readdir(new URL("../../../assets/example-images/", root))).sort()).toEqual(names);
    for (const file of value.files) {
      const bytes = await readFile(new URL(`images/example-images/${file.originalName}`, root));
      const original = await readFile(new URL(`../../../${file.sourcePath}`, root));
      expect(bytes.equals(original), file.originalName).toBe(true);
      expect(bytes.length).toBe(file.bytes);
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(file.sha256);
      const metadata = await sharp(bytes, { failOn: "warning", limitInputPixels: 64_000_000 }).metadata();
      expect({ format: metadata.format, width: metadata.width, height: metadata.height, pages: metadata.pages ?? 1 }).toEqual({ format: file.format, width: file.width, height: file.height, pages: file.pages });
      expect((await sharp(bytes, { failOn: "warning" }).raw().toBuffer()).length).toBeGreaterThan(0);
      expect(bytes.length).toBeLessThanOrEqual(10_000_000);
    }
  });
});
