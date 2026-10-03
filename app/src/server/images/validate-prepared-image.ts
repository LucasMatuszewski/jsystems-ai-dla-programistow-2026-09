import "server-only";
import { createHash } from "node:crypto";
import { MAX_PREPARED_IMAGE_DIMENSION, MAX_THUMBNAIL_DIMENSION, preparedImageSchema, type PreparedImage } from "../../lib/contracts/image";
import { runImageProcessing, type ImageProcessingOptions } from "./prepare-image";
import { CallerCancelledError, OperationError } from "../http/errors";

export interface ValidatedPreparedImage { image: PreparedImage; imageBuffer: Buffer; thumbnailBuffer: Buffer }

/** Request-body byte bounds belong to the route; this verifies the actual supplied JPEG content. */
export async function validatePreparedImage(input: unknown, options: ImageProcessingOptions = {}): Promise<ValidatedPreparedImage> {
  const parsed = preparedImageSchema.safeParse(input);
  if (!parsed.success) throw new OperationError("INVALID_IMAGE");
  const image = parsed.data;
  return runImageProcessing(options, async context => {
    const imageBuffer = Buffer.from(image.imageDataUrl.slice("data:image/jpeg;base64,".length), "base64");
    const thumbnailBuffer = Buffer.from(image.thumbnailDataUrl.slice("data:image/jpeg;base64,".length), "base64");
    if (imageBuffer.length !== image.byteLength || createHash("sha256").update(imageBuffer).digest("hex") !== image.sha256.toLowerCase()) throw new OperationError("INVALID_IMAGE");
    for (const [buffer, bound, dimensions] of [[imageBuffer, MAX_PREPARED_IMAGE_DIMENSION, [image.width, image.height]], [thumbnailBuffer, MAX_THUMBNAIL_DIMENSION, undefined]] as const) {
      try {
        const decoder = context.open(buffer, bound * bound);
        const metadata = await decoder.metadata();
        context.checkpoint();
        if (metadata.format !== "jpeg" || !metadata.width || !metadata.height || metadata.width > bound || metadata.height > bound || (metadata.pages ?? 1) !== 1 ||
          metadata.exif || metadata.icc || metadata.iptc || metadata.xmp || metadata.orientation || metadata.comments?.length ||
          (dimensions && (metadata.width !== dimensions[0] || metadata.height !== dimensions[1]))) throw new OperationError("INVALID_IMAGE");
        // Full bounded raster decode rejects header-only and truncated payloads without trusting metadata.
        await decoder.raw().toBuffer();
        context.checkpoint();
      } catch (error) {
        context.checkpoint();
        if (error instanceof CallerCancelledError || (error instanceof OperationError && error.code === "OPERATION_TIMEOUT")) throw error;
        if (error instanceof Error && /timeout/i.test(error.message)) throw new OperationError("OPERATION_TIMEOUT");
        throw new OperationError("INVALID_IMAGE");
      }
    }
    return { image, imageBuffer, thumbnailBuffer };
  });
}
