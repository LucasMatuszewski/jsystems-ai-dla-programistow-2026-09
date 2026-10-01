// @vitest-environment node
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { crc32, createInflate } from "node:zlib";
import sharp from "sharp";
import { describe, expect, it } from "vitest";

const root = new URL("../../fixtures/", import.meta.url);
const names = ["intact-smartphone.jpg", "damaged-smartphone.jpg", "ambiguous-smartphone.jpg", "exif-rotated.jpg", "transparent.png", "valid.webp", "animated.webp", "corrupt.bin", "oversize.jpg", "pixel-limit.png"];
type Fixture = {
  file: string; kind: "real-photo" | "photo-derivative" | "generated-boundary";
  sha256: string; bytes: number; author: string; title: string;
  sourceUrl: string | null; downloadUrl: string | null; license: string; licenseUrl: string;
  formatReferenceUrl?: string;
  generationRecipe?: { location: "local"; instructions: string; bytesHex?: string };
  attribution: string; modifications: string; rightsVerifiedAt: string;
  visualVerdict: string; derivedFrom?: string; originalSha1?: string;
  format?: string; width?: number; height?: number; pages?: number;
};
async function provenance(): Promise<{ fixtures: Fixture[] }> {
  return JSON.parse(await readFile(new URL("provenance.json", root), "utf8"));
}
const path = (name: string) => fileURLToPath(new URL(`images/${name}`, root));

