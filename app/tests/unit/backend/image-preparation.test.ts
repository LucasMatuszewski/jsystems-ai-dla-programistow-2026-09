import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ sharp: vi.fn(), hash: vi.fn(), parse: vi.fn(), deadline: vi.fn() }));
vi.mock("sharp", () => ({ default: mocks.sharp }));
vi.mock("node:crypto", () => ({ createHash: mocks.hash }));
vi.mock("../../../src/lib/contracts/image", () => ({ MAX_PREPARED_IMAGE_BYTES: 4_000_000, MAX_PREPARED_IMAGE_DIMENSION: 2048, MAX_THUMBNAIL_DIMENSION: 512, preparedImageSchema: { safeParse: mocks.parse } }));
vi.mock("../../../src/server/ai/deadline", () => ({ createOperationDeadline: mocks.deadline }));
vi.mock("../../../src/server/http/errors", () => ({
  OperationError: class extends Error { constructor(public code: string) { super(code); } },
  CallerCancelledError: class extends Error {},
}));
import { prepareImage } from "../../../src/server/images/prepare-image";
import { validatePreparedImage } from "../../../src/server/images/validate-prepared-image";
import { getErrorStatus } from "@/lib/contracts/errors";

function pipeline(meta: object = { format: "jpeg", width: 100, height: 50, pages: 1 }, data = Buffer.from("jpeg")) {
  const engine = {
    metadata: vi.fn().mockResolvedValue(meta), autoOrient: vi.fn(), resize: vi.fn(), flatten: vi.fn(), jpeg: vi.fn(), timeout: vi.fn(), destroy: vi.fn(), raw: vi.fn(),
    toBuffer: vi.fn().mockResolvedValue({ data, info: { width: 100, height: 50, channels: 3 } }),
  };
  for (const method of ["autoOrient", "resize", "flatten", "jpeg", "timeout", "raw"] as const) engine[method].mockReturnValue(engine);
  return engine;
}

describe("image processing orchestration with all collaborators mocked", () => {
  let controller: AbortController;
  beforeEach(() => {
    controller = new AbortController();
    mocks.deadline.mockReturnValue({ signal: controller.signal, remainingMs: () => 30_000, dispose: vi.fn() });
    const hash = { update: vi.fn(), digest: vi.fn().mockReturnValue("a".repeat(64)) }; hash.update.mockReturnValue(hash); mocks.hash.mockReturnValue(hash);
    mocks.parse.mockImplementation((data: unknown) => ({ success: true, data }));
    mocks.sharp.mockImplementation(() => pipeline());
  });
  afterEach(() => vi.useRealTimers());
  it("rejects too many bytes before creating a decoder", async () => {
    await expect(prepareImage(Buffer.alloc(10_000_001))).rejects.toMatchObject({ code: "PAYLOAD_LIMIT" });
    expect(mocks.sharp).not.toHaveBeenCalled();
  });
  it("sets pixel guard at construction and exact canonical single encode parameters", async () => {
    const source = pipeline(); const thumb = pipeline(); mocks.sharp.mockReturnValueOnce(source).mockReturnValueOnce(thumb);
    const image = await prepareImage(Buffer.from("input"));
    expect(mocks.sharp.mock.calls[0][1]).toMatchObject({ limitInputPixels: 64_000_000, failOn: "warning" });
    expect(source.autoOrient).toHaveBeenCalledOnce();
    expect(source.resize).toHaveBeenCalledExactlyOnceWith(2048, 2048, { fit: "inside", withoutEnlargement: true });
    expect(source.flatten).toHaveBeenCalledExactlyOnceWith({ background: "#ffffff" });
    expect(source.jpeg).toHaveBeenCalledExactlyOnceWith({ quality: 85 });
    expect(thumb.resize).toHaveBeenCalledExactlyOnceWith(512, 512, { fit: "inside", withoutEnlargement: true });
    expect(thumb.jpeg).toHaveBeenCalledExactlyOnceWith({ quality: 70 });
    expect(image).toMatchObject({ width: 100, height: 50, byteLength: 4, sha256: "a".repeat(64) });
  });
  it.each([{ format: "gif", width: 1, height: 1 }, { format: "webp", width: 1, height: 1, pages: 2 }, { format: "jpeg", width: 0, height: 1 }])("rejects unsafe decoded metadata before rasterization", async meta => {
    const source = pipeline(meta); mocks.sharp.mockReturnValue(source);
    await expect(prepareImage(Buffer.from("input"))).rejects.toMatchObject({ code: "INVALID_IMAGE" });
    expect(source.toBuffer).not.toHaveBeenCalled();
  });
  it("blocks excess output bytes without fallback, thumbnailing or second encoding", async () => {
    const source = pipeline(undefined, Buffer.alloc(4_000_001)); mocks.sharp.mockReturnValue(source);
    await expect(prepareImage(Buffer.from("input"))).rejects.toMatchObject({ code: "IMAGE_PROCESSING_LIMIT" });
    expect(source.jpeg).toHaveBeenCalledTimes(1); expect(mocks.sharp).toHaveBeenCalledTimes(1);
  });
  it("maps unexpected encoder failures to safe retryable processing code", async () => {
    const source = pipeline(); source.toBuffer.mockRejectedValue(new Error("private libvips encoder stack")); mocks.sharp.mockReturnValue(source);
    await expect(prepareImage(Buffer.from("input"))).rejects.toMatchObject({ code: "IMAGE_PROCESSING_ERROR" });
    try { await prepareImage(Buffer.from("input")); } catch (error) { expect(String(error)).not.toContain("private"); }
  });
  it("preserves a native metadata timeout as safe504 even before the outer deadline aborts", async () => {
    const source = pipeline(); source.metadata.mockRejectedValue(new Error("private native metadata timeout")); mocks.sharp.mockReturnValue(source);
    expect(controller.signal.aborted).toBe(false);
    await expect(prepareImage(Buffer.from("input"))).rejects.toMatchObject({ code: "OPERATION_TIMEOUT" });
    expect(getErrorStatus("OPERATION_TIMEOUT")).toBe(504);
    expect(source.toBuffer).not.toHaveBeenCalled();
  });
  it("does not publish any output after deadline abort and destroys active decoder", async () => {
    const source = pipeline(); source.toBuffer.mockReturnValue(new Promise(() => {})); mocks.sharp.mockReturnValue(source);
    const operation = prepareImage(Buffer.from("input"));
    await Promise.resolve(); await Promise.resolve();
    controller.abort(Object.assign(new Error("safe"), { code: "OPERATION_TIMEOUT" }));
    await expect(operation).rejects.toMatchObject({ code: "OPERATION_TIMEOUT" });
    expect(source.destroy).toHaveBeenCalled();
  });
  it("rejects malformed prepared schema before allocating decoder buffers", async () => {
    mocks.parse.mockReturnValue({ success: false });
    await expect(validatePreparedImage({ imageDataUrl: "https://example.test" })).rejects.toMatchObject({ code: "INVALID_IMAGE" });
    expect(mocks.sharp).not.toHaveBeenCalled();
  });
});
