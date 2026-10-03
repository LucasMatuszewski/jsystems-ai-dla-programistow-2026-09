import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ActiveCaseSnapshot } from "@/lib/contracts/session";
import { ProcessingSteps } from "./processing-steps";
const form = { scenario: "complaint", category: "computers", equipmentName: "Laptop pracownika", purchaseDate: "2026-01-01", deliveryDate: null, buyerStatus: "unknown", sellerStatus: "business", reason: "Nie działa.", requestedRemedy: "repair" } as const;
const image = { imageDataUrl: "data:image/jpeg;base64,YQ==", thumbnailDataUrl: "data:image/jpeg;base64,YQ==", byteLength: 1, width: 1, height: 1, sha256: "a".repeat(64) };
function snapshot(stage: "preparation" | "analysis" | "decision" = "analysis"): ActiveCaseSnapshot { return { schemaVersion: 1, caseId: "d6a7c3f7-5711-4e97-ae3e-5195c48c2b95", revision: 1, screen: "form", stage, stageStatus: "pending", draftForm: { ...form }, submittedForm: { ...form }, timeZone: "Europe/Warsaw", preparedImage: stage === "preparation" ? null : image, imageAnalysis: stage === "decision" ? { analysisId: "d6a7c3f7-5711-4e97-ae3e-5195c48c2b95", scenario: "complaint", imageDigest: image.sha256, formFingerprint: "b".repeat(64), createdAt: "2026-10-01T08:00:00Z", modelId: "private", imageQuality: "adequate", observations: [], signsOfUse: [], possibleCauses: [], limitations: [], missingInformation: [] } : null, initialDecision: null, messages: [], replyStates: {}, pendingOperation: { kind: stage, operationId: "e6a7c3f7-5711-4e97-ae3e-5195c48c2b95", startedAt: "2026-10-01T08:00:00Z" }, storageWarning: null }; }
describe("genuine accessible processing stages", () => {
  it("marks already prepared image complete and analysis current without claiming a decision", () => {
    render(<ProcessingSteps snapshot={snapshot()} view={{ pending: true, error: null }} onReturnToForm={vi.fn()} onRetry={vi.fn()} />);
    const region = screen.getByRole("region", { name: "Przygotowanie wstępnej oceny" });
    const items = within(region).getAllByRole("listitem");
    expect(items).toHaveLength(3); expect(items[0]).toHaveTextContent("Przygotowanie zdjęcia"); expect(items[0]).toHaveTextContent("Ukończono");
    expect(items[1]).toHaveTextContent("Analiza stanu sprzętu"); expect(items[1]).toHaveTextContent("W trakcie"); expect(items[1]).toHaveAttribute("aria-current", "step");
    expect(items[2]).toHaveTextContent("Przygotowanie oceny"); expect(items[2]).toHaveTextContent("Nie rozpoczęto");
    expect(screen.getByRole("status")).toHaveTextContent("Analiza stanu sprzętu"); expect(screen.getByText("Laptop pracownika")).toBeVisible();
  });
  it.each(["preparation", "analysis", "decision"] as const)("announces only the genuinely current %s stage", stage => {
    render(<ProcessingSteps snapshot={snapshot(stage)} view={{ pending: true, error: null }} onReturnToForm={vi.fn()} onRetry={vi.fn()} />);
    const current = screen.getAllByRole("listitem").filter(item => item.getAttribute("aria-current") === "step"); expect(current).toHaveLength(1);
    expect(screen.getByRole("status")).toHaveAttribute("aria-live", "polite");
  });
  it("offers an actionable failed-stage retry and explicit cancellation", () => {
    const retry = vi.fn(); const cancel = vi.fn();
    render(<ProcessingSteps snapshot={{ ...snapshot("decision"), stageStatus: "idle", pendingOperation: null }} view={{ pending: false, error: { code: "PROVIDER_ERROR", operationId: "e6a7c3f7-5711-4e97-ae3e-5195c48c2b95", message: "Usługa AI jest chwilowo niedostępna. Spróbuj ponownie.", retryable: true } }} onReturnToForm={cancel} onRetry={retry} />);
    expect(screen.getAllByRole("listitem")[2]).toHaveTextContent("Błąd");
    fireEvent.click(screen.getByRole("button", { name: "Spróbuj ponownie" })); expect(retry).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Wróć do formularza" })); expect(cancel).toHaveBeenCalledTimes(1);
  });
  it("shows interruption honestly and does not offer retry for nonretryable input failure", () => {
    const { rerender } = render(<ProcessingSteps snapshot={{ ...snapshot(), stageStatus: "interrupted" }} view={{ pending: false, error: null }} onReturnToForm={vi.fn()} onRetry={vi.fn()} />);
    expect(screen.getAllByRole("listitem")[1]).toHaveTextContent("Przerwano");
    rerender(<ProcessingSteps snapshot={{ ...snapshot(), stageStatus: "idle", pendingOperation: null }} view={{ pending: false, error: { code: "VALIDATION_ERROR", operationId: "e6a7c3f7-5711-4e97-ae3e-5195c48c2b95", message: "Popraw zaznaczone pola formularza.", retryable: false } }} onReturnToForm={vi.fn()} onRetry={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Spróbuj ponownie" })).not.toBeInTheDocument(); expect(screen.getByRole("button", { name: "Wróć do formularza" })).toBeVisible();
  });
});
