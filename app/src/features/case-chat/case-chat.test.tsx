import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatInit, ChatStatus, UIMessage } from "ai";
import type { ActiveCaseSnapshot } from "@/lib/contracts/session";
import { CaseChat, type CaseChatProps, type ChatCheckpoint } from "./case-chat";

const sdk = vi.hoisted(() => ({ options: null as ChatInit<UIMessage> | null, messages: [] as UIMessage[], update: null as null | ((messages: UIMessage[]) => void), send: vi.fn(), stop: vi.fn(), status: "ready" as ChatStatus, seeds: [] as UIMessage[][] }));
vi.mock("@ai-sdk/react", async () => {
  const { useState } = await import("react");
  return { useChat: (options: ChatInit<UIMessage>) => {
    sdk.options = options;
    const [messages, setMessages] = useState(() => { sdk.seeds.push(options.messages!); return options.messages!; });
    sdk.messages = messages; sdk.update = setMessages;
    return { messages, sendMessage: sdk.send, stop: sdk.stop, status: sdk.status };
  } };
});
vi.mock("@/features/case-chat/initial-decision-details", () => ({ InitialDecisionDetails: () => <article aria-label="Wstępna ocena początkowa">Pełna ocena.</article> }));
vi.mock("@/components/ai-elements/conversation", () => ({ Conversation: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div role="log" {...props}>{children}</div>, ConversationContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
const id = "d6a7c3f7-5711-4e97-ae3e-5195c48c2b95";
const operationId = "e6a7c3f7-5711-4e97-ae3e-5195c48c2b95";
const form = { scenario: "complaint", category: "computers", equipmentName: "Laptop", purchaseDate: "2026-01-01", deliveryDate: null, buyerStatus: "unknown", sellerStatus: "business", reason: "Nie działa.", requestedRemedy: "repair" } as const;
const analysis = { analysisId: id, scenario: "complaint" as const, imageDigest: "a".repeat(64), formFingerprint: "b".repeat(64), createdAt: "2026-10-01T08:00:00Z", modelId: "private-model", imageQuality: "adequate" as const, observations: [], signsOfUse: [], possibleCauses: [], limitations: [], missingInformation: [] };
const decision = { caseId: id, decisionId: operationId, scenario: "complaint" as const, outcome: "human_verification_required" as const, greeting: "Dzień dobry.", summary: "Pełna ocena.", justification: ["Sprawdź fakty."], evidence: [], policyReferences: ["section"], limitations: [], questions: [], nextSteps: ["Sprawdź sprzęt."], resaleAssessment: null, resaleExplanation: null, policy: { version: "1", digest: "c".repeat(64), sourceUrl: "https://allegro.pl/pomoc", retrievedAt: "2026-10-01T08:00:00Z", references: [{ headingId: "section", title: "Procedura", url: "https://allegro.pl/pomoc" }] }, createdAt: "2026-10-01T08:00:00Z", modelId: "private-model", preliminary: true as const, employeeVerificationRequired: true as const };
const first = { id: "first", role: "assistant" as const, parts: [{ type: "text" as const, text: "Pełna ocena." }] };
const snapshot: ActiveCaseSnapshot = { schemaVersion: 1, caseId: id, revision: 4, screen: "chat", stage: "chat", stageStatus: "idle", draftForm: form, submittedForm: form, timeZone: "Europe/Warsaw", preparedImage: { imageDataUrl: "data:image/jpeg;base64,YQ==", thumbnailDataUrl: "data:image/jpeg;base64,YQ==", byteLength: 1, width: 1, height: 1, sha256: "a".repeat(64) }, imageAnalysis: analysis, initialDecision: decision, messages: [first], replyStates: { first: "complete" }, pendingOperation: null, storageWarning: null };

let current: ActiveCaseSnapshot;
let cancel: (() => void) | null;
let props: CaseChatProps;
const checkpoint = vi.fn();
beforeEach(() => {
  current = structuredClone(snapshot); cancel = null; sdk.status = "ready"; sdk.seeds = [];
  sdk.send.mockImplementation((message: UIMessage) => { sdk.update!([...sdk.messages, message]); return new Promise<void>(() => {}); });
  checkpoint.mockImplementation((changes: ChatCheckpoint) => { current = { ...current, ...changes }; return true; });
  props = { initialSnapshot: current, readSnapshot: () => current, checkpoint, registerCancellation: callback => { cancel = callback; return () => { cancel = null; }; } };
});
function send(text = "  Dodatkowe pytanie  ") {
  fireEvent.change(screen.getByRole("textbox", { name: "Wiadomość" }), { target: { value: text } });
  fireEvent.click(screen.getByRole("button", { name: "Wyślij wiadomość" }));
}
describe("one hydrated streaming chat owner", () => {
  it("seeds persisted messages once, preserves chronology and never sends on hydration or rerender", () => {
    const { rerender } = render(<CaseChat {...props} />);
    expect(screen.getByRole("article", { name: "Wstępna ocena początkowa" })).toBeVisible();
    expect(screen.getByRole("textbox", { name: "Wiadomość" })).toBeVisible();
    rerender(<CaseChat {...props} initialSnapshot={{ ...current, revision: 12 }} />);
    expect(sdk.seeds).toEqual([snapshot.messages]); expect(sdk.send).not.toHaveBeenCalled(); expect(checkpoint).not.toHaveBeenCalled();
  });
  it("rejects blank and oversized text before adding a user or changing persisted conversation", async () => {
    render(<CaseChat {...props} />); send("   ");
    await waitFor(() => expect(screen.getByText("Wpisz wiadomość.")).toBeVisible());
    expect(sdk.send).not.toHaveBeenCalled(); expect(checkpoint).not.toHaveBeenCalled();
    send("x".repeat(4001));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("limit"));
    expect(sdk.send).not.toHaveBeenCalled(); expect(current.messages).toEqual(snapshot.messages);
  });
  it("preserves trimmed canonical user before send/clear, and guards duplicate pending submissions", async () => {
    sdk.send.mockImplementation((message: UIMessage) => {
      expect(current.messages.at(-1)).toEqual(message);
      sdk.update!([...sdk.messages, message]); return new Promise<void>(() => {});
    });
    render(<CaseChat {...props} />); send();
    await waitFor(() => expect(sdk.send).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("textbox")).toHaveValue("");
    expect(current.messages.at(-1)?.parts[0].text).toBe("Dodatkowe pytanie");
    expect(current.pendingOperation).toMatchObject({ kind: "chat", userMessageId: current.messages.at(-1)?.id });
    fireEvent.submit(screen.getByRole("textbox").closest("form")!);
    expect(sdk.send).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status")).toHaveTextContent("Trwa przygotowywanie odpowiedzi");
  });
  it("does not clear or send when ownership rejects the user checkpoint", async () => {
    checkpoint.mockReturnValue(false); render(<CaseChat {...props} />); send();
    await waitFor(() => expect(screen.getByRole("textbox")).toHaveValue("  Dodatkowe pytanie  "));
    expect(sdk.send).not.toHaveBeenCalled();
  });
  it("supports Enter submission, leaves Shift+Enter for multiline input and does not announce each streamed token", async () => {
    render(<CaseChat {...props} />);
    const textbox = screen.getByRole("textbox", { name: "Wiadomość" });
    fireEvent.change(textbox, { target: { value: "Pytanie z klawiatury" } });
    fireEvent.keyDown(textbox, { key: "Enter", shiftKey: true });
    expect(sdk.send).not.toHaveBeenCalled();
    fireEvent.keyDown(textbox, { key: "Enter" });
    await waitFor(() => expect(sdk.send).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("log")).toHaveAttribute("aria-live", "off");
    expect(screen.getByRole("status")).toHaveAttribute("aria-live", "polite");
  });
  it("preserves the user and safely releases pending state after an HTTP failure with no SDK finish callback", async () => {
    sdk.send.mockImplementation((message: UIMessage) => { sdk.update!([...sdk.messages, message]); sdk.options!.onError!(new Error('PRIVATE_PROVIDER_BLOB')); return Promise.resolve(); });
    render(<CaseChat {...props} />); send();
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Usługa AI jest chwilowo niedostępna"));
    expect(current.messages.at(-1)?.parts[0].text).toBe("Dodatkowe pytanie");
    expect(current.pendingOperation).toBeNull(); expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByRole("textbox")).toHaveFocus();
    expect(document.body.textContent).not.toContain("PRIVATE_PROVIDER_BLOB");
  });
  it("persists streamed text after removing only SDK markers and accepts a matching successful terminal", async () => {
    render(<CaseChat {...props} />); send(); await waitFor(() => expect(sdk.send).toHaveBeenCalledTimes(1));
    const operation = current.pendingOperation!; if (operation.kind !== "chat") throw new Error("Missing chat operation");
    const reply: UIMessage = { id: operation.replyMessageId, role: "assistant", parts: [{ type: "step-start" }, { type: "text", text: "Część odpowiedzi", state: "streaming", providerMetadata: undefined }] };
    await act(async () => sdk.update!([...sdk.messages, reply]));
    expect(screen.getByText("Część odpowiedzi")).toBeVisible();
    expect(current.messages.at(-1)?.parts).toEqual([{ type: "text", text: "Część odpowiedzi", state: "streaming" }]);
    expect(current.replyStates[reply.id]).toBe("streaming");
    const finished: UIMessage = { ...reply, parts: [{ type: "step-start" }, { type: "text", text: "Cała odpowiedź", state: "done", providerMetadata: { openrouter: { annotation: "PRIVATE_PROVIDER_ANNOTATION" } } }], metadata: { operationId: operation.operationId, finishReason: "stop", completionState: "complete" } };
    await act(async () => { sdk.update!([...sdk.messages.slice(0, -1), finished]); sdk.options!.onFinish!({ message: finished, messages: [...sdk.messages.slice(0, -1), finished], isAbort: false, isDisconnect: false, isError: false }); });
    expect(current.replyStates[reply.id]).toBe("complete"); expect(current.pendingOperation).toBeNull();
    expect(current.messages.at(-1)?.metadata).toMatchObject({ completionState: "complete" });
    expect(current.messages[0]).toEqual(snapshot.messages[0]);
    expect(JSON.stringify(current.messages)).not.toContain("providerMetadata");
    expect(document.body.textContent).not.toContain("PRIVATE_PROVIDER_ANNOTATION");
  });
  it.each(["missing", "length", "wrong-operation", "abort", "disconnect", "error"])("keeps partial replies incomplete after %s finish", async failure => {
    render(<CaseChat {...props} />); send(); await waitFor(() => expect(sdk.send).toHaveBeenCalledTimes(1));
    const operation = current.pendingOperation!; if (operation.kind !== "chat") throw new Error("Missing chat operation");
    const reply: UIMessage = { id: operation.replyMessageId, role: "assistant", parts: [{ type: "text", text: "Zachowana część", state: "done" }], ...(failure === "missing" ? {} : { metadata: { operationId: failure === "wrong-operation" ? id : operation.operationId, finishReason: failure === "length" ? "length" : "stop", completionState: failure === "length" ? "incomplete" : "complete" } }) };
    await act(async () => { sdk.update!([...sdk.messages, reply]); sdk.options!.onFinish!({ message: reply, messages: [...sdk.messages, reply], isAbort: failure === "abort", isDisconnect: failure === "disconnect", isError: failure === "error" }); });
    expect(current.messages.at(-1)?.parts[0].text).toBe("Zachowana część");
    expect(current.replyStates[reply.id]).not.toBe("complete");
    expect(screen.getByText("Ta odpowiedź nie została ukończona.")).toBeVisible();
  });
  it("ignores a foreign old finish without closing or overwriting the current pending user", async () => {
    render(<CaseChat {...props} />); send(); await waitFor(() => expect(sdk.send).toHaveBeenCalledTimes(1));
    const retained = structuredClone(current);
    act(() => sdk.options!.onFinish!({ message: { id: "old-reply", role: "assistant", parts: [{ type: "text", text: "Stara odpowiedź" }], metadata: { operationId, finishReason: "stop", completionState: "complete" } }, messages: snapshot.messages, isAbort: false, isDisconnect: false, isError: false }));
    expect(current).toEqual(retained);
    expect(screen.getByRole("status")).toHaveTextContent("Trwa przygotowywanie odpowiedzi");
  });
  it("cancels departure, retaining user and partial text and rejecting late completion", async () => {
    render(<CaseChat {...props} />); send(); await waitFor(() => expect(sdk.send).toHaveBeenCalledTimes(1));
    const operation = current.pendingOperation!; if (operation.kind !== "chat") throw new Error("Missing chat operation");
    const reply: UIMessage = { id: operation.replyMessageId, role: "assistant", parts: [{ type: "text", text: "Przerwana odpowiedź", state: "streaming" }] };
    await act(async () => sdk.update!([...sdk.messages, reply]));
    act(() => cancel!());
    expect(sdk.stop).toHaveBeenCalled(); expect(current.replyStates[reply.id]).toBe("interrupted"); expect(current.pendingOperation).toBeNull();
    const retained = structuredClone(current);
    act(() => sdk.options!.onFinish!({ message: { ...reply, metadata: { operationId: operation.operationId, finishReason: "stop", completionState: "complete" } }, messages: sdk.messages, isAbort: false, isDisconnect: false, isError: false }));
    expect(current).toEqual(retained);
  });
});
