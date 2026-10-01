"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CaseForm, type CaseFormValues } from "@/features/case-form/case-form";
import { EquipmentImagePicker, type ImagePickerState } from "@/features/case-form/equipment-image-picker";
import { prepareEquipmentImage, screenEquipmentImageFiles } from "@/features/case-workflow/image-preparation-client";
import { analyzeInitialCase, decideInitialCase } from "@/features/case-workflow/initial-api-client";
import { createInitialWorkflowController, type InitialWorkflowView } from "@/features/case-workflow/initial-workflow-controller";
import { ProcessingSteps } from "@/features/case-workflow/processing-steps";
import { createSessionAdapter, type CheckpointKind, type StorageWarning } from "@/features/session/session-adapter";
import { StorageNotice } from "@/features/session/storage-notice";
import { InitialDecisionDetails } from "@/features/case-chat/initial-decision-details";
import { CaseSummary } from "@/features/case-chat/case-summary";
import { Conversation, ConversationContent } from "@/components/ai-elements/conversation";
import { Message, MessageContent } from "@/components/ai-elements/message";
import type { CaseForm as SubmittedForm } from "@/lib/contracts/form";
import type { ActiveCaseSnapshot } from "@/lib/contracts/session";

const emptyValues: CaseFormValues = { scenario: "", category: "", equipmentName: "", purchaseDate: "", deliveryDate: "", buyerStatus: "", sellerStatus: "", reason: "", requestedRemedy: "" };
const unreadableNotice = "Nie można odczytać zapisanej sprawy. Zachowano jej zapis. Ten formularz nie może go teraz zmienić.";

function hasCompleteCase(snapshot: ActiveCaseSnapshot | null): boolean {
  if (!snapshot?.submittedForm || !snapshot.preparedImage || !snapshot.imageAnalysis || !snapshot.initialDecision || snapshot.screen !== "chat" || snapshot.stage !== "chat") return false;
  const first = snapshot.messages[0];
  return first?.role === "assistant" && first.parts.map(part => part.text).join("").trim().length > 0 && snapshot.replyStates[first.id] === "complete" && !first.parts.some(part => part.state === "streaming") && first.metadata?.completionState !== "incomplete";
}

function supportedCheckpoint(snapshot: ActiveCaseSnapshot): boolean {
  if (snapshot.initialDecision || snapshot.screen === "chat" || snapshot.messages.length) return hasCompleteCase(snapshot);
  if (snapshot.stage === "form" || snapshot.stage === "preparation") return !snapshot.imageAnalysis;
  return snapshot.submittedForm !== null && snapshot.preparedImage !== null && (snapshot.stage === "analysis" || (snapshot.stage === "decision" && snapshot.imageAnalysis !== null));
}

type ShellState = {
  initialized: boolean; snapshot: ActiveCaseSnapshot | null; blocked: string | null; warning: StorageWarning | null;
  image: ImagePickerState; missingImage: boolean; imageInputRef: RefObject<HTMLInputElement | null>; view: InitialWorkflowView;
  changeDraft: (next: CaseFormValues) => void; submit: (form: SubmittedForm) => void;
  selectImage: (files: readonly File[]) => Promise<void>; removeImage: () => void; retryImage: () => void;
  requireImage: () => void; retry: () => void; returnToForm: () => void; showCompletedCase: () => void;
};
const ShellContext = createContext<ShellState | null>(null);

