export const FORM_LABELS = {
  scenario: "Rodzaj sprawy",
  category: "Kategoria sprzętu",
  equipmentName: "Nazwa sprzętu",
  purchaseDate: "Data zakupu",
  deliveryDate: "Data dostarczenia",
  buyerStatus: "Status kupującego",
  sellerStatus: "Status sprzedawcy",
  reason: "Przyczyna zgłoszenia",
  requestedRemedy: "Oczekiwane rozwiązanie",
} as const;

export const FORM_FIELD_ORDER = [
  "scenario", "category", "equipmentName", "purchaseDate", "deliveryDate",
  "buyerStatus", "sellerStatus", "reason", "requestedRemedy",
] as const;
