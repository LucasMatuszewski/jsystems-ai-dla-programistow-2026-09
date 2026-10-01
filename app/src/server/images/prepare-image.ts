import "server-only";
import { createHash } from "node:crypto";
import sharp, { type Sharp } from "sharp";
import { MAX_PREPARED_IMAGE_BYTES, type PreparedImage } from "../../lib/contracts/image";
import { createOperationDeadline } from "../ai/deadline";
import { CallerCancelledError, OperationError } from "../http/errors";

export interface ImageProcessingOptions { signal?: AbortSignal; remainingBudgetMs?: number }

interface ImageProcessingContext { open(input: Buffer, maxPixels: number): Sharp; checkpoint(): void }

/** Whole-operation deadline includes queue time; native timeout and destroy are best-effort cleanup. */
export async function runImageProcessing<T>(options: ImageProcessingOptions, work: (context: ImageProcessingContext) => Promise<T>): Promise<T> {
  const deadline = createOperationDeadline("prepare", options.remainingBudgetMs, options.signal);
  const active = new Set<Sharp>();
  const cancellation = () => deadline.signal.reason instanceof CallerCancelledError || deadline.signal.reason instanceof OperationError
    ? deadline.signal.reason : new OperationError("OPERATION_TIMEOUT");
  const checkpoint = () => { if (deadline.signal.aborted) throw cancellation(); };
  let abort: () => void = () => {};
  const aborted = new Promise<never>((_, reject) => {
    abort = () => { for (const image of active) image.destroy(); reject(cancellation()); };
    deadline.signal.addEventListener("abort", abort, { once: true });
  });
  try {
    checkpoint();
    const result = await Promise.race([aborted, work({
      checkpoint,
      open(input, maxPixels) {
        checkpoint();
        const image = sharp(input, { limitInputPixels: maxPixels, failOn: "warning" });
        active.add(image);
        return image.timeout({ seconds: Math.max(1, Math.ceil(deadline.remainingMs() / 1000)) });
      },
    })]);
    checkpoint();
    return result;
  } catch (error) {
    if (deadline.signal.aborted) throw cancellation();
    if (error instanceof OperationError || error instanceof CallerCancelledError) throw error;
    if (error instanceof Error && /timeout/i.test(error.message)) throw new OperationError("OPERATION_TIMEOUT");
    throw new OperationError("IMAGE_PROCESSING_ERROR");
  } finally {
    deadline.signal.removeEventListener("abort", abort);
    deadline.dispose();
    for (const image of active) image.destroy();
  }
}

export async function prepareImage(input: Buffer, options: ImageProcessingOptions = {}): Promise<PreparedImage> {
  if (!Buffer.isBuffer(input) || input.length === 0) throw new OperationError("INVALID_IMAGE");
  if (input.length > 10_000_000) throw new OperationError("PAYLOAD_LIMIT");
  return runImageProcessing(options, async context => {
    const source = context.open(input, 64_000_000);
    let metadata;
    try { metadata = await source.metadata(); }
    catch (error) {
      context.checkpoint();
      if (error instanceof Error && /timeout/i.test(error.message)) throw new OperationError("OPERATION_TIMEOUT");
      if (error instanceof Error && /exceeds pixel limit/i.test(error.message)) throw new OperationError("IMAGE_PROCESSING_LIMIT");
      throw new OperationError("INVALID_IMAGE");
    }
    context.checkpoint();
    if (!["jpeg", "png", "webp"].includes(metadata.format ?? "") || !metadata.width || !metadata.height || (metadata.pages ?? 1) !== 1) throw new OperationError("INVALID_IMAGE");
    if (metadata.width * metadata.height > 64_000_000) throw new OperationError("IMAGE_PROCESSING_LIMIT");
    let normalized;
    try {
      normalized = await source.autoOrient().resize(2048, 2048, { fit: "inside", withoutEnlargement: true })
        .flatten({ background: "#ffffff" }).jpeg({ quality: 85 }).toBuffer({ resolveWithObject: true });
    } catch (error) {
      context.checkpoint();
      // Known input decoder failures only; never expose native messages or mislabel an encoder failure.
      if (error instanceof Error && /premature end|corrupt|invalid.*(?:jpeg|png|webp)|(?:jpeg|png|webp).*?(?:truncat|read error)|not enough.*data/i.test(error.message)) throw new OperationError("INVALID_IMAGE");
      throw error;
    }
    context.checkpoint();
    if (normalized.data.length > MAX_PREPARED_IMAGE_BYTES) throw new OperationError("IMAGE_PROCESSING_LIMIT");
    const thumbnail = await context.open(normalized.data, 2048 * 2048)
      .resize(512, 512, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 70 }).toBuffer({ resolveWithObject: true });
    context.checkpoint();
    return {
      imageDataUrl: `data:image/jpeg;base64,${normalized.data.toString("base64")}`,
      thumbnailDataUrl: `data:image/jpeg;base64,${thumbnail.data.toString("base64")}`,
      byteLength: normalized.data.length, width: normalized.info.width, height: normalized.info.height,
      sha256: createHash("sha256").update(normalized.data).digest("hex"),
    };
  });
}
