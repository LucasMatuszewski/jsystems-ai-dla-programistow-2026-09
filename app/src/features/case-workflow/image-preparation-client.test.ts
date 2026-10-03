import { beforeEach, describe, expect, it, vi } from "vitest";
import { prepareEquipmentImage, screenEquipmentImageFiles } from "./image-preparation-client";
const mocks = vi.hoisted(() => ({ prepared: vi.fn(), error: vi.fn() }));
vi.mock("../../lib/contracts/image", () => ({ preparedImageSchema: { safeParse: mocks.prepared } }));
vi.mock("../../lib/contracts/errors", () => ({ errorEnvelopeSchema: { safeParse: mocks.error } }));
const prepared = { imageDataUrl: "normalized", thumbnailDataUrl: "thumbnail", byteLength: 1, width: 1, height: 1, sha256: "digest" };
const fetchMock = vi.fn();
beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock); fetchMock.mockReset();
  mocks.prepared.mockImplementation(data => ({ success: true, data }));
  mocks.error.mockImplementation(data => ({ success: true, data }));
});
describe("one image preparation request", () => {
  it("requires exactly one JPG/PNG/WebP within the decimal 10MB bound", () => {
    const file = new File(["image"], "image.png", { type: "image/png" });
    expect(screenEquipmentImageFiles([])).toMatchObject({ status: "invalid" });
    expect(screenEquipmentImageFiles([file, file])).toMatchObject({ status: "invalid" });
    expect(screenEquipmentImageFiles([new File(["text"], "text.txt", { type: "text/plain" })])).toMatchObject({ status: "invalid" });
    expect(screenEquipmentImageFiles([new File(["image"], "image.webp")])).toEqual({ status: "valid", file: expect.any(File) });
    Object.defineProperty(file, "size", { value: 10000001 });
    expect(screenEquipmentImageFiles([file])).toMatchObject({ status: "invalid" });
  });
  it("sends one native multipart image and accepts the exact normalized response without extra IDs/headers", async () => {
    const file = new File(["image"], "image.png", { type: "image/png" });
    const signal = new AbortController().signal;
    fetchMock.mockResolvedValue({ ok: true, json: async () => prepared });
    expect(await prepareEquipmentImage(file, { signal })).toEqual({ status: "prepared", preparedImage: prepared });
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/images/prepare"); expect(options.method).toBe("POST"); expect(options.signal).toBe(signal);
    expect(options.headers).toBeUndefined(); expect(Array.from((options.body as FormData).keys())).toEqual(["image"]);
    expect((options.body as FormData).get("image")).toBe(file);
    expect(mocks.prepared).toHaveBeenCalledWith(prepared);
  });
  it("accepts the exact size boundary but screens unsupported files before network", async () => {
    const file = new File(["image"], "image.jpg", { type: "image/jpeg" }); Object.defineProperty(file, "size", { value: 10000000 });
    expect(screenEquipmentImageFiles([file])).toEqual({ status: "valid", file });
    expect(await prepareEquipmentImage(new File(["text"], "file.txt", { type: "text/plain" }), { signal: new AbortController().signal })).toMatchObject({ status: "failed", retryable: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("rejects malformed successful prepared output instead of declaring the image usable", async () => {
    mocks.prepared.mockReturnValue({ success: false }); fetchMock.mockResolvedValue({ ok: true, json: async () => ({ preparedImage: prepared }) });
    expect(await prepareEquipmentImage(new File(["image"], "image.png", { type: "image/png" }), { signal: new AbortController().signal })).toMatchObject({ status: "failed", retryable: true });
  });
  it("shows the canonical backend error with its independent operation identity", async () => {
    const error = { code: "IMAGE_PROCESSING_ERROR", message: "Nie udało się przygotować obrazu. Spróbuj ponownie.", retryable: true, operationId: "10757999-692e-4eb4-b12c-f96050b4e42e" };
    fetchMock.mockResolvedValue({ ok: false, json: async () => error });
    expect(await prepareEquipmentImage(new File(["image"], "image.png", { type: "image/png" }), { signal: new AbortController().signal })).toMatchObject({ status: "failed", message: error.message, code: error.code, retryable: true });
  });
  it("handles unreadable error/network responses safely without raw diagnostics", async () => {
    mocks.error.mockReturnValue({ success: false }); fetchMock.mockResolvedValue({ ok: false, json: async () => ({ secret: "raw details" }) });
    const file = new File(["image"], "image.png", { type: "image/png" }); const options = { signal: new AbortController().signal };
    expect(await prepareEquipmentImage(file, options)).toMatchObject({ status: "failed", retryable: true });
    fetchMock.mockRejectedValue(new Error("private network diagnostics"));
    const result = await prepareEquipmentImage(file, options);
    expect(result).toMatchObject({ status: "failed", retryable: true });
    expect(JSON.stringify(result)).not.toContain("private");
  });
  it("treats cancellation as cancellation before fetch and after a late response", async () => {
    const file = new File(["image"], "image.png", { type: "image/png" }); const controller = new AbortController(); controller.abort();
    expect(await prepareEquipmentImage(file, { signal: controller.signal })).toEqual({ status: "aborted" }); expect(fetchMock).not.toHaveBeenCalled();
    const next = new AbortController(); fetchMock.mockImplementation(async () => { next.abort(); return { ok: true, json: async () => prepared }; });
    expect(await prepareEquipmentImage(file, { signal: next.signal })).toEqual({ status: "aborted" });
  });
});