export function CaseShellProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const routerRef = useRef(router);
  useEffect(() => { routerRef.current = router; }, [router]);
  const [initialized, setInitialized] = useState(false);
  const [snapshot, setSnapshot] = useState<ActiveCaseSnapshot | null>(null);
  const [blocked, setBlocked] = useState<string | null>(null);
  const [warning, setWarning] = useState<StorageWarning | null>(null);
  const [image, setImage] = useState<ImagePickerState>({ status: "empty" });
  const [missingImage, setMissingImage] = useState(false);
  const [view, setView] = useState<InitialWorkflowView>({ pending: false, error: null });
  const snapshotRef = useRef<ActiveCaseSnapshot | null>(null);
  const adapterRef = useRef<ReturnType<typeof createSessionAdapter> | null>(null);
  const workflowRef = useRef<ReturnType<typeof createInitialWorkflowController> | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const originalFile = useRef<File | null>(null);
  const preparationRef = useRef<{ caseId: string; operationId: string; startedAt: string; controller: AbortController } | null>(null);
  const mountedRef = useRef(false);
  const completionNavigationRef = useRef(false);
  const showCompletedCase = useCallback(() => {
    if (completionNavigationRef.current) return;
    completionNavigationRef.current = true;
    routerRef.current.replace("/chat");
  }, []);

  const publish = useCallback((next: ActiveCaseSnapshot, kind: CheckpointKind = "immediate") => {
    if (!mountedRef.current || !adapterRef.current) return;
    const current = { ...next, storageWarning: adapterRef.current.getWarning() };
    snapshotRef.current = current;
    setSnapshot(current);
    adapterRef.current.checkpoint(current, kind);
  }, []);

  useEffect(() => {
    let active = true;
    mountedRef.current = true;
    const adapter = createSessionAdapter({ storage: () => window.localStorage, onWriteResult: result => {
      if (!active) return;
      const nextWarning = result.status === "failed" ? result.warning : null;
      setWarning(nextWarning);
      if (snapshotRef.current) {
        const next = { ...snapshotRef.current, storageWarning: nextWarning };
        snapshotRef.current = next; setSnapshot(next);
      }
    } });
    adapterRef.current = adapter;
    const restored = adapter.restore();
    let current: ActiveCaseSnapshot | null = null;
    let notice: string | null = null;
    if (restored.status === "restored") {
      if (supportedCheckpoint(restored.snapshot)) {
        const saved = restored.snapshot;
        current = saved.submittedForm && !saved.initialDecision && saved.stage !== "form" && saved.stageStatus === "idle" ? { ...saved, stageStatus: "interrupted" } : saved;
      }
      else notice = unreadableNotice;
    } else if (restored.status === "unreadable") notice = unreadableNotice;
    else current = { schemaVersion: 1, caseId: crypto.randomUUID(), revision: 0, screen: "form", stage: "form", stageStatus: "idle", draftForm: { ...emptyValues }, submittedForm: null, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone, preparedImage: null, imageAnalysis: null, initialDecision: null, messages: [], replyStates: {}, pendingOperation: null, storageWarning: null };
    snapshotRef.current = current;
    if (current) workflowRef.current = createInitialWorkflowController({
      readCase: () => snapshotRef.current!, checkpoint: publish, readOriginalFile: () => originalFile.current,
      analyze: analyzeInitialCase, decide: decideInitialCase, prepare: prepareEquipmentImage,
      now: () => Date.now(), makeOperationId: () => crypto.randomUUID(), makeMessageId: () => crypto.randomUUID(),
      onView: next => { if (active) setView(next); },
      onComplete: () => { if (active && hasCompleteCase(snapshotRef.current)) { completionNavigationRef.current = true; routerRef.current.push("/chat"); } },
    });
    queueMicrotask(() => {
      if (!active) return;
      setSnapshot(current); setBlocked(notice); setWarning(adapter.getWarning()); setInitialized(true);
      if (current?.preparedImage) setImage({ status: "ready", preparedImage: current.preparedImage });
      else if (current?.stage === "preparation" && current.stageStatus === "interrupted") setImage({ status: "interrupted", message: "Przygotowywanie zdjęcia zostało przerwane. Wybierz zdjęcie ponownie, aby kontynuować." });
    });
    return () => {
      active = false; mountedRef.current = false;
      preparationRef.current?.controller.abort(); preparationRef.current = null;
      workflowRef.current?.dispose(); workflowRef.current = null;
      adapter.dispose(); adapterRef.current = null; snapshotRef.current = null; originalFile.current = null;
    };
  }, [publish]);

  function checkpoint(changes: Partial<ActiveCaseSnapshot>, kind: CheckpointKind = "immediate") {
    const current = snapshotRef.current;
    if (current) publish({ ...current, ...changes, revision: current.revision + 1 }, kind);
  }
  function cancelPreparation() { preparationRef.current?.controller.abort(); preparationRef.current = null; setMissingImage(false); }
  async function selectImage(files: readonly File[]) {
    const current = snapshotRef.current;
    if (!current || hasCompleteCase(current)) return;
    cancelPreparation(); workflowRef.current?.invalidate(); originalFile.current = null; setImage({ status: "empty" });
    const selected = screenEquipmentImageFiles(files);
    if (selected.status === "invalid") {
      setImage({ status: "failed", message: selected.message, retryable: false });
      checkpoint({ preparedImage: null, submittedForm: null, stage: "form", stageStatus: "idle", pendingOperation: null, imageAnalysis: null, initialDecision: null, messages: [], replyStates: {} }); return;
    }
    originalFile.current = selected.file;
    const operation = { caseId: current.caseId, operationId: crypto.randomUUID(), startedAt: new Date().toISOString(), controller: new AbortController() };
    preparationRef.current = operation; setImage({ status: "pending" });
    checkpoint({ preparedImage: null, submittedForm: null, stage: "preparation", stageStatus: "pending", pendingOperation: { kind: "preparation", operationId: operation.operationId, startedAt: operation.startedAt }, imageAnalysis: null, initialDecision: null, messages: [], replyStates: {} });
    const result = await prepareEquipmentImage(selected.file, { signal: operation.controller.signal });
    if (!mountedRef.current || operation.controller.signal.aborted || preparationRef.current?.operationId !== operation.operationId || snapshotRef.current?.caseId !== operation.caseId) return;
    preparationRef.current = null;
    if (result.status === "prepared") {
      setImage({ status: "ready", preparedImage: result.preparedImage });
      checkpoint({ preparedImage: result.preparedImage, stage: "form", stageStatus: "idle", pendingOperation: null });
    } else {
      setImage(result.status === "failed" ? { status: "failed", message: result.message, retryable: result.retryable } : { status: "interrupted", message: "Przygotowywanie zdjęcia zostało przerwane. Wybierz zdjęcie ponownie." });
      checkpoint({ preparedImage: null, stage: "form", stageStatus: "idle", pendingOperation: null });
    }
  }
  function removeImage() {
    if (!snapshotRef.current || hasCompleteCase(snapshotRef.current)) return;
    cancelPreparation(); workflowRef.current?.invalidate(); originalFile.current = null; setImage({ status: "empty" });
    checkpoint({ preparedImage: null, stage: "form", stageStatus: "idle", pendingOperation: null });
  }
  function changeDraft(next: CaseFormValues) {
    if (!snapshotRef.current || hasCompleteCase(snapshotRef.current)) return;
    workflowRef.current?.invalidate(); setMissingImage(false);
    const preparation = preparationRef.current;
    checkpoint({ draftForm: { ...next }, submittedForm: null, imageAnalysis: null, initialDecision: null, messages: [], replyStates: {}, ...(preparation ? { stage: "preparation" as const, stageStatus: "pending" as const, pendingOperation: { kind: "preparation" as const, operationId: preparation.operationId, startedAt: preparation.startedAt } } : {}) }, "draft");
  }
  function returnToForm() {
    cancelPreparation(); workflowRef.current?.returnToForm();
    const current = snapshotRef.current;
    if (current?.preparedImage) setImage({ status: "ready", preparedImage: current.preparedImage });
    else setImage({ status: "empty" });
  }
  const state: ShellState = { initialized, snapshot, blocked, warning, image, missingImage, imageInputRef, view, changeDraft,
    submit: form => { if (snapshotRef.current?.preparedImage && !hasCompleteCase(snapshotRef.current)) void workflowRef.current?.start(form); },
    selectImage, removeImage, retryImage: () => { if (originalFile.current) void selectImage([originalFile.current]); },
    requireImage: () => setMissingImage(true), retry: () => { void workflowRef.current?.retry(); }, returnToForm,
    showCompletedCase,
  };
  return <ShellContext.Provider value={state}>{children}</ShellContext.Provider>;
}

