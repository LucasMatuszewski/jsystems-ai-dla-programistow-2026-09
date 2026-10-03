import { describe, expect, it } from "vitest";
import {
  BUYER_STATUSES, CATEGORIES, FORM_CONTRACT_REVISION, FORM_OPTIONS,
  REMEDIES, SCENARIOS, SELLER_STATUSES, createCaseFormSchema, getFormFieldErrors,
} from "@/lib/contracts/form";

const today = "2026-10-01";
const complaint = {
  scenario: "complaint", category: "computers", equipmentName: "Laptop",
  purchaseDate: "2026-09-01", deliveryDate: "2026-09-02",
  buyerStatus: "consumer", sellerStatus: "business", reason: "Nie uruchamia się",
  requestedRemedy: "repair",
};
const schema = () => createCaseFormSchema(today);

describe("frozen revision-one choices", () => {
  it("exports exact choices and Polish labels", () => {
    expect(FORM_CONTRACT_REVISION).toBe(1);
    expect(SCENARIOS).toEqual(["complaint", "return"]);
    expect(CATEGORIES).toEqual(["smartphones-tablets", "computers", "components-accessories", "tv-audio", "household-appliances", "consoles", "other"]);
    expect(BUYER_STATUSES).toEqual(["consumer", "sole-trader-nonprofessional", "business-professional", "unknown"]);
    expect(SELLER_STATUSES).toEqual(["business", "private", "unknown"]);
    expect(REMEDIES).toEqual(["repair", "replacement", "price-reduction", "withdrawal-refund", "unknown"]);
    expect(FORM_OPTIONS.scenario).toEqual([{ value: "complaint", label: "Reklamacja" }, { value: "return", label: "Zwrot" }]);
    expect(FORM_OPTIONS.category.map((option) => option.label)).toEqual(["Smartfony i tablety", "Komputery", "Podzespoły i akcesoria", "Telewizory i audio", "Sprzęt AGD", "Konsole", "Inne"]);
    expect(Object.isFrozen(FORM_OPTIONS.scenario)).toBe(true);
  });
  it.each(["smartphones-tablets", "computers", "components-accessories", "tv-audio", "household-appliances", "consoles", "other"])("accepts category %s", (category) => {
    expect(schema().safeParse({ ...complaint, category }).success).toBe(true);
  });
  it.each(["consumer", "sole-trader-nonprofessional", "business-professional", "unknown"])("accepts explicit buyer %s", (buyerStatus) => {
    expect(schema().safeParse({ ...complaint, buyerStatus }).success).toBe(true);
  });
  it.each(["business", "private", "unknown"])("accepts explicit seller %s", (sellerStatus) => {
    expect(schema().safeParse({ ...complaint, sellerStatus }).success).toBe(true);
  });
  it.each(["repair", "replacement", "price-reduction", "withdrawal-refund", "unknown"])("accepts complaint remedy %s", (requestedRemedy) => {
    expect(schema().safeParse({ ...complaint, requestedRemedy }).success).toBe(true);
  });
});

describe("required facts and input bounds", () => {
  it.each(Object.keys(complaint))("rejects an omitted %s rather than inventing a fact", (field) => {
    const input: Record<string, unknown> = { ...complaint };
    delete input[field];
    const result = schema().safeParse(input);
    expect(result.success).toBe(false);
    if (!result.success) expect(getFormFieldErrors(result.error)[field]).toBeDefined();
  });
  it.each([
    ["scenario", ""], ["scenario", "exchange"], ["category", ""], ["category", "camera"],
    ["buyerStatus", ""], ["buyerStatus", "professional"], ["sellerStatus", ""], ["sellerStatus", "shop"],
    ["requestedRemedy", ""], ["requestedRemedy", null], ["requestedRemedy", "refund"],
    ["equipmentName", " \n\t"], ["equipmentName", "x".repeat(201)],
    ["reason", " \n\t"], ["reason", "x".repeat(4001)],
  ])("rejects invalid %s", (field, value) => {
    const result = schema().safeParse({ ...complaint, [field as string]: value });
    expect(result.success).toBe(false);
    if (!result.success) expect(getFormFieldErrors(result.error)[field as string]).toBeDefined();
  });
  it("trims bounded strings in the output without mutating original inputs", () => {
    const input = { ...complaint, equipmentName: `  ${"x".repeat(200)}  `, reason: `  ${"x".repeat(4000)}  ` };
    const parsed = schema().parse(input);
    expect(parsed.equipmentName).toHaveLength(200);
    expect(parsed.reason).toHaveLength(4000);
    expect(input.equipmentName.startsWith("  ")).toBe(true);
  });
  it("returns associated Polish field errors while preserving valid input", () => {
    const input = { ...complaint, equipmentName: " ", purchaseDate: "2026-02-30" };
    const before = structuredClone(input);
    const result = schema().safeParse(input);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(getFormFieldErrors(result.error)).toEqual({
        equipmentName: ["Podaj nazwę sprzętu."], purchaseDate: ["Podaj poprawną datę zakupu."],
      });
    }
    expect(input).toEqual(before);
  });
});

describe("purchase and delivery calendar invariants", () => {
  it.each(["2026-10-01", "2024-02-29"])("accepts nonfuture purchase %s and explicit unknown delivery", (purchaseDate) => {
    expect(schema().parse({ ...complaint, purchaseDate, deliveryDate: null }).deliveryDate).toBeNull();
  });
  it.each([
    { purchaseDate: "2026-10-02", deliveryDate: null, field: "purchaseDate" },
    { purchaseDate: "2026-02-29", deliveryDate: null, field: "purchaseDate" },
    { purchaseDate: "2026-09-01", deliveryDate: "2026-08-31", field: "deliveryDate" },
    { purchaseDate: "2026-09-01", deliveryDate: "2026-10-02", field: "deliveryDate" },
    { purchaseDate: "2026-09-01", deliveryDate: "2026-09-31", field: "deliveryDate" },
    { purchaseDate: "2026-09-01", deliveryDate: "", field: "deliveryDate" },
  ])("rejects invalid dates: $purchaseDate/$deliveryDate", ({ field, ...dates }) => {
    const result = schema().safeParse({ ...complaint, ...dates });
    expect(result.success).toBe(false);
    if (!result.success) expect(getFormFieldErrors(result.error)[field]).toBeDefined();
  });
  it("accepts delivery equal to purchase and today", () => {
    expect(schema().safeParse({ ...complaint, purchaseDate: today, deliveryDate: today }).success).toBe(true);
  });
  it("rejects an invalid evaluation-date bound", () => {
    expect(() => createCaseFormSchema("2026-02-30")).toThrow(RangeError);
  });
});

describe("return facts", () => {
  it.each([null, "repair", "replacement", "price-reduction", "withdrawal-refund", "unknown"])("canonicalizes selected stale remedy %s to null", (requestedRemedy) => {
    const result = schema().parse({ ...complaint, scenario: "return", reason: " \n ", requestedRemedy });
    expect(result).toMatchObject({ scenario: "return", reason: "", requestedRemedy: null });
  });
  it("rejects malformed stale remedy rather than creating a complaint fact", () => {
    expect(schema().safeParse({ ...complaint, scenario: "return", requestedRemedy: "invented" }).success).toBe(false);
  });
  it("still requires explicit nullable remedy and delivery fields", () => {
    expect(schema().safeParse({ ...complaint, scenario: "return", reason: "", requestedRemedy: undefined }).success).toBe(false);
    expect(schema().safeParse({ ...complaint, scenario: "return", reason: "", requestedRemedy: null, deliveryDate: undefined }).success).toBe(false);
  });
});
