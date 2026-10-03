"use client";
import { useState, useSyncExternalStore } from "react";
import Image from "next/image";
import type { CaseForm } from "@/lib/contracts/form";
import type { PreparedImage } from "@/lib/contracts/image";
import { BUYER_STATUS_LABELS, CATEGORY_LABELS, REMEDY_LABELS, SCENARIO_LABELS, SELLER_STATUS_LABELS } from "@/lib/contracts/form";
import { FORM_LABELS } from "@/features/case-form/form-labels";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";

function subscribeViewport(onChange: () => void) {
  if (typeof window.matchMedia !== "function") return () => {};
  const media = window.matchMedia("(max-width: 767px)");
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}
const narrowViewport = () => typeof window.matchMedia !== "function" || window.matchMedia("(max-width: 767px)").matches;

export function CaseSummary({ form, preparedImage }: { form: CaseForm; preparedImage: PreparedImage }) {
  const narrow = useSyncExternalStore(subscribeViewport, narrowViewport, () => true);
  const [selectedOpen, setSelectedOpen] = useState<boolean | null>(null);
  const fields = [
    [FORM_LABELS.scenario, SCENARIO_LABELS[form.scenario]],
    [FORM_LABELS.category, CATEGORY_LABELS[form.category]],
    [FORM_LABELS.equipmentName, form.equipmentName],
    [FORM_LABELS.purchaseDate, form.purchaseDate],
    [FORM_LABELS.deliveryDate, form.deliveryDate ?? "Nie wiem"],
    [FORM_LABELS.buyerStatus, BUYER_STATUS_LABELS[form.buyerStatus]],
    [FORM_LABELS.sellerStatus, SELLER_STATUS_LABELS[form.sellerStatus]],
    [FORM_LABELS.reason, form.reason || "Brak wskazanych informacji."],
    [FORM_LABELS.requestedRemedy, form.requestedRemedy === null ? "Nie dotyczy" : REMEDY_LABELS[form.requestedRemedy]],
  ];
  return <aside aria-label="Dane sprawy" className="min-w-0 self-start rounded-[16px] border bg-card p-4 sm:p-6">
    <Collapsible open={selectedOpen ?? !narrow} onOpenChange={setSelectedOpen}>
      <CollapsibleTrigger asChild><Button type="button" variant="outline" className="w-full justify-between"><span>Dane sprawy</span><span aria-hidden="true">{(selectedOpen ?? !narrow) ? "−" : "+"}</span></Button></CollapsibleTrigger>
      <CollapsibleContent className="pt-5">
        <dl className="grid min-w-0 gap-4 text-sm">{fields.map(([label, value]) => <div key={label} className="min-w-0"><dt className="mb-1 text-muted-foreground">{label}</dt><dd className="whitespace-pre-wrap [overflow-wrap:anywhere]">{value}</dd></div>)}</dl>
        <Image src={preparedImage.thumbnailDataUrl} alt="Podgląd wybranego zdjęcia sprzętu" width={preparedImage.width} height={preparedImage.height} unoptimized className="mt-5 max-h-64 w-auto max-w-full object-contain" />
      </CollapsibleContent>
    </Collapsible>
  </aside>;
}
