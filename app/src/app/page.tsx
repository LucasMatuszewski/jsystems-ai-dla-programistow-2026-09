"use client";

import { useEffect, useRef, useState } from "react";
import { CaseForm, type CaseFormValues } from "@/features/case-form/case-form";
import { EquipmentImagePicker, type ImagePickerState } from "@/features/case-form/equipment-image-picker";
import { prepareEquipmentImage, screenEquipmentImageFiles } from "@/features/case-workflow/image-preparation-client";
import { createSessionAdapter, type StorageWarning, type CheckpointKind } from "@/features/session/session-adapter";
import { StorageNotice } from "@/features/session/storage-notice";
import type { ActiveCaseSnapshot } from "@/lib/contracts/session";

const emptyValues: CaseFormValues = {
  scenario: "", category: "", equipmentName: "", purchaseDate: "", deliveryDate: "",
  buyerStatus: "", sellerStatus: "", reason: "", requestedRemedy: "",
};

export default function Home() {
  const [values, setValues] = useState<CaseFormValues>(emptyValues);
  const [valid, setValid] = useState(false);
  const [image, setImage] = useState<ImagePickerState>({ status: "empty" });
  const [missingImage, setMissingImage] = useState(false);
  const [warning, setWarning] = useState<StorageWarning | null>(null);
  const [blocked, setBlocked] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const originalFile = useRef<File | null>(null);
  const snapshotRef = useRef<ActiveCaseSnapshot | null>(null);
  const adapterRef = useRef<ReturnType<typeof createSessionAdapter> | null>(null);
  const operationRef = useRef<{ caseId: string; operationId: string; controller: AbortController } | null>(null);

  useEffect(() => {
    let active = true;
    const adapter = createSessionAdapter({ storage: () => window.localStorage, onWriteResult: result => { if (active) setWarning(result.status === "failed" ? result.warning : null); } });
    adapterRef.current = adapter;
    const restored = adapter.restore();
    let notice: string | null = null;
    let current: ActiveCaseSnapshot | null = null;
    if (restored.status === "restored") {
      const saved = restored.snapshot;
      if (saved.screen === "form" && (saved.stage === "form" || saved.stage === "preparation") && !saved.imageAnalysis && !saved.initialDecision && saved.messages.length === 0 && saved.submittedForm === null) current = saved;
      else notice = "W przeglądarce jest zapisana sprawa z dalszego etapu. Zachowano jej zapis. Ten formularz nie może jej teraz zmienić.";
    } else if (restored.status === "unreadable") notice = "Nie można odczytać zapisanej sprawy. Zachowano jej zapis. Ten formularz nie może go teraz zmienić.";
    else current = {
      schemaVersion: 1, caseId: crypto.randomUUID(), revision: 0, screen: "form", stage: "form", stageStatus: "idle",
      draftForm: { ...emptyValues }, submittedForm: null, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      preparedImage: null, imageAnalysis: null, initialDecision: null, messages: [], replyStates: {}, pendingOperation: null, storageWarning: null,
    };
    snapshotRef.current = current;
    // Browser-only restoration runs after hydration; cleanup also cancels this initialization.
    queueMicrotask(() => {
      if (!active) return;
      setBlocked(notice); setWarning(adapter.getWarning()); setInitialized(true);
      if (!current) return;
      setValues(current.draftForm);
      if (current.stage === "preparation" && current.stageStatus === "interrupted") setImage({ status: "interrupted", message: "Przygotowywanie zdjęcia zostało przerwane. Wybierz zdjęcie ponownie, aby kontynuować." });
      else if (current.preparedImage) setImage({ status: "ready", preparedImage: current.preparedImage });
    });
    return () => { active = false; operationRef.current?.controller.abort(); operationRef.current = null; adapter.dispose(); adapterRef.current = null; snapshotRef.current = null; };
  }, []);

  function checkpoint(changes: Partial<ActiveCaseSnapshot>, kind: CheckpointKind) {
    const current = snapshotRef.current;
    if (!current || !adapterRef.current) return;
    const next = { ...current, ...changes, revision: current.revision + 1, storageWarning: adapterRef.current.getWarning() };
    snapshotRef.current = next; adapterRef.current.checkpoint(next, kind);
  }
  function clearOperation() { operationRef.current?.controller.abort(); operationRef.current = null; setValid(false); setMissingImage(false); }
  async function selectImage(files: readonly File[]) {
    const current = snapshotRef.current;
    if (!current) return;
    clearOperation(); originalFile.current = null; setImage({ status: "empty" });
    const selected = screenEquipmentImageFiles(files);
    if (selected.status === "invalid") {
      setImage({ status: "failed", message: selected.message, retryable: false });
      checkpoint({ preparedImage: null, stage: "form", stageStatus: "idle", pendingOperation: null, imageAnalysis: null, initialDecision: null }, "immediate"); return;
    }
    originalFile.current = selected.file;
    const operation = { caseId: current.caseId, operationId: crypto.randomUUID(), controller: new AbortController() };
    operationRef.current = operation; setImage({ status: "pending" });
    checkpoint({ preparedImage: null, stage: "preparation", stageStatus: "pending", pendingOperation: { kind: "preparation", operationId: operation.operationId, startedAt: new Date().toISOString() }, imageAnalysis: null, initialDecision: null }, "immediate");
    const result = await prepareEquipmentImage(selected.file, { signal: operation.controller.signal });
    if (operation.controller.signal.aborted || operationRef.current?.operationId !== operation.operationId || snapshotRef.current?.caseId !== operation.caseId) return;
    operationRef.current = null;
    if (result.status === "prepared") {
      setImage({ status: "ready", preparedImage: result.preparedImage });
      checkpoint({ preparedImage: result.preparedImage, stage: "form", stageStatus: "idle", pendingOperation: null }, "immediate");
    } else {
      setImage(result.status === "failed" ? { status: "failed", message: result.message, retryable: result.retryable } : { status: "interrupted", message: "Przygotowywanie zdjęcia zostało przerwane. Wybierz zdjęcie ponownie." });
      checkpoint({ preparedImage: null, stage: "form", stageStatus: "idle", pendingOperation: null }, "immediate");
    }
  }
  function removeImage() {
    if (!snapshotRef.current) return;
    clearOperation(); originalFile.current = null; setImage({ status: "empty" });
    checkpoint({ preparedImage: null, stage: "form", stageStatus: "idle", pendingOperation: null, imageAnalysis: null, initialDecision: null }, "immediate");
  }
  return (
    <main id="main-content" tabIndex={-1} className="app-main">
      <section className="app-intro" aria-labelledby="intro-title">
        <h1 id="intro-title">Wstępna ocena sprawy</h1>
        <p>Asystent pomaga pracownikowi przygotować wstępną ocenę reklamacji lub zwrotu. Wynik wymaga sprawdzenia i nie jest ostateczną decyzją w sprawie klienta.</p>
        <div className="privacy-notice">
          <h2>Bez danych osobowych</h2>
          <p>Nie wprowadzaj danych osobowych klientów ani informacji pozwalających ich zidentyfikować. Nie umieszczaj danych osobowych w opisach ani na zdjęciach. Aplikacja nie służy do prowadzenia kartoteki klientów.</p>
        </div>
      </section>
      {!initialized ? <p className="mt-6">Wczytywanie zapisanej sprawy.</p> : blocked ? <p className="mt-6 max-w-[800px] border bg-card p-4">{blocked}</p> : <CaseForm value={values}
        onChange={next => { if (!snapshotRef.current) return; setValues(next); setValid(false); checkpoint({ draftForm: next }, "draft"); }}
        onValidSubmit={() => { if (image.status === "ready" && snapshotRef.current) setValid(true); }}
        imageReady={image.status === "ready"} imageInputRef={imageInputRef} onImageRequired={() => setMissingImage(true)}
        imageSlot={<EquipmentImagePicker state={image} inputRef={imageInputRef} validationError={missingImage ? "Dodaj zdjęcie sprzętu." : undefined}
          onSelect={files => { void selectImage(files); }} onRemove={removeImage} onRetry={() => { if (originalFile.current) void selectImage([originalFile.current]); }} />} />}
      <div className="mt-4 max-w-[800px]"><StorageNotice warning={warning} /></div>
      <p role="status" aria-label="Stan formularza" className="mt-4 max-w-[800px] text-sm">{valid ? "Dane formularza są poprawne." : ""}</p>
    </main>
  );
}
