import type { InitialDecision } from "@/lib/contracts/decision";
import { FIRST_ASSESSMENT_NOTICE, OUTCOME_LABELS, RESALE_LABELS } from "@/lib/contracts/first-message";

function DecisionList({ heading, items }: { heading: string; items: string[] }) {
  return <section className="grid gap-2"><h2 className="text-lg font-medium">{heading}</h2>{items.length ? <ul className="list-disc space-y-2 pl-5">{items.map((item, index) => <li key={index} className="whitespace-pre-wrap [overflow-wrap:anywhere]">{item}</li>)}</ul> : <p className="text-muted-foreground">Brak wskazanych informacji.</p>}</section>;
}

export function InitialDecisionDetails({ decision }: { decision: InitialDecision }) {
  return <article aria-labelledby="initial-decision-title" className="grid min-w-0 gap-6 rounded-[16px] border bg-card p-4 text-base leading-relaxed [overflow-wrap:anywhere] sm:p-6">
    <h1 id="initial-decision-title" className="text-2xl font-normal leading-[1.3]">Wstępna ocena początkowa</h1>
    <p className="whitespace-pre-wrap">{decision.greeting}</p>
    <section className="grid gap-2"><h2 className="text-lg font-medium">Wstępny wynik</h2><p className="border-l-4 border-primary bg-[#fff3e8] p-4 font-medium">{OUTCOME_LABELS[decision.outcome]}</p></section>
    <section className="grid gap-2"><h2 className="text-lg font-medium">Podsumowanie</h2><p className="whitespace-pre-wrap">{decision.summary}</p></section>
    {decision.scenario === "return" && decision.resaleAssessment !== null && decision.resaleExplanation !== null && <>
      <section className="grid gap-2"><h2 className="text-lg font-medium">Ocena możliwości przyjęcia zwrotu</h2><p>{OUTCOME_LABELS[decision.outcome]}</p></section>
      <section className="grid gap-2"><h2 className="text-lg font-medium">Ocena stanu do ponownej sprzedaży</h2><p className="font-medium">{RESALE_LABELS[decision.resaleAssessment]}</p><p className="whitespace-pre-wrap">{decision.resaleExplanation}</p></section>
    </>}
    <DecisionList heading="Uzasadnienie" items={decision.justification} />
    <DecisionList heading="Ustalenia i zgłoszone fakty" items={decision.evidence} />
    <section className="grid gap-2"><h2 className="text-lg font-medium">Podstawa procedury</h2><ul className="list-disc space-y-2 pl-5">{decision.policy.references.map(reference => <li key={reference.headingId}><a className="text-primary underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-3" href={reference.url} target="_blank" rel="noopener noreferrer">{reference.title}</a></li>)}</ul></section>
    <DecisionList heading="Ograniczenia oceny" items={decision.limitations} />
    <DecisionList heading="Pytania uzupełniające" items={decision.questions} />
    <DecisionList heading="Dalsze kroki pracownika" items={decision.nextSteps} />
    <p className="border-l-4 border-primary bg-[#fff3e8] p-4">{FIRST_ASSESSMENT_NOTICE}</p>
  </article>;
}
