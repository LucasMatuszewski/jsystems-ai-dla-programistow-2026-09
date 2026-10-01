import { z } from "zod";

export const MAX_PREPARED_IMAGE_BYTES = 4_000_000;
export const MAX_PREPARED_IMAGE_DIMENSION = 2048;
export const MAX_THUMBNAIL_DIMENSION = 512;
export const IMAGE_CONTRACT_REVISION = 1 as const;
export const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/i);

// Only encoding syntax and declared length: actual JPEG decode/digest/dimensions are server checks.
export function getJpegDataUrlByteLength(value: string): number | null {
  const prefix = "data:image/jpeg;base64,";
  if (!value.startsWith(prefix)) return null;
  const encoded = value.slice(prefix.length);
  if (!encoded.length || encoded.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) return null;
  return encoded.length / 4 * 3 - (encoded.endsWith("==") ? 2 : encoded.endsWith("=") ? 1 : 0);
}
const jpegDataUrlSchema = z.string().refine((value) => getJpegDataUrlByteLength(value) !== null, { error: "Nieprawidłowy zapis obrazu JPEG." });
export const preparedImageSchema = z.strictObject({
  imageDataUrl: jpegDataUrlSchema, thumbnailDataUrl: jpegDataUrlSchema,
  byteLength: z.number().int().min(1).max(MAX_PREPARED_IMAGE_BYTES),
  width: z.number().int().min(1).max(MAX_PREPARED_IMAGE_DIMENSION),
  height: z.number().int().min(1).max(MAX_PREPARED_IMAGE_DIMENSION), sha256: sha256Schema,
}).superRefine((value, context) => {
  const length = getJpegDataUrlByteLength(value.imageDataUrl);
  if (length !== null && length !== value.byteLength) {
    context.addIssue({ code: "custom", path: ["byteLength"], message: "Rozmiar nie zgadza się z zakodowanym obrazem." });
  }
  if (length !== null && length > MAX_PREPARED_IMAGE_BYTES) {
    context.addIssue({ code: "custom", path: ["imageDataUrl"], message: "Przygotowany obraz przekracza limit rozmiaru." });
  }
});
export type PreparedImage = z.infer<typeof preparedImageSchema>;
