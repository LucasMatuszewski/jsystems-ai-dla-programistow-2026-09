import { useId, type Ref } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { PreparedImage } from "../../lib/contracts/image";
export type ImagePickerState = { status: "empty" } | { status: "pending" } | { status: "ready"; preparedImage: PreparedImage } | { status: "failed"; message: string; retryable: boolean } | { status: "interrupted"; message: string };
export interface EquipmentImagePickerProps {
  state: ImagePickerState; onSelect: (files: readonly File[]) => void; onRemove: () => void; onRetry: () => void;
  inputRef?: Ref<HTMLInputElement>; validationError?: string; disabled?: boolean;
}
export function EquipmentImagePicker({ state, onSelect, onRemove, onRetry, inputRef, validationError, disabled = false }: EquipmentImagePickerProps) {
  const id = useId(); const helpId = `${id}-help`; const errorId = `${id}-error`;
  const failure = state.status === "failed" || state.status === "interrupted" ? state.message : null;
  const error = [failure, validationError].filter(Boolean).join(" ");
  return <fieldset className="grid min-w-0 gap-3" disabled={disabled}>
    <legend className="mb-2">Zdjęcie sprzętu</legend>
    <Label htmlFor={id} className="sr-only">Zdjęcie sprzętu</Label>
    <div className="relative flex min-h-10 w-fit max-w-full items-center rounded-[2px] border border-input bg-card px-4 py-2 focus-within:outline-2 focus-within:outline-ring focus-within:outline-offset-3">
      <span aria-hidden="true">Wybierz zdjęcie</span>
      <Input id={id} ref={inputRef} type="file" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
        className="absolute inset-0 h-full w-full min-w-0 cursor-pointer opacity-0" aria-invalid={error ? true : undefined} aria-describedby={`${helpId}${error ? ` ${errorId}` : ""}`}
        onChange={event => { const files = Array.from(event.currentTarget.files ?? []); event.currentTarget.value = ""; if (files.length) onSelect(files); }} />
    </div>
    <p id={helpId} className="text-sm text-muted-foreground">Wybierz jedno zdjęcie w formacie JPG, PNG lub WebP, maksymalnie 10 MB.</p>
    {error && <p id={errorId} className="text-sm text-destructive">{error}</p>}
    {state.status === "pending" && <p role="status">Trwa przygotowywanie zdjęcia.</p>}
    {state.status === "ready" && <>
      <Image src={state.preparedImage.thumbnailDataUrl} alt="Podgląd wybranego zdjęcia sprzętu" width={state.preparedImage.width} height={state.preparedImage.height}
        unoptimized className="max-h-64 w-auto max-w-full object-contain" />
      <p role="status">Zdjęcie jest gotowe.</p>
    </>}
    <div className="flex flex-wrap gap-3">
      {state.status !== "empty" && <Button type="button" variant="outline" onClick={onRemove}>Usuń zdjęcie</Button>}
      {state.status === "failed" && state.retryable && <Button type="button" onClick={onRetry}>Spróbuj ponownie</Button>}
    </div>
  </fieldset>;
}
