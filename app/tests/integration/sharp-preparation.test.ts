import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { prepareImage } from "../../src/server/images/prepare-image";
import { validatePreparedImage } from "../../src/server/images/validate-prepared-image";
import type { PreparedImage } from "../../src/lib/contracts/image";

const fixture = (name: string) => readFile(resolve("tests/fixtures/images", name));
const bytes = (url: string) => Buffer.from(url.slice("data:image/jpeg;base64,".length), "base64");
const digest = (data: Buffer) => createHash("sha256").update(data).digest("hex");
const encoded = (data: Buffer) => `data:image/jpeg;base64,${data.toString("base64")}`;

async function assertJpeg(image: PreparedImage) {
  const data = bytes(image.imageDataUrl);
  const meta = await sharp(data).metadata();
  const raster = await sharp(data).raw().toBuffer({ resolveWithObject: true });
  expect(meta.format).toBe("jpeg");
  expect([meta.width, meta.height]).toEqual([image.width, image.height]);
  expect(raster.data.length).toBe(image.width * image.height * raster.info.channels);
  expect(image.width).toBeLessThanOrEqual(2048); expect(image.height).toBeLessThanOrEqual(2048);
  expect(image.byteLength).toBe(data.length); expect(data.length).toBeLessThanOrEqual(4_000_000);
  expect(image.sha256).toBe(digest(data));
  for (const field of ["exif", "icc", "iptc", "xmp", "orientation"] as const) expect(meta[field]).toBeUndefined();
  const thumbnail = await sharp(bytes(image.thumbnailDataUrl)).raw().toBuffer({ resolveWithObject: true });
  expect(thumbnail.info.width).toBeLessThanOrEqual(512); expect(thumbnail.info.height).toBeLessThanOrEqual(512);
  const thumbMeta = await sharp(bytes(image.thumbnailDataUrl)).metadata();
  expect(thumbMeta.format).toBe("jpeg");
  for (const field of ["exif", "icc", "iptc", "xmp", "orientation"] as const) expect(thumbMeta[field]).toBeUndefined();
  return data;
}

