import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CaseFormInput } from "@/lib/contracts/form";
const mocks = vi.hoisted(() => ({ parse: vi.fn(), hash: vi.fn(), update: vi.fn(), digest: vi.fn() }));
vi.mock("node:crypto", () => ({ createHash: mocks.hash }));
vi.mock("@/lib/contracts/requests", () => ({ storedCaseFormSchema: { parse: mocks.parse } }));
import { createFormFingerprint } from "@/server/cases/form-fingerprint";

const form: CaseFormInput = { scenario: "complaint", category: "smartphones-tablets", equipmentName: "Telefon", purchaseDate: "2026-01-01", deliveryDate: null, buyerStatus: "unknown", sellerStatus: "business", reason: "Pęknięta obudowa", requestedRemedy: "repair" };
describe("normalized form identity", () => {
  beforeEach(() => {
    mocks.parse.mockImplementation(value => ({ ...value, equipmentName: value.equipmentName.trim(), reason: value.reason.trim(), requestedRemedy: value.scenario === "return" ? null : value.requestedRemedy }));
    mocks.hash.mockReturnValue({ update: mocks.update }); mocks.update.mockReturnValue({ digest: mocks.digest }); mocks.digest.mockReturnValue("a".repeat(64));
  });
  it("hashes normalized facts in one explicit canonical field order using SHA256 UTF8", () => {
    const reversed = Object.fromEntries(Object.entries(form).reverse()) as CaseFormInput;
    expect(createFormFingerprint(reversed)).toBe("a".repeat(64));
    expect(mocks.parse).toHaveBeenCalledWith(reversed); expect(mocks.hash).toHaveBeenCalledWith("sha256");
    expect(mocks.update).toHaveBeenCalledWith(JSON.stringify(form), "utf8"); expect(mocks.digest).toHaveBeenCalledWith("hex");
  });
  it("uses schema normalization and never hashes a stale complaint remedy as a return fact", () => {
    createFormFingerprint({ ...form, scenario: "return", equipmentName: "  Telefon  ", reason: "  " });
    expect(mocks.update).toHaveBeenCalledWith(JSON.stringify({ ...form, scenario: "return", reason: "", requestedRemedy: null }), "utf8");
  });
  it.each(Object.keys(form) as (keyof CaseFormInput)[])("includes fact %s in the fingerprint material", field => {
    createFormFingerprint(form); const before = mocks.update.mock.calls[0][0];
    const changes: CaseFormInput = { ...form, scenario: "return", category: "other", equipmentName: "Laptop", purchaseDate: "2025-12-31", deliveryDate: "2026-01-02", buyerStatus: "consumer", sellerStatus: "private", reason: "Inna przyczyna", requestedRemedy: "replacement" };
    createFormFingerprint({ ...form, [field]: changes[field] });
    expect(mocks.update.mock.calls[1][0]).not.toBe(before);
  });
});