export function CaseShell({ screen }: { screen: "form" | "chat" }) {
  const state = useContext(ShellContext);
  const mainRef = useRef<HTMLElement>(null);
  if (!state) throw new Error("CaseShell requires its persistent provider.");
  const { initialized, snapshot, blocked, warning, view } = state;
  const complete = hasCompleteCase(snapshot);
  const showCompletedCase = state.showCompletedCase;
  useEffect(() => { if (initialized && screen === "form" && complete) showCompletedCase(); }, [initialized, screen, complete, showCompletedCase]);
  useEffect(() => { if (initialized && screen === "chat") mainRef.current?.focus(); }, [initialized, screen]);

  if (screen === "chat") {
    return <main ref={mainRef} id="main-content" tabIndex={-1} className="app-main">
      {!initialized ? <p>Wczytywanie zapisanej sprawy.</p> : !complete || !snapshot?.submittedForm || !snapshot.preparedImage || !snapshot.initialDecision ? <section className="max-w-[800px] rounded-[16px] border bg-card p-4 sm:p-6"><h1 className="text-2xl">Brak ukończonej oceny sprawy</h1><p className="my-4">{blocked ?? "Ta sprawa nie ma jeszcze pełnej oceny początkowej. Wróć do formularza, aby kontynuować."}</p><Link href="/" className="text-primary underline underline-offset-4">Wróć do formularza</Link></section> : <div className="grid min-w-0 items-start gap-6 md:grid-cols-[minmax(240px,320px)_minmax(0,1fr)]">
        <CaseSummary form={snapshot.submittedForm} preparedImage={snapshot.preparedImage} />
        <Conversation aria-label="Rozmowa w sprawie" className="min-w-0"><ConversationContent className="min-w-0 gap-6 p-0">
          {snapshot.messages.map((message, index) => <Message key={message.id} from={message.role} className="max-w-full min-w-0"><MessageContent className="w-full min-w-0">
            {index === 0 ? <InitialDecisionDetails decision={snapshot.initialDecision!} /> : <div className="grid min-w-0 gap-2 whitespace-pre-wrap rounded-[16px] border bg-card p-4 [overflow-wrap:anywhere]"><p className="text-sm text-muted-foreground">{message.role === "user" ? "Pracownik" : "Asystent"}</p>{message.parts.map((part, partIndex) => <p key={partIndex}>{part.text}</p>)}{message.role === "assistant" && snapshot.replyStates[message.id] !== "complete" && <p className="text-sm text-muted-foreground">Ta odpowiedź nie została ukończona.</p>}</div>}
          </MessageContent></Message>)}
        </ConversationContent></Conversation>
      </div>}
      <div className="mt-4"><StorageNotice warning={warning} /></div>
    </main>;
  }
  const processing = snapshot?.submittedForm !== null && snapshot?.submittedForm !== undefined && snapshot.stage !== "form";
  return <main ref={mainRef} id="main-content" tabIndex={-1} className="app-main">
    <section className="app-intro" aria-labelledby="intro-title">
      <h1 id="intro-title">Wstępna ocena sprawy</h1>
      <p>Asystent pomaga pracownikowi przygotować wstępną ocenę reklamacji lub zwrotu. Wynik wymaga sprawdzenia i nie jest ostateczną decyzją w sprawie klienta.</p>
      <div className="privacy-notice"><h2>Bez danych osobowych</h2><p>Nie wprowadzaj danych osobowych klientów ani informacji pozwalających ich zidentyfikować. Nie umieszczaj danych osobowych w opisach ani na zdjęciach. Aplikacja nie służy do prowadzenia kartoteki klientów.</p></div>
    </section>
    {!initialized ? <p className="mt-6">Wczytywanie zapisanej sprawy.</p> : blocked || !snapshot ? <p className="mt-6 max-w-[800px] border bg-card p-4">{blocked ?? unreadableNotice}</p> : complete ? <p role="status" className="mt-6">Otwieranie zapisanej oceny sprawy.</p> : processing ? <ProcessingSteps snapshot={snapshot} view={view} onReturnToForm={state.returnToForm} onRetry={state.retry} /> : <CaseForm value={snapshot.draftForm}
      onChange={state.changeDraft} onValidSubmit={state.submit} imageReady={state.image.status === "ready"} imageInputRef={state.imageInputRef} onImageRequired={state.requireImage}
      imageSlot={<EquipmentImagePicker state={state.image} inputRef={state.imageInputRef} validationError={state.missingImage ? "Dodaj zdjęcie sprzętu." : undefined} onSelect={files => { void state.selectImage(files); }} onRemove={state.removeImage} onRetry={state.retryImage} />} />}
    <div className="mt-4 max-w-[800px]"><StorageNotice warning={warning} /></div>
  </main>;
}
