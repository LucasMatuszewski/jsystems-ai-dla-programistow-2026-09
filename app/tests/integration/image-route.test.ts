import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { POST, runtime } from "@/app/api/images/prepare/route";
import { preparedImageSchema } from "@/lib/contracts/image";
import { errorEnvelopeSchema } from "@/lib/contracts/errors";
import { APP_ORIGIN } from "./app-origin";

const origin = `${APP_ORIGIN}/api/images/prepare`;
const fixture = (name: string) => readFile(resolve("tests/fixtures/images", name));
function multipart(form: FormData, signal?: AbortSignal) { return new Request(origin, { method: "POST", body: form, signal }); }
async function imageForm(name = "transparent.png") {
  const form = new FormData(); form.append("image", new Blob([new Uint8Array(await fixture(name))], { type: "application/octet-stream" }), "private-path.not-image"); return form;
}
async function expectSafeError(response: Response, status: number, code: string) {
  expect(response.status).toBe(status); expect(response.headers.get("cache-control")).toBe("no-store");
  const body = await response.json(); expect(errorEnvelopeSchema.safeParse(body).success).toBe(true);
  expect(body.code).toBe(code); expect(Object.keys(body).sort()).toEqual(["code", "message", "operationId", "retryable"]);
  expect(JSON.stringify(body).includes("private")).toBe(false);
  return body;
}
describe("real image preparation POST endpoint", () => {
  it("prepares a real upload through the running Next HTTP boundary", async () => {
    const response = await fetch(origin, { method: "POST", body: await imageForm("intact-smartphone.jpg"), signal: AbortSignal.timeout(35000) });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const output = preparedImageSchema.parse(await response.json());
    const jpeg = Buffer.from(output.imageDataUrl.split(",")[1], "base64");
    expect((await sharp(jpeg).metadata()).format).toBe("jpeg");
    expect(output.sha256).toBe(createHash("sha256").update(jpeg).digest("hex"));
  }, 40000);
  it("runs in Node and returns the actual normalized JPEG contract independent of filename/MIME", async () => {
    expect(runtime).toBe("nodejs");
    const response = await POST(multipart(await imageForm()));
    expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("no-store");
    const output = await response.json(); expect(preparedImageSchema.safeParse(output).success).toBe(true);
    const bytes = Buffer.from(output.imageDataUrl.split(",")[1], "base64"); const metadata = await sharp(bytes).metadata();
    expect(metadata.format).toBe("jpeg"); expect(metadata.width! <= 2048 && metadata.height! <= 2048).toBe(true);
    expect(output.sha256).toBe(createHash("sha256").update(bytes).digest("hex"));
    expect(output.byteLength).toBe(bytes.length); expect(metadata.exif).toBeUndefined();
    const thumbnail = await sharp(Buffer.from(output.thumbnailDataUrl.split(",")[1], "base64")).metadata();
    expect(thumbnail.width! <= 512 && thumbnail.height! <= 512).toBe(true);
    expect(JSON.stringify(output).includes("private-path")).toBe(false);
  });
  it("requires exactly one real file under image", async () => {
    const empty = new FormData(); await expectSafeError(await POST(multipart(empty)), 422, "INVALID_IMAGE");
    const text = new FormData(); text.append("image", "private"); await expectSafeError(await POST(multipart(text)), 422, "INVALID_IMAGE");
    const wrong = new FormData(); wrong.append("photo", new Blob([new Uint8Array(await fixture("transparent.png"))])); await expectSafeError(await POST(multipart(wrong)), 422, "INVALID_IMAGE");
  });
  it.each(["second-image", "other-file", "text-instructions"])("rejects multipart addition %s", async addition => {
    const form = await imageForm();
    if (addition === "text-instructions") form.append("instructions", "private");
    else form.append(addition === "second-image" ? "image" : "other", new Blob([new Uint8Array([1])]));
    await expectSafeError(await POST(multipart(form)), 422, "INVALID_IMAGE");
  });
  it.each(["corrupt.bin", "animated.webp"])("rejects actual decoded %s input", async name => {
    await expectSafeError(await POST(multipart(await imageForm(name))), 422, "INVALID_IMAGE");
  });
  it("reports actual pixel processing bounds as413", async () => {
    await expectSafeError(await POST(multipart(await imageForm("pixel-limit.png"))), 413, "IMAGE_PROCESSING_LIMIT");
  });
  it("rejects raw image bytes over10000000 before any decoding", async () => {
    const form = new FormData(); form.append("image", new Blob([new Uint8Array(10000001)]), "private.jpg");
    await expectSafeError(await POST(multipart(form)), 413, "PAYLOAD_LIMIT");
  });
  it("bounds streamed multipart body without Content-Length before parsing", async () => {
    let cancelled = false;
    const chunk = new Uint8Array(3000000);
    const body = new ReadableStream<Uint8Array>({ start(controller) { for (let index = 0; index < 4; index++) controller.enqueue(chunk); }, cancel() { cancelled = true; } });
    const init: RequestInit & { duplex: "half" } = { method: "POST", body, duplex: "half", headers: { "Content-Type": "multipart/form-data; boundary=fixture" } };
    await expectSafeError(await POST(new Request(origin, init)), 413, "PAYLOAD_LIMIT"); expect(cancelled).toBe(true);
  });
  it("rejects wrong media type and malformed multipart as safe400", async () => {
    await expectSafeError(await POST(new Request(origin, { method: "POST", body: '{"private":"value"}', headers: { "Content-Type": "application/json" } })), 400, "VALIDATION_ERROR");
    await expectSafeError(await POST(new Request(origin, { method: "POST", body: "private malformed", headers: { "Content-Type": "multipart/form-data; boundary=fixture" } })), 400, "VALIDATION_ERROR");
  });
  it("returns only transport cleanup408 for an actual cancelled caller", async () => {
    const caller = new AbortController();
    const body = new ReadableStream<Uint8Array>();
    const init: RequestInit & { duplex: "half" } = { method: "POST", body, duplex: "half", signal: caller.signal, headers: { "Content-Type": "multipart/form-data; boundary=fixture" } };
    const pending = POST(new Request(origin, init)); caller.abort(); const response = await pending;
    expect(response.status).toBe(408); expect(response.headers.get("cache-control")).toBe("no-store"); expect(await response.text()).toBe("");
  });
  it("keeps a connected stalled body deadline as canonical504 rather than caller cancellation", async () => {
    const body = new ReadableStream<Uint8Array>();
    const init: RequestInit & { duplex: "half" } = { method: "POST", body, duplex: "half", headers: { "Content-Type": "multipart/form-data; boundary=fixture" } };
    const response = await POST(new Request(origin, init)); await expectSafeError(response, 504, "OPERATION_TIMEOUT");
  }, 35000);
});
