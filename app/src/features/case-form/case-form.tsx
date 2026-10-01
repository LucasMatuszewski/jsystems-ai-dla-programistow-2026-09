"use client";

import { useId, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FORM_OPTIONS, createCaseFormSchema, getFormFieldErrors, type CaseForm as ValidatedCaseForm } from "@/lib/contracts/form";
import { getEmployeeToday } from "@/lib/contracts/calendar";
import { FORM_FIELD_ORDER, FORM_LABELS } from "./form-labels";
import { FormValidationView } from "./form-validation-view";

export type CaseFormValues = {
  scenario: ValidatedCaseForm["scenario"] | "";
  category: ValidatedCaseForm["category"] | "";
  equipmentName: string;
  purchaseDate: string;
  deliveryDate: string | null;
  buyerStatus: ValidatedCaseForm["buyerStatus"] | "";
  sellerStatus: ValidatedCaseForm["sellerStatus"] | "";
  reason: string;
  requestedRemedy: NonNullable<ValidatedCaseForm["requestedRemedy"]> | "" | null;
};

export type CaseFormProps = {
  value: CaseFormValues;
  onChange: (value: CaseFormValues) => void;
  onValidSubmit: (value: ValidatedCaseForm) => void;
};

export function CaseForm({ value, onChange, onValidSubmit }: CaseFormProps) {
  const prefix = useId();
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const savedDeliveryDate = useRef("");
  const fieldId = (field: keyof CaseFormValues) => `${prefix}-${field}`;
  const errorId = (field: keyof CaseFormValues) => `${fieldId(field)}-error`;
  const errorProps = (field: keyof CaseFormValues) => ({
    "aria-invalid": errors[field]?.length ? true as const : undefined,
    "aria-describedby": errors[field]?.length ? errorId(field) : undefined,
  });

  function change(next: CaseFormValues) {
    setErrors({});
    onChange(next);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const today = getEmployeeToday(Intl.DateTimeFormat().resolvedOptions().timeZone);
    const candidate = value.scenario === "return" ? { ...value, requestedRemedy: null } : value;
    const result = createCaseFormSchema(today).safeParse(candidate);
    if (result.success) {
      setErrors({});
      onValidSubmit(result.data);
      return;
    }
    const nextErrors = getFormFieldErrors(result.error);
    setErrors(nextErrors);
    const first = FORM_FIELD_ORDER.find((field) => nextErrors[field]?.length);
    if (first) event.currentTarget.querySelector<HTMLElement>(`[name="${first}"]`)?.focus();
  }

  const error = (field: keyof CaseFormValues) => <FormValidationView id={errorId(field)} messages={errors[field]} />;
  const select = (field: "category" | "buyerStatus" | "sellerStatus" | "requestedRemedy") => (
    <div className="grid min-w-0 gap-2">
      <Label htmlFor={fieldId(field)}>{FORM_LABELS[field]}</Label>
      <select id={fieldId(field)} name={field} value={value[field] ?? ""} data-slot="select-trigger"
        className="w-full min-w-0 border border-input bg-card focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-3"
        {...errorProps(field)} onChange={(event) => change({ ...value, [field]: event.target.value })}>
        <option value="">Wybierz opcję</option>
        {FORM_OPTIONS[field].map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
      {error(field)}
    </div>
  );

  return <form aria-label="Dane sprawy" noValidate onSubmit={submit}
    className="mt-6 grid max-w-[800px] min-w-0 gap-6 rounded-[16px] border bg-card p-4 sm:p-6">
    <h2 className="text-2xl font-normal leading-[1.3]">Dane sprawy</h2>
    <fieldset className="min-w-0">
      <legend className="mb-3">{FORM_LABELS.scenario}</legend>
      <div className="flex flex-wrap gap-6">
        {FORM_OPTIONS.scenario.map((option) => <Label key={option.value} htmlFor={`${fieldId("scenario")}-${option.value}`} className="leading-5">
          <input type="radio" name="scenario" id={`${fieldId("scenario")}-${option.value}`} value={option.value}
            className="size-4 accent-primary" checked={value.scenario === option.value} {...errorProps("scenario")}
            onChange={() => change({ ...value, scenario: option.value, requestedRemedy: option.value === "return" ? null : value.requestedRemedy ?? "" })} />
          {option.label}
        </Label>)}
      </div>
      {error("scenario")}
    </fieldset>
    {select("category")}
    <div className="grid min-w-0 gap-2">
      <Label htmlFor={fieldId("equipmentName")}>{FORM_LABELS.equipmentName}</Label>
      <Input id={fieldId("equipmentName")} name="equipmentName" value={value.equipmentName} {...errorProps("equipmentName")}
        onChange={(event) => change({ ...value, equipmentName: event.target.value })} />
      {error("equipmentName")}
    </div>
    <div className="grid min-w-0 gap-2">
      <Label htmlFor={fieldId("purchaseDate")}>{FORM_LABELS.purchaseDate}</Label>
      <Input id={fieldId("purchaseDate")} name="purchaseDate" type="date" value={value.purchaseDate} {...errorProps("purchaseDate")}
        onChange={(event) => change({ ...value, purchaseDate: event.target.value })} />
      {error("purchaseDate")}
    </div>
    <div className="grid min-w-0 gap-2">
      <Label htmlFor={fieldId("deliveryDate")}>{FORM_LABELS.deliveryDate}</Label>
      <Input id={fieldId("deliveryDate")} name="deliveryDate" type="date" value={value.deliveryDate ?? ""}
        disabled={value.deliveryDate === null} {...errorProps("deliveryDate")}
        onChange={(event) => change({ ...value, deliveryDate: event.target.value })} />
      <Label htmlFor={`${fieldId("deliveryDate")}-unknown`} className="leading-5">
        <input id={`${fieldId("deliveryDate")}-unknown`} type="checkbox" className="size-4 accent-primary"
          checked={value.deliveryDate === null} onChange={(event) => {
            if (event.target.checked) {
              savedDeliveryDate.current = value.deliveryDate ?? "";
              change({ ...value, deliveryDate: null });
            } else change({ ...value, deliveryDate: savedDeliveryDate.current });
          }} />
        Nie znam daty dostarczenia
      </Label>
      {error("deliveryDate")}
    </div>
    {select("buyerStatus")}
    {select("sellerStatus")}
    <div className="grid min-w-0 gap-2">
      <Label htmlFor={fieldId("reason")}>{FORM_LABELS.reason}</Label>
      <Textarea id={fieldId("reason")} name="reason" value={value.reason} {...errorProps("reason")}
        onChange={(event) => change({ ...value, reason: event.target.value })} />
      {error("reason")}
    </div>
    {value.scenario === "complaint" && select("requestedRemedy")}
    <Button type="submit" className="justify-self-start">Dalej</Button>
  </form>;
}
