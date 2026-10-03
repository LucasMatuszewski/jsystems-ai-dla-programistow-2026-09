import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { CaseForm } from "@/lib/contracts/form";
import { FORM_LABELS } from "@/features/case-form/form-labels";
import { CaseSummary } from "./case-summary";
const form: CaseForm = { scenario: "complaint", category: "computers", equipmentName: "Laptop zapisany przy wysłaniu", purchaseDate: "2026-01-01", deliveryDate: null, buyerStatus: "unknown", sellerStatus: "business", reason: "Nie działa.", requestedRemedy: "repair" };
const image = { imageDataUrl: "data:image/jpeg;base64,YQ==", thumbnailDataUrl: "data:image/jpeg;base64,Yg==", byteLength: 1, width: 1, height: 1, sha256: "a".repeat(64) };
const viewport = (narrow: boolean) => { vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: narrow, media: "(max-width: 767px)", addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn() }))); };
describe("frozen submitted case summary", () => {
  it("uses every submitted field label with explicit Unknown and normalized preview only", () => {
    viewport(false); render(<CaseSummary form={form} preparedImage={image} />);
    for (const label of Object.values(FORM_LABELS)) expect(screen.getByText(label)).toBeVisible();
    expect(screen.getByText(form.equipmentName)).toBeVisible(); expect(screen.getByText("Komputery")).toBeVisible(); expect(screen.getByText("Reklamacja")).toBeVisible(); expect(screen.getAllByText("Nie wiem")).toHaveLength(2); expect(screen.getByText("Naprawa")).toBeVisible();
    expect(screen.getByRole("img", { name: "Podgląd wybranego zdjęcia sprzętu" })).toHaveAttribute("src", image.thumbnailDataUrl);
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument(); expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });
  it("is collapsed on a narrow screen and exposes keyboard-operable disclosure", () => {
    viewport(true); render(<CaseSummary form={form} preparedImage={image} />);
    const disclosure = screen.getByRole("button", { name: "Dane sprawy" });
    expect(disclosure).toHaveAttribute("aria-expanded", "false"); disclosure.focus(); expect(disclosure).toHaveFocus();
    fireEvent.click(disclosure); expect(disclosure).toHaveAttribute("aria-expanded", "true"); expect(screen.getByText(form.equipmentName)).toBeVisible();
  });
  it("does not turn empty return reason or null remedy into invented facts", () => {
    viewport(false); render(<CaseSummary form={{ ...form, scenario: "return", reason: "", requestedRemedy: null }} preparedImage={image} />);
    expect(screen.getByText("Zwrot")).toBeVisible(); expect(screen.getByText("Brak wskazanych informacji.")).toBeVisible(); expect(screen.getByText("Nie dotyczy")).toBeVisible(); expect(screen.queryByText("Naprawa")).not.toBeInTheDocument();
  });
});
