import { describe, expect, it } from "vitest";
import { preparedImageSchema } from "@/lib/contracts/image";

const valid = {
  imageDataUrl: "data:image/jpeg;base64,/9j/2Q==", thumbnailDataUrl: "data:image/jpeg;base64,/9j/2Q==",
  byteLength: 4, width: 1, height: 1, sha256: "a".repeat(64),
};

describe("prepared JPEG contract", () => {
  it("accepts syntax and declared metadata without claiming actual decode or digest verification", () => {
    expect(preparedImageSchema.safeParse(valid).success).toBe(true);
  });
  it.each([
    ["remote image", { imageDataUrl: "https://example.com/image.jpg" }],
    ["remote thumbnail", { thumbnailDataUrl: "https://example.com/image.jpg" }],
    ["PNG data", { imageDataUrl: "data:image/png;base64,/9j/2Q==" }],
    ["PNG thumbnail", { thumbnailDataUrl: "data:image/png;base64,/9j/2Q==" }],
    ["noncanonical MIME", { imageDataUrl: "data:image/jpg;base64,/9j/2Q==" }],
    ["empty encoded data", { imageDataUrl: "data:image/jpeg;base64," }],
    ["invalid alphabet", { imageDataUrl: "data:image/jpeg;base64,@@@@" }],
    ["invalid padding", { imageDataUrl: "data:image/jpeg;base64,A===" }],
    ["incomplete quartet", { imageDataUrl: "data:image/jpeg;base64,AAA" }],
    ["embedded whitespace", { imageDataUrl: "data:image/jpeg;base64,/9j/ 2Q==" }],
    ["declared length mismatch", { byteLength: 5 }],
    ["zero length", { byteLength: 0 }],
    ["fractional length", { byteLength: 4.5 }],
    ["over byte limit", { byteLength: 4_000_001 }],
    ["zero width", { width: 0 }],
    ["over width", { width: 2049 }],
    ["fractional height", { height: 1.5 }],
    ["over height", { height: 2049 }],
    ["invalid digest", { sha256: "g".repeat(64) }],
    ["short digest", { sha256: "a".repeat(63) }],
    ["extra remote property", { originalUrl: "https://example.com/image.jpg" }],
  ])("rejects %s", (_label, patch) => {
    expect(preparedImageSchema.safeParse({ ...valid, ...patch }).success).toBe(false);
  });
  it.each(Object.keys(valid))("requires %s", (field) => {
    const input: Record<string, unknown> = { ...valid };
    delete input[field];
    expect(preparedImageSchema.safeParse(input).success).toBe(false);
  });
  it("accepts exact inclusive analysis byte and dimension bounds", () => {
    const imageDataUrl = `data:image/jpeg;base64,${"A".repeat(5_333_332)}AA==`;
    expect(preparedImageSchema.safeParse({ ...valid, imageDataUrl, byteLength: 4_000_000, width: 2048, height: 2048 }).success).toBe(true);
  });
});