describe("bounded image preparation with actual Sharp and unchanged Q02 fixtures", () => {
  it.each(["damaged-smartphone.jpg", "intact-smartphone.jpg", "ambiguous-smartphone.jpg", "valid.webp", "transparent.png"])("decodes %s and returns actual metadata-free bounded JPEGs", async name => {
    const input = await fixture(name);
    const image = await prepareImage(input);
    const output = await assertJpeg(image);
    const source = await sharp(input).metadata();
    expect(image.width).toBeLessThanOrEqual(source.width!); expect(image.height).toBeLessThanOrEqual(source.height!);
    const validated = await validatePreparedImage(image);
    expect(validated.imageBuffer.equals(output)).toBe(true);
    expect(validated.thumbnailBuffer.equals(bytes(image.thumbnailDataUrl))).toBe(true);
  });
  it("applies EXIF6 orientation to actual pixels before resizing and thumbnailing", async () => {
    const input = await fixture("exif-rotated.jpg");
    const image = await prepareImage(input);
    await assertJpeg(image);
    expect([image.width, image.height]).toEqual([1280, 960]);
    const expected = await sharp(input).autoOrient().resize(2048, 2048, { fit: "inside", withoutEnlargement: true }).flatten({ background: "#ffffff" }).jpeg({ quality: 85 }).toBuffer();
    expect(bytes(image.imageDataUrl).equals(expected)).toBe(true);
    const expectedThumb = await sharp(expected).resize(512, 512, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 70 }).toBuffer();
    expect(bytes(image.thumbnailDataUrl).equals(expectedThumb)).toBe(true);
  });
  it("flattens actual alpha pixels to white without enlargement or cropping", async () => {
    const image = await prepareImage(await fixture("transparent.png"));
    expect([image.width, image.height]).toEqual([208, 160]);
    for (const url of [image.imageDataUrl, image.thumbnailDataUrl]) {
      const raster = await sharp(bytes(url)).raw().toBuffer({ resolveWithObject: true });
      expect(raster.info.channels).toBe(3);
      // JPEG quality70 is lossy: allow a two-level quantization error at the white corner.
      for (const channel of raster.data.subarray(0, 3)) expect(channel).toBeGreaterThanOrEqual(253);
    }
  });
  it.each([["corrupt.bin", "INVALID_IMAGE"], ["animated.webp", "INVALID_IMAGE"], ["oversize.jpg", "PAYLOAD_LIMIT"], ["pixel-limit.png", "IMAGE_PROCESSING_LIMIT"]])("rejects actual %s as %s", async (name, code) => {
    await expect(prepareImage(await fixture(name))).rejects.toMatchObject({ code });
  });
  it("accepts the exact decimal input-byte boundary", async () => {
    const source = await fixture("intact-smartphone.jpg");
    const boundary = Buffer.alloc(10_000_000); source.copy(boundary);
    await assertJpeg(await prepareImage(boundary));
  });
  it("rejects another actually decoded format even when disguised as JPEG bytes", async () => {
    const gif = await sharp(await fixture("valid.webp")).gif().toBuffer();
    await expect(prepareImage(gif)).rejects.toMatchObject({ code: "INVALID_IMAGE" });
  });
  it("fully decodes instead of trusting a plausible JPEG header", async () => {
    const truncated = (await fixture("intact-smartphone.jpg")).subarray(0, 4000);
    await expect(prepareImage(truncated)).rejects.toMatchObject({ code: "INVALID_IMAGE" });
  });
  it("revalidates digest, dimensions, syntax and actual thumbnail content", async () => {
    const image = await prepareImage(await fixture("valid.webp"));
    const wrongFormat = await sharp(bytes(image.thumbnailDataUrl)).png().toBuffer();
    for (const change of [
      { sha256: "0".repeat(64) }, { width: image.width - 1 }, { imageDataUrl: "https://example.test/image.jpg" },
      { thumbnailDataUrl: encoded(wrongFormat) }, { imageDataUrl: encoded(Buffer.from("not JPEG")), byteLength: 8 },
    ]) await expect(validatePreparedImage({ ...image, ...change })).rejects.toMatchObject({ code: "INVALID_IMAGE" });
  });
  it("rejects source metadata and excessive actual thumbnail dimensions", async () => {
    const image = await prepareImage(await fixture("valid.webp"));
    const withMetadata = await sharp(bytes(image.imageDataUrl)).withExif({ IFD0: { Artist: "private source" } }).jpeg().toBuffer();
    await expect(validatePreparedImage({ ...image, imageDataUrl: encoded(withMetadata), byteLength: withMetadata.length, sha256: digest(withMetadata) })).rejects.toMatchObject({ code: "INVALID_IMAGE" });
    const largeThumb = await sharp({ create: { width: 513, height: 10, channels: 3, background: "white" } }).jpeg().toBuffer();
    await expect(validatePreparedImage({ ...image, thumbnailDataUrl: encoded(largeThumb) })).rejects.toMatchObject({ code: "INVALID_IMAGE" });
  });
  it("rejects valid-header truncated raster content and actual oversized analysis dimensions", async () => {
    const image = await prepareImage(await fixture("valid.webp"));
    const truncated = bytes(image.imageDataUrl).subarray(0, Math.floor(image.byteLength / 2));
    await expect(validatePreparedImage({ ...image, imageDataUrl: encoded(truncated), byteLength: truncated.length, sha256: digest(truncated) })).rejects.toMatchObject({ code: "INVALID_IMAGE" });
    const tooWide = await sharp({ create: { width: 2049, height: 1, channels: 3, background: "white" } }).jpeg().toBuffer();
    await expect(validatePreparedImage({ ...image, imageDataUrl: encoded(tooWide), byteLength: tooWide.length, sha256: digest(tooWide) })).rejects.toMatchObject({ code: "INVALID_IMAGE" });
  });
});