describe("Q02 licensed real hardware photos and genuine image boundaries", () => {
  it("records all required fixture files, explicit rights, attribution and exact bytes", async () => {
    const { fixtures } = await provenance();
    expect(fixtures.map((f) => f.file).sort()).toEqual([...names].sort());
    expect((await readdir(new URL("images/", root))).sort()).toEqual([...names].sort());
    for (const f of fixtures) {
      const bytes = await readFile(path(f.file));
      expect(createHash("sha256").update(bytes).digest("hex"), f.file).toBe(f.sha256);
      expect(bytes.length, f.file).toBe(f.bytes);
      for (const field of [f.author, f.title, f.license, f.attribution, f.modifications, f.rightsVerifiedAt, f.visualVerdict]) expect(field, f.file).toBeTruthy();
      expect(new URL(f.licenseUrl).protocol).toMatch(/^https?:$/);
      if (f.kind !== "generated-boundary") {
        for (const url of [f.sourceUrl, f.downloadUrl]) {
          expect(typeof url, f.file).toBe("string");
          expect(new URL(url!).protocol, f.file).toMatch(/^https?:$/);
        }
      }
      if (f.kind === "photo-derivative") {
        const source = fixtures.find((candidate) => candidate.file === f.derivedFrom);
        expect(source?.kind, f.file).toBe("real-photo");
        expect(f.author, f.file).toBe(source?.author);
        expect(f.license, f.file).toBe(source?.license);
      }
      if (f.kind === "real-photo") {
        expect(createHash("sha1").update(bytes).digest("hex"), f.file).toBe(f.originalSha1);
        expect(["CC0-1.0", "CC-BY-SA-4.0"]).toContain(f.license);
        expect(f.attribution).toContain(f.author);
        expect(f.modifications).toContain("Exact original bytes");
      }
    }
  });

  it("identifies generated boundaries as local recipes without fictitious download sources", async () => {
    const { fixtures } = await provenance();
    const generated = fixtures.filter((f) => f.kind === "generated-boundary");
    expect(generated.map((f) => f.file).sort()).toEqual(["corrupt.bin", "pixel-limit.png"]);
    for (const f of generated) {
      expect(f.sourceUrl, f.file).toBeNull();
      expect(f.downloadUrl, f.file).toBeNull();
      expect(f.generationRecipe?.location, f.file).toBe("local");
      expect(f.generationRecipe?.instructions.length, f.file).toBeGreaterThan(80);
      if (f.formatReferenceUrl) expect(new URL(f.formatReferenceUrl).protocol).toBe("https:");
      if (f.file === "corrupt.bin") {
        expect(f.generationRecipe?.bytesHex, f.file).toMatch(/^(?:[0-9a-f]{2})+$/);
        expect(Buffer.from(f.generationRecipe!.bytesHex!, "hex")).toEqual(await readFile(path(f.file)));
      }
    }
  });

  it("decodes three independent real smartphone photos within upload constraints", async () => {
    const { fixtures } = await provenance();
    for (const name of names.slice(0, 3)) {
      const f = fixtures.find((candidate) => candidate.file === name)!;
      expect(f.kind).toBe("real-photo");
      expect(f.bytes).toBeLessThanOrEqual(10_000_000);
      const metadata = await sharp(path(name), { failOn: "warning", limitInputPixels: 64_000_000 }).metadata();
      expect(metadata.format).toBe("jpeg");
      expect(metadata.width).toBe(f.width);
      expect(metadata.height).toBe(f.height);
      expect(metadata.pages ?? 1).toBe(1);
      // Force a real decoder pass, rather than accepting only a plausible header.
      const decoded = await sharp(path(name), { failOn: "warning" }).resize(64, 64, { fit: "inside" }).raw().toBuffer();
      expect(decoded.length).toBeGreaterThan(0);
    }
  });

  it("has real EXIF rotation with correctly oriented dimensions", async () => {
    const m = await sharp(path("exif-rotated.jpg")).metadata();
    expect(m.orientation).toBe(6);
    expect(m.exif?.length).toBeGreaterThan(0);
    const { info } = await sharp(path("exif-rotated.jpg")).autoOrient().raw().toBuffer({ resolveWithObject: true });
    expect(info.width).toBe(m.height);
    expect(info.height).toBe(m.width);
  });

  it("contains actual transparent pixels and a legitimate still WebP", async () => {
    const { data, info } = await sharp(path("transparent.png")).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    expect(info.channels).toBe(4);
    expect(data[3]).toBe(0);
    expect(data.some((value, index) => index % 4 === 3 && value === 255)).toBe(true);
    const m = await sharp(path("valid.webp")).metadata();
    expect(m.format).toBe("webp");
    expect(m.pages ?? 1).toBe(1);
    expect((await sharp(path("valid.webp")).raw().toBuffer()).length).toBeGreaterThan(0);
  });

  it("contains actual multiple WebP frames and genuinely undecodable bytes", async () => {
    const m = await sharp(path("animated.webp"), { animated: true }).metadata();
    expect(m.format).toBe("webp");
    expect(m.pages).toBe(2);
    expect(m.pageHeight).toBeGreaterThan(0);
    expect((await sharp(path("animated.webp"), { animated: true }).raw().toBuffer()).length).toBeGreaterThan(0);
    await expect(sharp(path("corrupt.bin")).metadata()).rejects.toThrow();
  });

  it("covers a decodable JPEG above the byte cap and a valid PNG above the pixel guard", async () => {
    expect((await readFile(path("oversize.jpg"))).length).toBe(10_000_001);
    expect((await sharp(path("oversize.jpg")).metadata()).format).toBe("jpeg");
    expect((await sharp(path("oversize.jpg")).resize(16, 16).raw().toBuffer()).length).toBeGreaterThan(0);
    const m = await sharp(path("pixel-limit.png"), { limitInputPixels: false }).metadata();
    expect(m.format).toBe("png");
    expect(m.width! * m.height!).toBeGreaterThan(64_000_000);
    // Independently verify complete PNG chunks and stream all scanlines. Retain
    // only decompressor chunks, never allocate the 64-million-pixel raster.
    const png = await readFile(path("pixel-limit.png"));
    expect(png.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const idat: Buffer[] = [];
    const chunkTypes: string[] = [];
    let offset = 8;
    while (offset < png.length) {
      const length = png.readUInt32BE(offset);
      const end = offset + 12 + length;
      expect(end).toBeLessThanOrEqual(png.length);
      const type = png.toString("ascii", offset + 4, offset + 8);
      chunkTypes.push(type);
      expect(crc32(png.subarray(offset + 4, offset + 8 + length))).toBe(png.readUInt32BE(offset + 8 + length));
      if (type === "IHDR") expect([...png.subarray(offset + 16, offset + 21)]).toEqual([8, 0, 0, 0, 0]);
      if (type === "IDAT") idat.push(png.subarray(offset + 8, offset + 8 + length));
      offset = end;
    }
    expect(offset).toBe(png.length);
    expect(chunkTypes).toEqual(["IHDR", "IDAT", "IEND"]);
    const inflate = createInflate();
    inflate.end(Buffer.concat(idat));
    let decodedBytes = 0;
    for await (const scanlines of inflate) {
      const bytes = scanlines as Buffer;
      decodedBytes += bytes.length;
      expect(decodedBytes).toBeLessThanOrEqual((m.width! + 1) * m.height!);
      expect(bytes.every((value) => value === 0)).toBe(true);
    }
    expect(decodedBytes).toBe((m.width! + 1) * m.height!);
    // App guard must reject before allocating the large decoded raster.
    await expect(sharp(path("pixel-limit.png"), { limitInputPixels: 64_000_000 }).metadata()).rejects.toThrow(/pixel limit/i);
  });
});
