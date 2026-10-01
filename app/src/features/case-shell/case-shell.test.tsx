import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ActiveCaseSnapshot } from "@/lib/contracts/session";
import type { InitialWorkflowDependencies } from "@/features/case-workflow/initial-workflow-controller";
import { CaseShell, CaseShellProvider } from "./case-shell";

const mocks = vi.hoisted(() => ({ restore: vi.fn(), checkpoint: vi.fn(), dispose: vi.fn(), warning: vi.fn(), push: vi.fn(), replace: vi.fn(), start: vi.fn(), retry: vi.fn(), cancel: vi.fn(), invalidate: vi.fn(), controllerDispose: vi.fn(), controllerFactory: vi.fn(), adapterFactory: vi.fn(), processing: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push, replace: mocks.replace }) }));
vi.mock("@/features/session/session-adapter", () => ({ createSessionAdapter: mocks.adapterFactory }));
vi.mock("@/features/session/storage-notice", () => ({ StorageNotice: ({ warning }: { warning: string | null }) => warning ? <p role="status">Nie można zapisać sprawy. Po odświeżeniu odzyskanie sprawy może być niemożliwe.</p> : null }));
vi.mock("@/features/case-workflow/initial-workflow-controller", () => ({ createInitialWorkflowController: mocks.controllerFactory }));
vi.mock("@/features/case-workflow/initial-api-client", () => ({ analyzeInitialCase: vi.fn(), decideInitialCase: vi.fn() }));
vi.mock("@/features/case-workflow/image-preparation-client", () => ({ prepareEquipmentImage: vi.fn(), screenEquipmentImageFiles: vi.fn() }));
vi.mock("@/features/case-form/case-form", () => ({ CaseForm: ({ value, onValidSubmit, onChange, imageSlot }: { value: object; onValidSubmit: (form: object) => void; onChange: (form: object) => void; imageSlot: React.ReactNode }) => <form aria-label="Dane sprawy" onSubmit={event => { event.preventDefault(); onValidSubmit(submitted); }}><span>{JSON.stringify(value)}</span><button type="submit">Dalej</button><button type="button" onClick={() => onChange({ ...submitted, equipmentName: "Zmienione fakty" })}>Zmień dane</button>{imageSlot}</form> }));
vi.mock("@/features/case-form/equipment-image-picker", () => ({ EquipmentImagePicker: () => <p>Zdjęcie przygotowane.</p> }));
vi.mock("@/features/case-workflow/processing-steps", () => ({ ProcessingSteps: ({ snapshot, onRetry, onReturnToForm }: { snapshot: ActiveCaseSnapshot; onRetry: () => void; onReturnToForm: () => void }) => { mocks.processing(snapshot); return <section aria-label="Przygotowanie wstępnej oceny"><button onClick={onRetry}>Spróbuj ponownie</button><button onClick={onReturnToForm}>Wróć do formularza</button></section>; } }));
vi.mock("@/features/case-chat/initial-decision-details", () => ({ InitialDecisionDetails: ({ decision }: { decision: { summary: string } }) => <article aria-label="Wstępna ocena początkowa"><h1>Wstępna ocena początkowa</h1><p>{decision.summary}</p></article> }));
vi.mock("@/features/case-chat/case-summary", () => ({ CaseSummary: ({ form }: { form: { equipmentName: string } }) => <aside aria-label="Dane sprawy">{form.equipmentName}</aside> }));
vi.mock("@/components/ai-elements/conversation", () => ({ Conversation: ({ children }: { children: React.ReactNode }) => <div role="log">{children}</div>, ConversationContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock("@/components/ai-elements/message", () => ({ Message: ({ children }: { children: React.ReactNode }) => <div>{children}</div>, MessageContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));

const caseId = "d6a7c3f7-5711-4e97-ae3e-5195c48c2b95";
const operationId = "e6a7c3f7-5711-4e97-ae3e-5195c48c2b95";
const submitted = { scenario: "complaint", category: "computers", equipmentName: "Laptop zatwierdzony przy wysłaniu", purchaseDate: "2026-01-01", deliveryDate: null, buyerStatus: "unknown", sellerStatus: "business", reason: "Nie działa.", requestedRemedy: "repair" } as const;
const image = { imageDataUrl: "data:image/jpeg;base64,YQ==", thumbnailDataUrl: "data:image/jpeg;base64,YQ==", byteLength: 1, width: 1, height: 1, sha256: "a".repeat(64) };
const report = { analysisId: caseId, scenario: "complaint" as const, imageDigest: image.sha256, formFingerprint: "b".repeat(64), createdAt: "2026-10-01T08:00:00Z", modelId: "private-model", imageQuality: "adequate" as const, observations: [], signsOfUse: [], possibleCauses: [], limitations: [], missingInformation: [] };
const decision = { caseId, decisionId: operationId, scenario: "complaint" as const, outcome: "human_verification_required" as const, greeting: "Dzień dobry.", summary: "Pełna zatwierdzona ocena początkowa.", justification: ["Wymagana weryfikacja."], evidence: [], policyReferences: ["section"], limitations: [], questions: [], nextSteps: ["Sprawdź fakty."], resaleAssessment: null, resaleExplanation: null, policy: { version: "1", digest: "c".repeat(64), sourceUrl: "https://allegro.pl/pomoc", retrievedAt: "2026-10-01T08:00:00Z", references: [{ headingId: "section", title: "Procedura", url: "https://allegro.pl/pomoc" }] }, createdAt: "2026-10-01T08:00:00Z", modelId: "private-model", preliminary: true as const, employeeVerificationRequired: true as const };
const initialMessage = { id: "first-message", role: "assistant" as const, parts: [{ type: "text" as const, text: "Pełna zatwierdzona ocena początkowa." }] };
function formCase(): ActiveCaseSnapshot { return { schemaVersion: 1, caseId, revision: 0, screen: "form", stage: "form", stageStatus: "idle", draftForm: { ...submitted }, submittedForm: null, timeZone: "Europe/Warsaw", preparedImage: image, imageAnalysis: null, initialDecision: null, messages: [], replyStates: {}, pendingOperation: null, storageWarning: null }; }
function completed(): ActiveCaseSnapshot { return { ...formCase(), revision: 4, screen: "chat", stage: "chat", submittedForm: { ...submitted }, imageAnalysis: report, initialDecision: decision, messages: [initialMessage], replyStates: { [initialMessage.id]: "complete" } }; }
let dependencies: InitialWorkflowDependencies;
beforeEach(() => {
  mocks.restore.mockReturnValue({ status: "restored", snapshot: formCase() }); mocks.warning.mockReturnValue(null);
  mocks.adapterFactory.mockImplementation(() => ({ restore: mocks.restore, checkpoint: mocks.checkpoint, dispose: mocks.dispose, getWarning: mocks.warning, flush: vi.fn() }));
  mocks.controllerFactory.mockImplementation((options: InitialWorkflowDependencies) => { dependencies = options; return { start: mocks.start, retry: mocks.retry, returnToForm: mocks.cancel, invalidate: mocks.invalidate, dispose: mocks.controllerDispose }; });
  mocks.start.mockImplementation(async (form: object) => { dependencies.checkpoint({ ...completed(), caseId: dependencies.readCase().caseId, submittedForm: form as ActiveCaseSnapshot["submittedForm"] }); dependencies.onView({ pending: false, error: null }); dependencies.onComplete(); });
});
describe("one hydrated live case across form and chat", () => {
  it("restores an unfinished idle decision checkpoint as interrupted with explicit retry and no automatic writes", async () => {
    mocks.restore.mockReturnValue({ status: "restored", snapshot: { ...formCase(), submittedForm: submitted, imageAnalysis: report, stage: "decision", stageStatus: "idle", pendingOperation: null } });
    render(<CaseShellProvider><CaseShell screen="form" /></CaseShellProvider>);
    await screen.findByRole("region", { name: "Przygotowanie wstępnej oceny" });
    expect(mocks.processing.mock.calls.at(-1)?.[0]).toMatchObject({ stage: "decision", stageStatus: "interrupted", imageAnalysis: report, preparedImage: image });
    expect(mocks.checkpoint).not.toHaveBeenCalled(); expect(mocks.start).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Spróbuj ponownie" })); expect(mocks.retry).toHaveBeenCalledTimes(1);
  });
  it("restores once after mount and does not auto-run interrupted model work", async () => {
    mocks.restore.mockReturnValue({ status: "restored", snapshot: { ...formCase(), submittedForm: submitted, imageAnalysis: report, stage: "decision", stageStatus: "interrupted", pendingOperation: { kind: "decision", operationId, startedAt: "2026-10-01T08:00:00Z" } } });
    render(<CaseShellProvider><CaseShell screen="form" /></CaseShellProvider>);
    await screen.findByRole("region", { name: "Przygotowanie wstępnej oceny" }); expect(mocks.restore).toHaveBeenCalledTimes(1); expect(mocks.start).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Spróbuj ponownie" })); expect(mocks.retry).toHaveBeenCalledTimes(1);
  });
  it("uses normalized submitted values and survives route change when the actual save fails", async () => {
    mocks.warning.mockReturnValue("quota-exceeded");
    mocks.adapterFactory.mockImplementation((options: { onWriteResult: (result: unknown) => void }) => ({ restore: mocks.restore, checkpoint: (snapshot: ActiveCaseSnapshot) => { mocks.checkpoint(snapshot); options.onWriteResult({ status: "failed", warning: "quota-exceeded", notice: "Po odświeżeniu odzyskanie sprawy może być niemożliwe." }); }, dispose: mocks.dispose, getWarning: mocks.warning, flush: vi.fn() }));
    const { rerender } = render(<CaseShellProvider><CaseShell screen="form" /></CaseShellProvider>);
    fireEvent.click(await screen.findByRole("button", { name: "Dalej" })); await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/chat"));
    expect(mocks.start).toHaveBeenCalledWith(submitted);
    rerender(<CaseShellProvider><CaseShell screen="chat" /></CaseShellProvider>);
    expect(await screen.findByRole("article", { name: "Wstępna ocena początkowa" })).toHaveTextContent(decision.summary);
    expect(screen.getByRole("complementary", { name: "Dane sprawy" })).toHaveTextContent(submitted.equipmentName);
    expect(screen.getByRole("status")).toHaveTextContent("Po odświeżeniu"); expect(mocks.restore).toHaveBeenCalledTimes(1); expect(mocks.start).toHaveBeenCalledTimes(1);
  });
  it("restores full completed history and initial details without a new first generation", async () => {
    const saved = completed(); saved.messages.push({ id: "employee-1", role: "user", parts: [{ type: "text", text: "Dodatkowy zapisany fakt." }] }, { id: "assistant-2", role: "assistant", parts: [{ type: "text", text: "Pełna zapisana druga odpowiedź." }] }); saved.replyStates["assistant-2"] = "complete";
    mocks.restore.mockReturnValue({ status: "restored", snapshot: saved }); render(<CaseShellProvider><CaseShell screen="chat" /></CaseShellProvider>);
    expect(await screen.findByRole("article", { name: "Wstępna ocena początkowa" })).toHaveTextContent(decision.summary);
    expect(screen.getByText("Dodatkowy zapisany fakt.")).toBeVisible(); expect(screen.getByText("Pełna zapisana druga odpowiedź.")).toBeVisible();
    expect(screen.getAllByRole("article", { name: "Wstępna ocena początkowa" })).toHaveLength(1); expect(mocks.start).not.toHaveBeenCalled(); expect(mocks.push).not.toHaveBeenCalled(); expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });
  it.each(["missing", "unreadable"])("guards direct chat for %s without overwriting saved content", async status => {
    mocks.restore.mockReturnValue({ status }); render(<CaseShellProvider><CaseShell screen="chat" /></CaseShellProvider>);
    expect(await screen.findByRole("link", { name: "Wróć do formularza" })).toHaveAttribute("href", "/"); expect(screen.queryByRole("article")).not.toBeInTheDocument(); expect(mocks.start).not.toHaveBeenCalled(); expect(mocks.checkpoint).not.toHaveBeenCalled();
  });
  it("invalidates downstream work before editing a draft", async () => {
    render(<CaseShellProvider><CaseShell screen="form" /></CaseShellProvider>); fireEvent.click(await screen.findByRole("button", { name: "Zmień dane" }));
    expect(mocks.invalidate).toHaveBeenCalledTimes(1); expect(mocks.checkpoint).toHaveBeenCalled();
    const calls = mocks.checkpoint.mock.calls; const saved = calls.at(-1)?.[0]; expect(saved.draftForm.equipmentName).toBe("Zmienione fakty"); expect(saved.imageAnalysis).toBeNull(); expect(saved.initialDecision).toBeNull(); expect(saved.submittedForm).toBeNull();
  });
});
