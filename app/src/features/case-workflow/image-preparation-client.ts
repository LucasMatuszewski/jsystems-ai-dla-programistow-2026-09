import { preparedImageSchema, type PreparedImage } from "../../lib/contracts/image";
import { errorEnvelopeSchema, type ErrorCode } from "../../lib/contracts/errors";
export type ImageFileScreen = { status: "valid"; file: File } | { status: "invalid"; message: string };
export type ImagePreparationResult = { status: "prepared"; preparedImage: PreparedImage } | { status: "failed"; message: string; retryable: boolean; code?: ErrorCode } | { status: "aborted" };
export function screenEquipmentImageFiles(files: readonly File[]): ImageFileScreen {
  if (files.length !== 1) return { status: "invalid", message: "Wybierz dokładnie jedno zdjęcie sprzętu." };
  const file = files[0];
  if (file.size > 10000000) return { status: "invalid", message: "Zdjęcie może mieć maksymalnie 10 MB. Wybierz mniejszy plik." };
  const supported = ["image/jpeg", "image/png", "image/webp"].includes(file.type) || (!file.type && /\.(jpe?g|png|webp)$/i.test(file.name));
  if (!supported) return { status: "invalid", message: "Wybierz zdjęcie w formacie JPG, PNG lub WebP." };
  return { status: "valid", file };
}
const failed = (): ImagePreparationResult => ({ status: "failed", message: "Nie udało się przygotować zdjęcia. Spróbuj ponownie.", retryable: true });
export async function prepareEquipmentImage(file: File, { signal }: { signal: AbortSignal }): Promise<ImagePreparationResult> {
  if (signal.aborted) return { status: "aborted" };
  const screened = screenEquipmentImageFiles([file]);
  if (screened.status === "invalid") return { status: "failed", message: screened.message, retryable: false };
  try {
    const body = new FormData(); body.append("image", file);
    const response = await fetch("/api/images/prepare", { method: "POST", body, signal, cache: "no-store" });
    if (signal.aborted) return { status: "aborted" };
    const payload: unknown = await response.json();
    if (signal.aborted) return { status: "aborted" };
    if (!response.ok) {
      const error = errorEnvelopeSchema.safeParse(payload);
      return error.success ? { status: "failed", message: error.data.message, retryable: error.data.retryable, code: error.data.code } : failed();
    }
    const prepared = preparedImageSchema.safeParse(payload);
    return prepared.success ? { status: "prepared", preparedImage: prepared.data } : failed();
  } catch (error) {
    return signal.aborted || (error instanceof DOMException && error.name === "AbortError") ? { status: "aborted" } : failed();
  }
}
