import type { ActiveCaseSnapshot } from "@/lib/contracts/session";
import type { InitialWorkflowView } from "./initial-workflow-controller";
import { Button } from "@/components/ui/button";
export type ProcessingStepsProps = { snapshot: ActiveCaseSnapshot; view: InitialWorkflowView; onReturnToForm: () => void; onRetry: () => void };

const stages = [{ kind: "preparation", label: "Przygotowanie zdjęcia" }, { kind: "analysis", label: "Analiza stanu sprzętu" }, { kind: "decision", label: "Przygotowanie oceny" }] as const;
export function ProcessingSteps({ snapshot, view, onReturnToForm, onRetry }: ProcessingStepsProps) {
  const currentIndex = stages.findIndex(item => item.kind === snapshot.stage);
  const label = stages[currentIndex]?.label ?? "Przygotowanie wstępnej oceny";
  return <section aria-labelledby="processing-title" className="mt-6 grid max-w-[800px] min-w-0 gap-6 rounded-[16px] border bg-card p-4 sm:p-6">
    <h2 id="processing-title" className="text-2xl font-normal">Przygotowanie wstępnej oceny</h2>
    {snapshot.submittedForm && <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{snapshot.submittedForm.equipmentName}</p>}
    <ol className="grid gap-4">{stages.map((item, index) => {
      const complete = (index === 0 && snapshot.preparedImage !== null) || (index === 1 && snapshot.imageAnalysis !== null) || (index === 2 && snapshot.initialDecision !== null);
      const current = index === currentIndex && !complete;
      const state = complete ? "Ukończono" : current && view.error ? "Błąd" : current && snapshot.stageStatus === "interrupted" ? "Przerwano" : current && view.pending ? "W trakcie" : "Nie rozpoczęto";
      return <li key={item.kind} aria-current={current ? "step" : undefined} className={`flex min-w-0 flex-wrap items-center justify-between gap-2 border-l-4 p-3 ${current ? "border-primary bg-[#fff3e8]" : "border-border bg-background"}`}><span>{item.label}</span><span className="text-sm">{state}</span></li>;
    })}</ol>
    <p role="status" aria-live="polite" aria-atomic="true" className="text-sm">{view.error ? view.error.message : snapshot.stageStatus === "interrupted" ? snapshot.preparedImage ? `${label} — przerwano. Wznów sprawę, aby kontynuować.` : `${label} — przerwano. Wróć do formularza i wybierz zdjęcie ponownie.` : view.pending ? `${label} — w trakcie.` : ""}</p>
    <div className="flex flex-wrap gap-3">
      {!view.pending && (view.error?.retryable || (snapshot.stageStatus === "interrupted" && snapshot.preparedImage !== null)) && <Button type="button" onClick={onRetry}>Spróbuj ponownie</Button>}
      <Button type="button" variant="outline" onClick={onReturnToForm}>Wróć do formularza</Button>
    </div>
  </section>;
}
