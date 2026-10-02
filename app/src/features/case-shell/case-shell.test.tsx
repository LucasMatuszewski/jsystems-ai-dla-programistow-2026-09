import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ActiveCaseSnapshot } from "@/lib/contracts/session";
import type { InitialWorkflowDependencies } from "@/features/case-workflow/initial-workflow-controller";
import { CaseShell, CaseShellProvider } from "./case-shell";
import type { CaseChatProps } from "@/features/case-chat/case-chat";

const mocks = vi.hoisted(() => ({ restore: vi.fn(), discard: vi.fn(), save: vi.fn(), checkpoint: vi.fn(), newCase: vi.fn(), dispose: vi.fn(), warning: vi.fn(), push: vi.fn(), replace: vi.fn(), start: vi.fn(), retry: vi.fn(), cancel: vi.fn(), invalidate: vi.fn(), controllerDispose: vi.fn(), controllerFactory: vi.fn(), adapterFactory: vi.fn(), processing: vi.fn(), prepare: vi.fn(), screenFiles: vi.fn(), picker: vi.fn(), chatProps: null as CaseChatProps | null, chatCancel: vi.fn(), chatSeeds: [] as string[] }));
vi.mock("@/features/case-chat/case-chat", async () => {
  const { useEffect, useState } = await import("react");
  return { CaseChat: (props: CaseChatProps) => {
    mocks.chatProps = props;
    useState(() => { mocks.chatSeeds.push(props.initialSnapshot.caseId); return props.initialSnapshot.caseId; });
    const registerCancellation = props.registerCancellation;
    useEffect(() => registerCancellation(mocks.chatCancel), [registerCancellation]);
    return <div data-chat-case={props.initialSnapshot.caseId}><article aria-label="Wstępna ocena początkowa"><h1>Wstępna ocena początkowa</h1><p>{props.initialSnapshot.initialDecision?.summary}</p></article>{props.initialSnapshot.messages.slice(1).map(message => <p key={message.id}>{message.parts.map(part => part.text).join("")}</p>)}</div>;
  } };
});
vi.mock("./new-case-dialog", () => ({ NewCaseDialog: ({ open, onOpenChange, onConfirm }: { open: boolean; onOpenChange: (open: boolean) => void; onConfirm: () => void }) => open ? <div role="dialog" aria-label="Rozpocząć nową sprawę?"><button onClick={() => onOpenChange(false)}>Anuluj</button><button onClick={onConfirm}>Rozpocznij nową sprawę</button></div> : null }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push, replace: mocks.replace }) }));
vi.mock("@/features/session/session-adapter", () => ({ createSessionAdapter: mocks.adapterFactory }));
vi.mock("@/features/session/storage-notice", () => ({ StorageNotice: ({ warning }: { warning: string | null }) => warning ? <p role="status">Nie można zapisać sprawy. Po odświeżeniu odzyskanie sprawy może być niemożliwe.</p> : null }));
vi.mock("@/features/case-workflow/initial-workflow-controller", () => ({ createInitialWorkflowController: mocks.controllerFactory }));
vi.mock("@/features/case-workflow/initial-api-client", () => ({ analyzeInitialCase: vi.fn(), decideInitialCase: vi.fn() }));
vi.mock("@/features/case-workflow/image-preparation-client", () => ({ prepareEquipmentImage: mocks.prepare, screenEquipmentImageFiles: mocks.screenFiles }));
vi.mock("@/features/case-form/case-form", () => ({ CaseForm: ({ value, onValidSubmit, onChange, imageSlot }: { value: object; onValidSubmit: (form: object) => void; onChange: (form: object) => void; imageSlot: React.ReactNode }) => <form aria-label="Dane sprawy" onSubmit={event => { event.preventDefault(); onValidSubmit(submitted); }}><span>{JSON.stringify(value)}</span><button type="submit">Dalej</button><button type="button" onClick={() => onChange({ ...submitted, equipmentName: "Zmienione fakty" })}>Zmień dane</button>{imageSlot}</form> }));
vi.mock("@/features/case-form/equipment-image-picker", () => ({ EquipmentImagePicker: ({ state, onSelect }: { state: { status: string }; onSelect: (files: File[]) => void }) => { mocks.picker(state); return <><p>Zdjęcie przygotowane.</p><button type="button" onClick={() => onSelect([new File(["image"], "photo.jpg", { type: "image/jpeg" })])}>Wybierz zdjęcie</button></>; } }));
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
  mocks.chatProps = null; mocks.chatSeeds = [];
  mocks.restore.mockReturnValue({ status: "restored", snapshot: formCase() }); mocks.warning.mockReturnValue(null);
  mocks.newCase.mockReturnValue({ status: "saved" }); mocks.discard.mockReturnValue({ status: "removed" }); mocks.save.mockReturnValue({ status: "saved" });
  mocks.adapterFactory.mockImplementation(() => ({ restore: mocks.restore, discard: mocks.discard, save: mocks.save, checkpoint: mocks.checkpoint, startNewCase: mocks.newCase, dispose: mocks.dispose, getWarning: mocks.warning, flush: vi.fn() }));
  mocks.controllerFactory.mockImplementation((options: InitialWorkflowDependencies) => { dependencies = options; return { start: mocks.start, retry: mocks.retry, returnToForm: mocks.cancel, invalidate: mocks.invalidate, dispose: mocks.controllerDispose }; });
  mocks.start.mockImplementation(async (form: object) => { dependencies.checkpoint({ ...completed(), caseId: dependencies.readCase().caseId, submittedForm: form as ActiveCaseSnapshot["submittedForm"] }); dependencies.onView({ pending: false, error: null }); dependencies.onComplete(); });
});
describe("one hydrated live case across form and chat", () => {
  it("mounts one seeded chat after valid hydration and keeps the hook owner stable through checkpoints", async () => {
    mocks.restore.mockReturnValue({ status: "restored", snapshot: completed() });
    render(<CaseShellProvider><CaseShell screen="chat" caseId={caseId} /></CaseShellProvider>);
    await screen.findByRole("article", { name: "Wstępna ocena początkowa" });
    expect(mocks.chatSeeds).toEqual([caseId]);
    const owner = mocks.chatProps!;
    const user = { id: "follow-up", role: "user" as const, parts: [{ type: "text" as const, text: "Zachowane pytanie" }] };
    act(() => expect(owner.checkpoint({ messages: [...completed().messages, user], replyStates: completed().replyStates, pendingOperation: null, stageStatus: "idle" }, "immediate")).toBe(true));
    expect(mocks.checkpoint).toHaveBeenLastCalledWith(expect.objectContaining({ caseId, messages: [...completed().messages, user], revision: 5 }), "immediate");
    expect(screen.getByText("Zachowane pytanie")).toBeVisible(); expect(mocks.chatSeeds).toEqual([caseId]);
  });
  it("cancels chat before archiving accepted canonical text and rejects the departing owner's late writes", async () => {
    mocks.restore.mockReturnValue({ status: "restored", snapshot: completed() });
    render(<CaseShellProvider><CaseShell screen="chat" caseId={caseId} /></CaseShellProvider>);
    await screen.findByRole("article", { name: "Wstępna ocena początkowa" });
    const owner = mocks.chatProps!;
    const user = { id: "user-follow-up", role: "user" as const, parts: [{ type: "text" as const, text: "Zachowane pytanie" }] };
    const reply = { id: "partial-reply", role: "assistant" as const, parts: [{ type: "text" as const, text: "Część odpowiedzi", state: "done" as const }] };
    mocks.chatCancel.mockImplementation(() => owner.checkpoint({ messages: [...completed().messages, user, reply], replyStates: { ...completed().replyStates, [reply.id]: "interrupted" }, pendingOperation: null, stageStatus: "idle" }, "immediate"));
    fireEvent.click(screen.getByRole("button", { name: "Nowa sprawa" })); fireEvent.click(screen.getByRole("button", { name: "Rozpocznij nową sprawę" }));
    expect(mocks.chatCancel).toHaveBeenCalledTimes(1);
    expect(mocks.newCase.mock.calls[0][0]).toMatchObject({ caseId, messages: [...completed().messages, user, reply], replyStates: { [reply.id]: "interrupted" } });
    const count = mocks.checkpoint.mock.calls.length;
    act(() => expect(owner.checkpoint({ messages: completed().messages, replyStates: completed().replyStates, pendingOperation: null, stageStatus: "idle" }, "immediate")).toBe(false));
    expect(mocks.checkpoint).toHaveBeenCalledTimes(count);
  });
  it("does not reopen the old UUID while the router is still leaving its page after confirmed new case", async () => {
    mocks.restore.mockReturnValue({ status: "restored", snapshot: completed() });
    const { rerender } = render(<CaseShellProvider><CaseShell screen="chat" caseId={caseId} /></CaseShellProvider>);
    await screen.findByRole("article", { name: "Wstępna ocena początkowa" });
    fireEvent.click(screen.getByRole("button", { name: "Nowa sprawa" }));
    fireEvent.click(screen.getByRole("button", { name: "Rozpocznij nową sprawę" }));
    const fresh = mocks.newCase.mock.calls[0][1];
    expect(mocks.push).toHaveBeenCalledWith("/");
    // The navigation promise has not committed: /chat/A is still mounted here.
    expect(mocks.restore).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("article")).not.toBeInTheDocument();
    expect(dependencies.readCase().caseId).toBe(fresh.caseId);
    rerender(<CaseShellProvider><CaseShell screen="form" /></CaseShellProvider>);
    expect(await screen.findByRole("button", { name: "Dalej" })).toBeVisible();
    expect(screen.getByText(`ID sprawy: ${fresh.caseId}`)).toBeVisible();
    expect(dependencies.readCase()).toMatchObject({ caseId: fresh.caseId, submittedForm: null, preparedImage: null, initialDecision: null, messages: [] });
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(mocks.start).not.toHaveBeenCalled(); expect(mocks.checkpoint).not.toHaveBeenCalled();
  });
  it("aborts pending photo preparation truthfully when archival fails and ignores its late prepared result", async () => {
    let finishPreparation!: (value: { status: "prepared"; preparedImage: typeof image }) => void;
    mocks.screenFiles.mockImplementation((files: File[]) => ({ status: "valid", file: files[0] }));
    mocks.prepare.mockImplementation(() => new Promise(resolve => { finishPreparation = resolve; }));
    mocks.newCase.mockReturnValue({ status: "failed", warning: "quota-exceeded", notice: "Brak miejsca." });
    render(<CaseShellProvider><CaseShell screen="form" /></CaseShellProvider>);
    fireEvent.click(await screen.findByRole("button", { name: "Wybierz zdjęcie" }));
    expect(mocks.picker.mock.calls.at(-1)?.[0]).toMatchObject({ status: "pending" });
    const signal: AbortSignal = mocks.prepare.mock.calls[0][1].signal;
    fireEvent.click(screen.getByRole("button", { name: "Nowa sprawa" }));
    fireEvent.click(screen.getByRole("button", { name: "Rozpocznij nową sprawę" }));
    expect(signal.aborted).toBe(true);
    expect(mocks.newCase.mock.calls[0][0]).toMatchObject({ caseId, stage: "preparation", stageStatus: "interrupted", preparedImage: null });
    expect(mocks.picker.mock.calls.at(-1)?.[0]).toMatchObject({ status: "interrupted" });
    expect(screen.getByRole("button", { name: "Wybierz zdjęcie" })).toBeEnabled();
    const checkpointCount = mocks.checkpoint.mock.calls.length;
    await act(async () => { finishPreparation({ status: "prepared", preparedImage: image }); });
    expect(mocks.checkpoint).toHaveBeenCalledTimes(checkpointCount);
    expect(mocks.picker.mock.calls.at(-1)?.[0]).toMatchObject({ status: "interrupted" });
    expect(mocks.push).not.toHaveBeenCalled();
  });
  it("clears unknown-route recovery when returning to the current unfinished form", async () => {
    mocks.restore.mockImplementation((id?: string) => id ? { status: "missing" } : { status: "restored", snapshot: formCase() });
    const { rerender } = render(<CaseShellProvider><CaseShell screen="chat" caseId={operationId} /></CaseShellProvider>);
    await screen.findByRole("heading", { name: "Nie znaleziono zapisanej sprawy" });
    rerender(<CaseShellProvider><CaseShell screen="form" /></CaseShellProvider>);
    expect(await screen.findByRole("button", { name: "Nowa sprawa" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Dalej" })).toBeVisible();
    expect(mocks.checkpoint).not.toHaveBeenCalled();
    expect(mocks.push).not.toHaveBeenCalled();
  });
  it("rearms the canonical redirect when returning to root after a live completed case and unknown UUID", async () => {
    const { rerender } = render(<CaseShellProvider><CaseShell screen="form" /></CaseShellProvider>);
    fireEvent.click(await screen.findByRole("button", { name: "Dalej" }));
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith(`/chat/${caseId}`));
    rerender(<CaseShellProvider><CaseShell screen="chat" caseId={caseId} /></CaseShellProvider>);
    await screen.findByRole("article", { name: "Wstępna ocena początkowa" });
    mocks.restore.mockReturnValue({ status: "missing" });
    rerender(<CaseShellProvider><CaseShell screen="chat" caseId={operationId} /></CaseShellProvider>);
    await screen.findByRole("heading", { name: "Nie znaleziono zapisanej sprawy" });
    const redirects = mocks.replace.mock.calls.length;
    rerender(<CaseShellProvider><CaseShell screen="form" /></CaseShellProvider>);
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledTimes(redirects + 1));
    expect(mocks.replace).toHaveBeenLastCalledWith(`/chat/${caseId}`);
    expect(mocks.start).toHaveBeenCalledTimes(1);
  });
  it("keeps failed archival pending work interrupted and rejects callbacks from the disposed owner", async () => {
    const pending: ActiveCaseSnapshot = { ...formCase(), stage: "decision", stageStatus: "pending", submittedForm: submitted, imageAnalysis: report, pendingOperation: { kind: "decision", operationId, startedAt: "2026-10-01T08:00:00Z" } };
    mocks.restore.mockReturnValue({ status: "restored", snapshot: pending });
    mocks.newCase.mockReturnValue({ status: "failed", warning: "quota-exceeded", notice: "Brak miejsca." });
    render(<CaseShellProvider><CaseShell screen="form" /></CaseShellProvider>);
    await screen.findByRole("region", { name: "Przygotowanie wstępnej oceny" });
    const previousOwner = dependencies;
    fireEvent.click(screen.getByRole("button", { name: "Nowa sprawa" }));
    fireEvent.click(screen.getByRole("button", { name: "Rozpocznij nową sprawę" }));
    expect(mocks.processing.mock.calls.at(-1)?.[0]).toMatchObject({ caseId, stageStatus: "interrupted", imageAnalysis: report, submittedForm: submitted });
    fireEvent.click(screen.getByRole("button", { name: "Spróbuj ponownie" }));
    expect(mocks.retry).toHaveBeenCalledTimes(1);
    expect(dependencies).not.toBe(previousOwner);
    previousOwner.checkpoint(completed()); previousOwner.onComplete();
    expect(mocks.checkpoint).not.toHaveBeenCalled();
    expect(mocks.push).not.toHaveBeenCalled();
    expect(screen.getByRole("region", { name: "Przygotowanie wstępnej oceny" })).toBeVisible();
  });
  it("removes the previous case card immediately when the same provider navigates to an unknown UUID", async () => {
    mocks.restore.mockImplementation((id?: string) => id && id !== caseId ? { status: "missing" } : { status: "restored", snapshot: completed() });
    const { rerender } = render(<CaseShellProvider><CaseShell {...{ screen: "chat" as const, caseId }} /></CaseShellProvider>);
    await screen.findByRole("article", { name: "Wstępna ocena początkowa" });
    rerender(<CaseShellProvider><CaseShell {...{ screen: "chat" as const, caseId: operationId }} /></CaseShellProvider>);
    expect(screen.queryByRole("article")).not.toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Nie znaleziono zapisanej sprawy" })).toBeVisible();
  });
  it("archives all old facts and starts a blank UUID only after successful confirmed save", async () => {
    const old = completed(); mocks.restore.mockReturnValue({ status: "restored", snapshot: old });
    render(<CaseShellProvider><CaseShell screen="chat" /></CaseShellProvider>);
    fireEvent.click(await screen.findByRole("button", { name: "Nowa sprawa" }));
    fireEvent.click(screen.getByRole("button", { name: "Rozpocznij nową sprawę" }));
    expect(mocks.newCase).toHaveBeenCalledTimes(1);
    const [archived, fresh] = mocks.newCase.mock.calls[0];
    expect(archived).toEqual(old);
    expect(fresh.caseId).not.toBe(old.caseId);
    expect(fresh).toMatchObject({ screen: "form", stage: "form", stageStatus: "idle", submittedForm: null, preparedImage: null, imageAnalysis: null, initialDecision: null, messages: [], replyStates: {}, pendingOperation: null, draftForm: { scenario: "", equipmentName: "", reason: "" } });
    expect(mocks.controllerDispose).toHaveBeenCalledTimes(1);
    expect(mocks.invalidate).not.toHaveBeenCalled();
    expect(mocks.push).toHaveBeenCalledWith("/");
  });
  it("keeps the old complete live case when saving the new-case archive fails", async () => {
    mocks.restore.mockReturnValue({ status: "restored", snapshot: completed() });
    mocks.newCase.mockReturnValue({ status: "failed", warning: "quota-exceeded", notice: "Brak miejsca." });
    render(<CaseShellProvider><CaseShell screen="chat" /></CaseShellProvider>);
    fireEvent.click(await screen.findByRole("button", { name: "Nowa sprawa" }));
    fireEvent.click(screen.getByRole("button", { name: "Rozpocznij nową sprawę" }));
    expect(screen.getByRole("article", { name: "Wstępna ocena początkowa" })).toHaveTextContent(decision.summary);
    expect(mocks.push).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent("Po odświeżeniu");
  });
  it("never displays another active case for an unknown UUID route", async () => {
    mocks.restore.mockImplementation((id?: string) => id ? { status: "missing" } : { status: "restored", snapshot: completed() });
    render(<CaseShellProvider><CaseShell {...{ screen: "chat" as const, caseId: operationId }} /></CaseShellProvider>);
    expect(await screen.findByRole("heading", { name: "Nie znaleziono zapisanej sprawy" })).toBeVisible();
    expect(screen.queryByRole("article")).not.toBeInTheDocument();
    expect(mocks.start).not.toHaveBeenCalled();
  });
  it("offers a confirmed new case while keeping the existing complete assessment until confirmation", async () => {
    mocks.restore.mockReturnValue({ status: "restored", snapshot: completed() });
    render(<CaseShellProvider><CaseShell screen="chat" /></CaseShellProvider>);
    await screen.findByRole("article", { name: "Wstępna ocena początkowa" });
    fireEvent.click(screen.getByRole("button", { name: "Nowa sprawa" }));
    expect(screen.getByRole("dialog", { name: "Rozpocząć nową sprawę?" })).toBeVisible();
    expect(screen.getByRole("article", { name: "Wstępna ocena początkowa" })).toHaveTextContent(decision.summary);
    expect(mocks.invalidate).not.toHaveBeenCalled();
    expect(mocks.checkpoint).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Anuluj" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(mocks.push).not.toHaveBeenCalled();
    expect(screen.getByRole("article", { name: "Wstępna ocena początkowa" })).toHaveTextContent(decision.summary);
  });
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
    fireEvent.click(await screen.findByRole("button", { name: "Dalej" })); await waitFor(() => expect(mocks.push).toHaveBeenCalledWith(`/chat/${caseId}`));
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


describe("explicit recovery of unreadable local data", () => {
  const label = "Wyczyść zapis i rozpocznij nową sprawę";
  const preservingLabel = "Rozpocznij nową sprawę, zachowując zapis";
  it.each(["form", "chat"] as const)("offers recovery on %s without automatic writes or deletion", async mode => {
    mocks.restore.mockReturnValue({ status: "unreadable" });
    render(<CaseShellProvider><CaseShell screen={mode} /></CaseShellProvider>);
    expect(await screen.findByRole("button", { name: label })).toBeVisible();
    expect(mocks.discard).not.toHaveBeenCalled(); expect(mocks.save).not.toHaveBeenCalled(); expect(mocks.checkpoint).not.toHaveBeenCalled(); expect(mocks.start).not.toHaveBeenCalled();
  });
  it("offers recovery for an unsupported checkpoint without rendering its contents", async () => {
    mocks.restore.mockReturnValue({ status: "restored", snapshot: { ...completed(), initialDecision: null } });
    render(<CaseShellProvider><CaseShell screen="form" /></CaseShellProvider>);
    expect(await screen.findByRole("button", { name: preservingLabel })).toBeVisible(); expect(screen.queryByRole("article")).not.toBeInTheDocument();
  });
  it("opens confirmation with safe cancel focus and preserves data on cancellation and Escape", async () => {
    mocks.restore.mockReturnValue({ status: "unreadable" });
    render(<CaseShellProvider><CaseShell screen="form" /></CaseShellProvider>);
    const trigger = await screen.findByRole("button", { name: label }); fireEvent.click(trigger);
    expect(await screen.findByRole("dialog", { name: "Usunąć nieczytelny zapis?" })).toHaveTextContent("Wszystkie zapisane sprawy tej aplikacji");
    await waitFor(() => expect(screen.getByRole("button", { name: "Anuluj" })).toHaveFocus());
    fireEvent.click(screen.getByRole("button", { name: "Anuluj" })); await waitFor(() => expect(trigger).toHaveFocus());
    fireEvent.click(trigger); fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(mocks.discard).not.toHaveBeenCalled(); expect(mocks.save).not.toHaveBeenCalled(); expect(mocks.push).not.toHaveBeenCalled();
  });
  it("removes only on confirmation, invalidates old work before publishing a blank new UUID and routes to form", async () => {
    mocks.restore.mockReturnValue({ status: "unreadable" });
    render(<CaseShellProvider><CaseShell screen="chat" /></CaseShellProvider>);
    fireEvent.click(await screen.findByRole("button", { name: label })); fireEvent.click(screen.getByRole("button", { name: "Usuń zapis i rozpocznij nową sprawę" }));
    expect(mocks.discard).toHaveBeenCalledTimes(1); expect(mocks.newCase).not.toHaveBeenCalled();
    expect(mocks.save).toHaveBeenCalledTimes(1); const next = mocks.save.mock.calls[0][0] as ActiveCaseSnapshot;
    expect(next.caseId).not.toBe(caseId); expect(next.caseId).toMatch(/^[0-9a-f-]{36}$/); expect(next).toMatchObject({ screen: "form", stage: "form", preparedImage: null, imageAnalysis: null, initialDecision: null, submittedForm: null, messages: [], replyStates: {}, pendingOperation: null });
    expect(next.draftForm.equipmentName).toBe(""); expect(mocks.dispose.mock.invocationCallOrder.at(-1)).toBeLessThan(mocks.save.mock.invocationCallOrder[0]); expect(mocks.push).toHaveBeenCalledWith("/"); expect(mocks.start).not.toHaveBeenCalled();
  });
  it.each(["failed", "changed"])("keeps blocked state after %s discard and allows an explicit retry", async status => {
    mocks.restore.mockReturnValue({ status: "unreadable" }); mocks.discard.mockReturnValue({ status, warning: "unavailable", notice: "Zapis zmienił się. Odśwież stronę." });
    render(<CaseShellProvider><CaseShell screen="form" /></CaseShellProvider>);
    fireEvent.click(await screen.findByRole("button", { name: label })); fireEvent.click(screen.getByRole("button", { name: "Usuń zapis i rozpocznij nową sprawę" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Odśwież stronę"); expect(mocks.save).not.toHaveBeenCalled(); expect(mocks.push).not.toHaveBeenCalled(); expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: label })); expect(screen.getByRole("dialog")).toBeVisible();
  });
  it("retains a live empty form and Polish warning when saving after successful removal fails", async () => {
    mocks.restore.mockReturnValue({ status: "unreadable" }); mocks.save.mockReturnValue({ status: "failed", warning: "unavailable", notice: "Nie można zapisać sprawy." });
    render(<CaseShellProvider><CaseShell screen="form" /></CaseShellProvider>);
    fireEvent.click(await screen.findByRole("button", { name: label })); fireEvent.click(screen.getByRole("button", { name: "Usuń zapis i rozpocznij nową sprawę" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Nie można zapisać"); expect(screen.queryByRole("button", { name: label })).not.toBeInTheDocument(); expect(mocks.push).toHaveBeenCalledWith("/");
  });
  it("does not offer destructive recovery for a valid case or a persistence warning", async () => {
    mocks.warning.mockReturnValue("quota-exceeded"); render(<CaseShellProvider><CaseShell screen="form" /></CaseShellProvider>);
    await screen.findByRole("button", { name: "Nowa sprawa" }); expect(screen.queryByRole("button", { name: label })).not.toBeInTheDocument();
  });
  it("focuses the new form after recovery instead of leaving focus on the removed dialog", async () => {
    mocks.restore.mockReturnValue({ status: "unreadable" });
    render(<CaseShellProvider><CaseShell screen="form" /></CaseShellProvider>);
    fireEvent.click(await screen.findByRole("button", { name: label })); fireEvent.click(screen.getByRole("button", { name: "Usuń zapis i rozpocznij nową sprawę" }));
    await waitFor(() => expect(screen.getByRole("main")).toHaveFocus());
  });
  it("invalidates callbacks of an unsupported selected checkpoint before recovering", async () => {
    const selectedId = "7b40b034-5e7b-49dc-bb47-e8d8d2d5fc76";
    const unsupported = { ...completed(), caseId: selectedId, initialDecision: null };
    mocks.restore.mockImplementation((id?: string) => ({ status: "restored", snapshot: id ? unsupported : formCase() }));
    render(<CaseShellProvider><CaseShell screen="chat" caseId={selectedId} /></CaseShellProvider>);
    fireEvent.click(await screen.findByRole("button", { name: preservingLabel })); const old = dependencies;
    fireEvent.click(screen.getByRole("button", { name: "Zachowaj zapis i rozpocznij nową sprawę" }));
    const saved = mocks.save.mock.calls[0][0]; mocks.checkpoint.mockClear(); mocks.push.mockClear();
    act(() => { old.checkpoint(unsupported); old.onComplete(); });
    expect(mocks.checkpoint).not.toHaveBeenCalled(); expect(mocks.push).not.toHaveBeenCalled(); expect(dependencies.readCase().caseId).toBe(saved.caseId);
  });
  it("publishes the blank UUID only after a successful atomic preserving append, without saving twice", async () => {
    mocks.restore.mockReturnValue({ status: "restored", snapshot: { ...completed(), initialDecision: null } }); mocks.discard.mockReturnValue({ status: "preserved" });
    render(<CaseShellProvider><CaseShell screen="form" /></CaseShellProvider>);
    fireEvent.click(await screen.findByRole("button", { name: preservingLabel }));
    expect(screen.getByRole("dialog")).toHaveTextContent("zostaną zachowane"); fireEvent.click(screen.getByRole("button", { name: "Zachowaj zapis i rozpocznij nową sprawę" }));
    expect(mocks.discard).toHaveBeenCalledWith(expect.objectContaining({ replacement: expect.objectContaining({ stage: "form", messages: [] }) })); expect(mocks.save).not.toHaveBeenCalled(); expect(mocks.push).toHaveBeenCalledWith("/"); expect(screen.queryByRole("button", { name: preservingLabel })).not.toBeInTheDocument();
  });
  it("keeps unsupported state blocked when preserving append fails", async () => {
    mocks.restore.mockReturnValue({ status: "restored", snapshot: { ...completed(), initialDecision: null } }); mocks.discard.mockReturnValue({ status: "failed", warning: "quota-exceeded", notice: "Zachowano zapis. Nie rozpoczęto nowej sprawy." });
    render(<CaseShellProvider><CaseShell screen="form" /></CaseShellProvider>);
    fireEvent.click(await screen.findByRole("button", { name: preservingLabel })); fireEvent.click(screen.getByRole("button", { name: "Zachowaj zapis i rozpocznij nową sprawę" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Nie rozpoczęto nowej sprawy"); expect(mocks.save).not.toHaveBeenCalled(); expect(mocks.push).not.toHaveBeenCalled(); expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });
  it.each(["removed", "preserved"])("invalidates old owners before the %s recovery storage mutation", async status => {
    mocks.restore.mockReturnValue({ status: "unreadable" }); mocks.discard.mockReturnValue({ status });
    render(<CaseShellProvider><CaseShell screen="form" /></CaseShellProvider>);
    fireEvent.click(await screen.findByRole("button", { name: label })); fireEvent.click(screen.getByRole("button", { name: "Usuń zapis i rozpocznij nową sprawę" }));
    expect(mocks.dispose.mock.invocationCallOrder.at(-1)).toBeLessThan(mocks.discard.mock.invocationCallOrder[0]);
  });
  it.each(["form", "chat"] as const)("does not claim a live current case after failed preserving append on %s", async mode => {
    mocks.restore.mockReturnValue({ status: "restored", snapshot: { ...completed(), initialDecision: null } });
    mocks.adapterFactory.mockImplementation((options: { onWriteResult: (result: unknown) => void }) => ({ restore: mocks.restore, discard: () => {
      const failed = { status: "failed", warning: "quota-exceeded", notice: "Zachowano zapis. Nie rozpoczęto nowej sprawy." };
      options.onWriteResult(failed); return failed;
    }, save: mocks.save, checkpoint: mocks.checkpoint, startNewCase: mocks.newCase, dispose: mocks.dispose, getWarning: mocks.warning, flush: vi.fn() }));
    render(<CaseShellProvider><CaseShell screen={mode} /></CaseShellProvider>);
    fireEvent.click(await screen.findByRole("button", { name: preservingLabel })); fireEvent.click(screen.getByRole("button", { name: "Zachowaj zapis i rozpocznij nową sprawę" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Nie rozpoczęto nowej sprawy"); expect(screen.queryByRole("status")).not.toBeInTheDocument(); expect(mocks.save).not.toHaveBeenCalled(); expect(mocks.push).not.toHaveBeenCalled();
  });
});
