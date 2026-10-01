import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement, type ComponentProps } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EquipmentImagePickerProps } from "./equipment-image-picker";
import type { PreparedImage } from "../../lib/contracts/image";
import type { ActiveCaseSnapshot } from "../../lib/contracts/session";
import Home from "../../app/page";
const mocks = vi.hoisted(() => ({ prepare: vi.fn(), screenFiles: vi.fn(), restore: vi.fn(), checkpoint: vi.fn(), dispose: vi.fn(), warning: vi.fn(), adapter: vi.fn() }));
vi.mock("@/components/ui/button", () => ({ Button: (props: ComponentProps<"button">) => createElement("button", props) }));
vi.mock("@/components/ui/input", () => ({ Input: (props: ComponentProps<"input">) => createElement("input", props) }));
vi.mock("@/components/ui/label", () => ({ Label: (props: ComponentProps<"label">) => createElement("label", props) }));
vi.mock("next/image", () => ({ default: ({ unoptimized, ...props }: ComponentProps<"img"> & { unoptimized?: boolean }) => { void unoptimized; return createElement("img", props); } }));
vi.mock("@/features/case-workflow/image-preparation-client", () => ({ prepareEquipmentImage: mocks.prepare, screenEquipmentImageFiles: mocks.screenFiles }));
vi.mock("@/features/session/session-adapter", () => ({ createSessionAdapter: mocks.adapter }));
vi.mock("@/features/session/storage-notice", () => ({ StorageNotice: ({ warning }: { warning: string | null }) => warning ? <p role="status">Problem z zapisem: {warning}</p> : null }));
vi.mock("@/lib/contracts/session", () => ({}));
vi.mock("@/features/case-form/case-form", () => ({ CaseForm: (props: { value: { equipmentName: string }; onChange: (next: unknown) => void; imageSlot?: React.ReactNode; imageReady?: boolean; onImageRequired?: () => void; onValidSubmit: (value: unknown) => void }) => <form aria-label="Dane sprawy" onSubmit={event => { event.preventDefault(); if (props.imageReady) props.onValidSubmit(props.value); else props.onImageRequired?.(); }}>
  <input aria-label="Nazwa sprzętu" value={props.value.equipmentName} onChange={event => props.onChange({ ...props.value, equipmentName: event.target.value })} />{props.imageSlot}<button type="submit">Dalej</button>
</form> }));
vi.mock("@/features/case-form/equipment-image-picker", () => ({ EquipmentImagePicker: (props: EquipmentImagePickerProps) => <div>
  <button type="button" onClick={() => props.onSelect([new File(["first"], "first.png", { type: "image/png" })])}>Wybierz pierwszy</button>
  <button type="button" onClick={() => props.onSelect([new File(["second"], "second.png", { type: "image/png" })])}>Wybierz drugi</button>
  <button type="button" onClick={props.onRemove}>Usuń zdjęcie</button>
  {props.state.status === "pending" && <p>Trwa przygotowywanie zdjęcia.</p>}
  {props.state.status === "ready" && <p>Gotowe: {props.state.preparedImage.sha256}</p>}
  {(props.state.status === "failed" || props.state.status === "interrupted") && <p>{props.state.message}</p>}
  {props.validationError && <p>{props.validationError}</p>}
</div> }));
const { EquipmentImagePicker: ActualPicker } = await vi.importActual<typeof import("./equipment-image-picker")>("./equipment-image-picker");
const prepared: PreparedImage = { imageDataUrl: "data:image/jpeg;base64,/9j/", thumbnailDataUrl: "data:image/jpeg;base64,/9j/", width: 1, height: 1, byteLength: 3, sha256: "a".repeat(64) };
const props = (): EquipmentImagePickerProps => ({ state: { status: "empty" }, onSelect: vi.fn(), onRemove: vi.fn(), onRetry: vi.fn() });
function stored(): ActiveCaseSnapshot {
  return { schemaVersion: 1, caseId: "b269a28d-e305-41a0-8bab-7098c344bb36", revision: 3, screen: "form", stage: "form", stageStatus: "idle", draftForm: { scenario: "", category: "", equipmentName: "Zapisany laptop", purchaseDate: "", deliveryDate: null, buyerStatus: "", sellerStatus: "", reason: "", requestedRemedy: null }, timeZone: "Europe/Warsaw", submittedForm: null, preparedImage: prepared, imageAnalysis: null, initialDecision: null, messages: [], replyStates: {}, pendingOperation: null, storageWarning: null };
}
beforeEach(() => {
  mocks.checkpoint.mockReset();
  mocks.restore.mockReturnValue({ status: "missing" }); mocks.warning.mockReturnValue(null);
  mocks.adapter.mockReturnValue({ restore: mocks.restore, checkpoint: mocks.checkpoint, dispose: mocks.dispose, getWarning: mocks.warning });
  mocks.screenFiles.mockImplementation(files => ({ status: "valid", file: files[0] }));
  mocks.prepare.mockResolvedValue({ status: "prepared", preparedImage: prepared });
});
async function mountHome() { render(<Home />); await act(async () => {}); }
describe("accessible controlled photo picker", () => {
  it("shows a Polish chooser while retaining the labeled native keyboard control", () => {
    render(<ActualPicker {...props()} />);
    expect(screen.getByText("Wybierz zdjęcie")).toBeVisible();
    const input = screen.getByLabelText("Zdjęcie sprzętu");
    expect(input).toHaveAttribute("type", "file"); input.focus(); expect(input).toHaveFocus();
  });
  it("exposes one native file input and emits a single selection", () => {
    const p = props(); render(<ActualPicker {...p} />);
    const input = screen.getByLabelText("Zdjęcie sprzętu");
    expect(input).toHaveAttribute("type", "file"); expect(input).not.toHaveAttribute("multiple");
    expect(input).toHaveAttribute("accept", expect.stringContaining("image/webp"));
    const file = new File(["image"], "image.png", { type: "image/png" }); fireEvent.change(input, { target: { files: [file] } });
    expect(p.onSelect).toHaveBeenCalledWith([file]);
  });
  it("shows only the current normalized preview and clears ready state when pending", () => {
    const p = props(); const { rerender } = render(<ActualPicker {...p} state={{ status: "ready", preparedImage: prepared }} />);
    expect(screen.getByAltText("Podgląd wybranego zdjęcia sprzętu")).toHaveAttribute("src", prepared.thumbnailDataUrl);
    expect(screen.getByText("Zdjęcie jest gotowe.")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Usuń zdjęcie" })); expect(p.onRemove).toHaveBeenCalledOnce();
    rerender(<ActualPicker {...p} state={{ status: "pending" }} />);
    expect(screen.getByText("Trwa przygotowywanie zdjęcia.")).toBeVisible(); expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.queryByText("Zdjęcie jest gotowe.")).not.toBeInTheDocument();
  });
  it("associates missing-image errors and retries only live retryable failures", () => {
    const p = props(); const { rerender } = render(<ActualPicker {...p} validationError="Dodaj zdjęcie sprzętu." />);
    expect(screen.getByLabelText("Zdjęcie sprzętu")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Zdjęcie sprzętu")).toHaveAccessibleDescription(expect.stringContaining("Dodaj zdjęcie sprzętu."));
    rerender(<ActualPicker {...p} state={{ status: "failed", message: "Nie udało się przygotować obrazu.", retryable: true }} />);
    fireEvent.click(screen.getByRole("button", { name: "Spróbuj ponownie" })); expect(p.onRetry).toHaveBeenCalledOnce();
    rerender(<ActualPicker {...p} state={{ status: "interrupted", message: "Wybierz zdjęcie ponownie." }} />);
    expect(screen.queryByRole("button", { name: "Spróbuj ponownie" })).not.toBeInTheDocument();
  });
});
describe("page owns current preparation and persistence", () => {
  it("blocks submit without a usable image and retains edited form facts", async () => {
    await mountHome(); fireEvent.change(screen.getByLabelText("Nazwa sprzętu"), { target: { value: "Mój laptop" } }); fireEvent.click(screen.getByRole("button", { name: "Dalej" }));
    expect(screen.getByText("Dodaj zdjęcie sprzętu.")).toBeVisible(); expect(screen.getByLabelText("Nazwa sprzętu")).toHaveValue("Mój laptop");
    expect(screen.queryByText("Dane formularza są poprawne.")).not.toBeInTheDocument();
    expect(mocks.checkpoint).toHaveBeenCalledWith(expect.objectContaining({ draftForm: expect.objectContaining({ equipmentName: "Mój laptop" }) }), "draft");
  });
  it("aborts replacement, ignores stale completion, and saves only the current normalized image", async () => {
    let finishFirst!: (value: unknown) => void; let finishSecond!: (value: unknown) => void;
    mocks.prepare.mockImplementationOnce(() => new Promise(resolve => { finishFirst = resolve; })).mockImplementationOnce(() => new Promise(resolve => { finishSecond = resolve; }));
    await mountHome(); fireEvent.click(screen.getByRole("button", { name: "Wybierz pierwszy" }));
    expect(screen.getByText("Trwa przygotowywanie zdjęcia.")).toBeVisible();
    const firstSignal = mocks.prepare.mock.calls[0][1].signal as AbortSignal;
    fireEvent.click(screen.getByRole("button", { name: "Wybierz drugi" })); expect(firstSignal.aborted).toBe(true);
    const next = { ...prepared, sha256: "b".repeat(64) }; await act(async () => finishSecond({ status: "prepared", preparedImage: next }));
    await act(async () => finishFirst({ status: "prepared", preparedImage: prepared }));
    expect(screen.getByText(`Gotowe: ${next.sha256}`)).toBeVisible(); expect(screen.queryByText(`Gotowe: ${prepared.sha256}`)).not.toBeInTheDocument();
    const checkpoints = mocks.checkpoint.mock.calls.map(call => call[0]);
    expect(checkpoints.some(snapshot => snapshot.preparedImage?.sha256 === prepared.sha256)).toBe(false);
    expect(checkpoints.some(snapshot => snapshot.preparedImage?.sha256 === next.sha256 && !JSON.stringify(snapshot).includes("second.png"))).toBe(true);
  });
  it("removes immediately and ignores a later successful response", async () => {
    let finish!: (value: unknown) => void; mocks.prepare.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    await mountHome(); fireEvent.click(screen.getByRole("button", { name: "Wybierz pierwszy" })); const signal = mocks.prepare.mock.calls[0][1].signal as AbortSignal;
    fireEvent.click(screen.getByRole("button", { name: "Usuń zdjęcie" })); expect(signal.aborted).toBe(true);
    await act(async () => finish({ status: "prepared", preparedImage: prepared }));
    expect(screen.queryByText(`Gotowe: ${prepared.sha256}`)).not.toBeInTheDocument();
    expect(mocks.checkpoint).toHaveBeenLastCalledWith(expect.objectContaining({ preparedImage: null, pendingOperation: null }), "immediate");
  });
  it("keeps pending and failed preparation unusable while retaining the edited form", async () => {
    let finish!: (value: unknown) => void; mocks.prepare.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    await mountHome(); fireEvent.change(screen.getByLabelText("Nazwa sprzętu"), { target: { value: "Mój laptop" } });
    fireEvent.click(screen.getByRole("button", { name: "Wybierz pierwszy" })); fireEvent.click(screen.getByRole("button", { name: "Dalej" }));
    expect(screen.queryByText("Dane formularza są poprawne.")).not.toBeInTheDocument();
    await act(async () => finish({ status: "failed", message: "Nie udało się przygotować obrazu. Spróbuj ponownie.", retryable: true }));
    expect(screen.getByText("Nie udało się przygotować obrazu. Spróbuj ponownie.")).toBeVisible();
    expect(screen.getByLabelText("Nazwa sprzętu")).toHaveValue("Mój laptop");
    fireEvent.click(screen.getByRole("button", { name: "Dalej" })); expect(screen.queryByText("Dane formularza są poprawne.")).not.toBeInTheDocument();
  });
  it("restores draft/normalized preview without a backend call", async () => {
    mocks.restore.mockReturnValue({ status: "restored", snapshot: stored() }); await mountHome();
    expect(await screen.findByText(`Gotowe: ${prepared.sha256}`)).toBeVisible(); expect(screen.getByLabelText("Nazwa sprzętu")).toHaveValue("Zapisany laptop"); expect(mocks.prepare).not.toHaveBeenCalled();
  });
  it("asks for reselection after interrupted preparation, without fake recovery or retry", async () => {
    const snapshot = stored(); snapshot.preparedImage = null; snapshot.stage = "preparation"; snapshot.stageStatus = "interrupted"; snapshot.pendingOperation = { kind: "preparation", operationId: snapshot.caseId, startedAt: "2026-10-01T10:00:00Z" };
    mocks.restore.mockReturnValue({ status: "restored", snapshot }); await mountHome();
    expect(await screen.findByText(/Wybierz zdjęcie ponownie/)).toBeVisible(); expect(mocks.prepare).not.toHaveBeenCalled();
  });
  it.each(["chat", "unreadable"])("preserves %s storage and prevents accidental new form writes", async status => {
    const snapshot = stored(); snapshot.screen = "chat";
    mocks.restore.mockReturnValue(status === "chat" ? { status: "restored", snapshot } : { status: "unreadable" }); await mountHome();
    await waitFor(() => expect(screen.queryByRole("button", { name: "Dalej" })).not.toBeInTheDocument());
    expect(mocks.checkpoint).not.toHaveBeenCalled(); expect(mocks.prepare).not.toHaveBeenCalled();
  });
  it("keeps live normalized image usable while displaying storage failure", async () => {
    mocks.checkpoint.mockImplementation(() => mocks.adapter.mock.calls.at(-1)?.[0].onWriteResult({ status: "failed", warning: "quota-exceeded", notice: "Problem" }));
    await mountHome(); fireEvent.click(screen.getByRole("button", { name: "Wybierz pierwszy" }));
    expect(await screen.findByText(`Gotowe: ${prepared.sha256}`)).toBeVisible(); expect(screen.getByText("Problem z zapisem: quota-exceeded")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Dalej" })); expect(screen.getByText("Dane formularza są poprawne.")).toBeVisible();
  });
});
