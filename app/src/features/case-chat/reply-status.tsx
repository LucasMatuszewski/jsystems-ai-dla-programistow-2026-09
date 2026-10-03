import type { Ref } from "react";
import { Button } from "@/components/ui/button";
export function ReplyStatus({ waiting, onRetry, buttonRef }: { waiting: boolean; onRetry: () => void; buttonRef?: Ref<HTMLButtonElement> }) {
  return <div className="flex min-w-0 flex-wrap gap-3"><Button ref={buttonRef} type="button" variant="outline" disabled={waiting} onClick={onRetry}>Ponów odpowiedź</Button></div>;
}
