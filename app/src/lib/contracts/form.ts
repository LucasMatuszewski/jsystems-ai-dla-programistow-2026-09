import { z } from "zod";
import { isISOCalendarDate } from "./calendar";

export const FORM_CONTRACT_REVISION = 1 as const;
export const SCENARIOS = Object.freeze(["complaint", "return"] as const);
export const CATEGORIES = Object.freeze(["smartphones-tablets", "computers", "components-accessories", "tv-audio", "household-appliances", "consoles", "other"] as const);
export const BUYER_STATUSES = Object.freeze(["consumer", "sole-trader-nonprofessional", "business-professional", "unknown"] as const);
export const SELLER_STATUSES = Object.freeze(["business", "private", "unknown"] as const);
export const REMEDIES = Object.freeze(["repair", "replacement", "price-reduction", "withdrawal-refund", "unknown"] as const);

export const SCENARIO_LABELS = Object.freeze({ complaint: "Reklamacja", return: "Zwrot" });
export const CATEGORY_LABELS = Object.freeze({
  "smartphones-tablets": "Smartfony i tablety", computers: "Komputery",
  "components-accessories": "Podzespoły i akcesoria", "tv-audio": "Telewizory i audio",
  "household-appliances": "Sprzęt AGD", consoles: "Konsole", other: "Inne",
});
export const BUYER_STATUS_LABELS = Object.freeze({
  consumer: "Konsument", "sole-trader-nonprofessional": "Jednoosobowa działalność — zakup niezawodowy",
  "business-professional": "Firma — zakup zawodowy", unknown: "Nie wiem",
});
export const SELLER_STATUS_LABELS = Object.freeze({ business: "Firma", private: "Osoba prywatna", unknown: "Nie wiem" });
export const REMEDY_LABELS = Object.freeze({
  repair: "Naprawa", replacement: "Wymiana", "price-reduction": "Obniżenie ceny",
  "withdrawal-refund": "Odstąpienie od umowy i zwrot pieniędzy", unknown: "Nie wiem",
});

function options<T extends string>(values: readonly T[], labels: Record<T, string>) {
  return Object.freeze(values.map((value) => Object.freeze({ value, label: labels[value] })));
}

export const FORM_OPTIONS = Object.freeze({
  scenario: options(SCENARIOS, SCENARIO_LABELS), category: options(CATEGORIES, CATEGORY_LABELS),
  buyerStatus: options(BUYER_STATUSES, BUYER_STATUS_LABELS), sellerStatus: options(SELLER_STATUSES, SELLER_STATUS_LABELS),
  requestedRemedy: options(REMEDIES, REMEDY_LABELS),
});

export function createCaseFormSchema(today: string) {
  if (!isISOCalendarDate(today)) throw new RangeError("Nieprawidłowa data oceny.");
  const date = (message: string) => z.string({ error: message }).refine(isISOCalendarDate, { error: message });
  const reason = z.string({ error: "Podaj przyczynę zgłoszenia." }).trim().max(4000, { error: "Przyczyna może mieć maksymalnie 4000 znaków." });
  const remedy = z.enum(REMEDIES, { error: "Wybierz oczekiwane rozwiązanie lub Nie wiem." });
  const common = {
    category: z.enum(CATEGORIES, { error: "Wybierz kategorię sprzętu." }),
    equipmentName: z.string({ error: "Podaj nazwę sprzętu." }).trim()
      .min(1, { error: "Podaj nazwę sprzętu." }).max(200, { error: "Nazwa sprzętu może mieć maksymalnie 200 znaków." }),
    purchaseDate: date("Podaj poprawną datę zakupu."),
    deliveryDate: date("Podaj poprawną datę dostarczenia lub wybierz Nie wiem.").nullable(),
    buyerStatus: z.enum(BUYER_STATUSES, { error: "Wybierz status kupującego." }),
    sellerStatus: z.enum(SELLER_STATUSES, { error: "Wybierz status sprzedawcy." }),
  };
  return z.discriminatedUnion("scenario", [
    z.object({
      ...common, scenario: z.literal("complaint"),
      reason: reason.min(1, { error: "Podaj przyczynę reklamacji." }), requestedRemedy: remedy,
    }),
    z.object({
      ...common, scenario: z.literal("return"), reason,
      // A valid previous complaint choice is accepted as input but never emitted as a return fact.
      requestedRemedy: remedy.nullable().transform(() => null),
    }),
  ], { error: "Wybierz rodzaj sprawy." }).superRefine((value, context) => {
    if (isISOCalendarDate(value.purchaseDate) && value.purchaseDate > today) {
      context.addIssue({ code: "custom", path: ["purchaseDate"], message: "Data zakupu nie może być późniejsza niż dzisiaj." });
    }
    if (value.deliveryDate !== null && isISOCalendarDate(value.deliveryDate)) {
      if (isISOCalendarDate(value.purchaseDate) && value.deliveryDate < value.purchaseDate) {
        context.addIssue({ code: "custom", path: ["deliveryDate"], message: "Data dostarczenia nie może być wcześniejsza niż data zakupu." });
      }
      if (value.deliveryDate > today) {
        context.addIssue({ code: "custom", path: ["deliveryDate"], message: "Data dostarczenia nie może być późniejsza niż dzisiaj." });
      }
    }
  });
}

export type CaseForm = z.infer<ReturnType<typeof createCaseFormSchema>>;
export type CaseFormInput = z.input<ReturnType<typeof createCaseFormSchema>>;
export type CaseFormField = keyof CaseForm;

export function getFormFieldErrors(error: z.ZodError): Record<string, string[]> {
  return z.flattenError(error).fieldErrors;
}
