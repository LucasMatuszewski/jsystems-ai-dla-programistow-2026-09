import { Button } from "@/components/ui/button";
export function ReplyStatus({ waiting, onRetry }: { waiting: boolean; onRetry: () => void }) {
  return <div className="flex min-w-0 flex-wrap gap-3"><Button type="button" variant="outline" disabled={waiting} onClick={onRetry}>Ponów odpowiedź</Button></div>;
}
