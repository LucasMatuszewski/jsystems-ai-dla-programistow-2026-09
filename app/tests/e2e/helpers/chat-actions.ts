import { expect, type Page, type TestInfo } from "@playwright/test";
import { terminalMetadataSchema } from "../../../src/lib/contracts/messages";
import { createChatRequestSchema, type ChatRequest } from "../../../src/lib/contracts/requests";
import type { ActiveCaseSnapshot } from "../../../src/lib/contracts/session";
import { readCaseCheckpoint } from "./case-checkpoint";
import { startChatStreamObserver, type StreamCapture } from "./chat-stream-observer";

export const chatLabels = {
  message: "Wiadomość",
  send: "Wyślij wiadomość",
  stop: "Zatrzymaj odpowiedź",
  retry: "Ponów odpowiedź",
  pending: "Trwa przygotowywanie odpowiedzi",
} as const;
// Agreed visible copy; avoid importing client component runtime into the real-stack runner.
export const chatAssessmentNotice = "To wstępna ocena, a nie ostateczna decyzja. Pracownik musi zweryfikować fakty i właściwą procedurę przed podjęciem decyzji.";

export function assertFullChatRequest(raw: unknown, saved: ActiveCaseSnapshot, text: string): ChatRequest {
  const parsed = createChatRequestSchema().safeParse(raw);
  expect(parsed.success, "actual chat wire body must satisfy the strict B08 contract").toBe(true);
  if (!parsed.success) throw new Error("Invalid actual chat request; private body withheld");
  const body = parsed.data;
  expect(body.id === saved.caseId && body.trigger === "send-message").toBe(true);
  expect(JSON.stringify(body.caseContext) === JSON.stringify({ form: saved.submittedForm, timeZone: saved.timeZone, imageAnalysis: saved.imageAnalysis, initialDecision: saved.initialDecision }), "every turn must carry the entire immutable form, analysis, decision and pinned policy").toBe(true);
  const expectedHistory = saved.messages.map(message => ({ id: message.id, role: message.role, parts: message.parts.map(part => ({ type: "text", text: part.text })) }));
  expect(JSON.stringify(body.messages.slice(0, -1)) === JSON.stringify(expectedHistory), "transport must preserve full chronological history without metadata or truncation").toBe(true);
  const last = body.messages.at(-1);
  expect(last?.role === "user" && last.parts.map(part => part.text).join("") === text && !saved.messages.some(message => message.id === last.id)).toBe(true);
  const wire = raw as Record<string, unknown>;
  expect(Object.keys(wire).sort().join(",") === ["id", "operationId", "replyMessageId", "trigger", "caseContext", "messages"].sort().join(",")).toBe(true);
  expect(body.messages.every(message => Object.keys(message).sort().join(",") === "id,parts,role" && message.parts.every(part => Object.keys(part).sort().join(",") === "text,type")), "wire history is eligible text only, without SDK structural markers").toBe(true);
  return body;
}

export async function assertCanonicalChatStream(capture: StreamCapture, body: ChatRequest) {
  expect(capture.status, "a provider failure must fail honestly").toBe(200);
  expect(capture.contentType.includes("text/event-stream")).toBe(true);
  expect(capture.identity?.id === body.id && capture.identity.operationId === body.operationId && capture.identity.replyMessageId === body.replyMessageId, "passive bytes must correlate to this exact actual employee request").toBe(true);
  const events: Record<string, unknown>[] = [];
  const wire = new TextDecoder("utf-8", { fatal: true }).decode(capture.body);
  const blocks = wire.split(/\r?\n\r?\n/).filter(block => block.trim().length > 0);
  expect(/\r?\n\r?\n$/.test(wire) && blocks.at(-1) === "data: [DONE]" && blocks.filter(block => block === "data: [DONE]").length === 1, "complete bytes must contain exactly one final DONE without following events").toBe(true);
  for (const line of wire.split(/\r?\n/)) {
    if (!line.startsWith("data: ") || line === "data: [DONE]") continue;
    try { events.push(JSON.parse(line.slice(6)) as Record<string, unknown>); }
    catch { throw new Error("Invalid actual SDK stream event; private payload withheld"); }
  }
  expect(events.filter(event => event.type === "start").length === 1 && events.find(event => event.type === "start")?.messageId === body.replyMessageId).toBe(true);
  expect(events.some(event => event.type === "text-start") && events.some(event => event.type === "text-delta" && typeof event.delta === "string" && event.delta.length > 0) && events.some(event => event.type === "text-end")).toBe(true);
  expect(events.some(event => event.type === "error" || event.type === "abort"), "a failed or aborted stream can never count as complete").toBe(false);
  const finishes = events.filter(event => event.type === "finish");
  expect(finishes.length).toBe(1);
  expect(events[0]?.type === "start" && events.at(-1) === finishes[0], "message lifecycle must surround all text parts").toBe(true);
  const terminal = terminalMetadataSchema.safeParse(finishes[0]?.messageMetadata);
  expect(terminal.success && terminal.data.operationId === body.operationId && terminal.data.finishReason === "stop" && terminal.data.completionState === "complete", "completion requires matching canonical server terminal metadata").toBe(true);
  const parts = new Map<string, { open: boolean; text: string }>();
  for (const event of events) {
    if (event.type === "text-start") {
      if (typeof event.id !== "string" || event.id.trim().length === 0 || parts.has(event.id)) throw new Error("Invalid actual text part boundary; private payload withheld");
      parts.set(event.id, { open: true, text: "" });
    } else if (event.type === "text-delta" || event.type === "text-end") {
      const part = typeof event.id === "string" ? parts.get(event.id) : undefined;
      if (!part?.open) throw new Error("Invalid actual text part ordering; private payload withheld");
      if (event.type === "text-delta") {
        if (typeof event.delta !== "string") throw new Error("Invalid actual text delta; private payload withheld");
        part.text += event.delta;
      } else part.open = false;
    }
  }
  if (parts.size === 0 || [...parts.values()].some(part => part.open)) throw new Error("Actual text parts are incomplete; private payload withheld");
  // SDK message.parts follows text-start insertion order, including interleaved IDs.
  return [...parts.values()].map(part => part.text).join("");
}

function requireIndependentSdkCompletion(saved: ActiveCaseSnapshot, body: ChatRequest) {
  const reply = saved.messages.at(-1);
  // F07 assigns complete only from actual SDK onFinish with all failure flags false
  // and matching canonical metadata. Server finish bytes alone cannot satisfy this.
  if (saved.caseId !== body.id || saved.pendingOperation !== null || saved.replyStates[body.replyMessageId] !== "complete" || reply?.id !== body.replyMessageId || reply.role !== "assistant" || reply.metadata?.operationId !== body.operationId || reply.metadata.finishReason !== "stop" || reply.metadata.completionState !== "complete" || !reply.parts.every(part => part.type === "text" && part.state !== "streaming") || reply.parts.map(part => part.text).join("").trim().length === 0) throw new Error("Independent SDK completion missing; inspector bytes cannot authorize success");
}

export async function sendActualChatTurn(page: Page, caseId: string, text: string) {
  const saved = await readCaseCheckpoint(page, caseId);
  const observer = await startChatStreamObserver(page, { url: new URL("/api/chat", page.url()).href });
  const captureOutcome = observer.finished;
  try {
  const composer = page.getByRole("textbox", { name: chatLabels.message, exact: true });
  const sending = page.waitForRequest(request => request.method() === "POST" && new URL(request.url()).pathname === "/api/chat", { timeout: 15_000 });
  await composer.fill(text);
  await composer.focus(); await page.keyboard.press("Enter");
  const request = await sending;
  const body = assertFullChatRequest(request.postDataJSON(), saved, text);
  await expect(page.getByRole("status").filter({ hasText: chatLabels.pending })).toBeVisible();
  const send = page.getByRole("button", { name: chatLabels.send, exact: true });
  expect(await send.count() === 0 || await send.isDisabled(), "pending UI must prevent another send while exposing Stop").toBe(true);
  await expect(page.getByRole("button", { name: chatLabels.stop, exact: true })).toBeVisible();
  await expect.poll(async () => {
    const current = await readCaseCheckpoint(page, caseId);
    return current.messages.some(message => message.role === "user" && message.id === body.messages.at(-1)?.id) && current.pendingOperation?.operationId === body.operationId;
  }, { message: "employee turn must be preserved before composer clears" }).toBe(true);
  await expect(composer).toHaveValue("");
  const reply = page.locator(`[data-message-id="${body.replyMessageId}"]`);
  await expect(reply).toHaveAttribute("aria-label", "Wiadomość asystenta");
  await expect.poll(async () => {
    const current = await readCaseCheckpoint(page, caseId);
    const content = reply.locator("[data-message-content]");
    return current.pendingOperation?.operationId === body.operationId && await content.count() === 1 && (await content.innerText()).trim().length > 0;
  }, { timeout: 125_000, intervals: [50, 100, 250], message: "real assistant text must become visible while the operation is still pending" }).toBe(true);
  await expect(reply.getByText(chatAssessmentNotice, { exact: true })).toBeVisible();
  await expect.poll(async () => {
    const current = await readCaseCheckpoint(page, caseId);
    const message = current.messages.find(message => message.id === body.replyMessageId);
    return current.pendingOperation === null && current.replyStates[body.replyMessageId] === "complete" && message?.metadata?.operationId === body.operationId && message.metadata.finishReason === "stop" && message.metadata.completionState === "complete" && message.parts.every(part => part.type === "text" && part.state !== "streaming");
  }, { timeout: 125_000, message: "SDK outcome and canonical terminal must persist a completed reply" }).toBe(true);
  const captured = await captureOutcome;
  if (captured.kind === "failed") throw captured.error;
  const completed = await readCaseCheckpoint(page, caseId);
  requireIndependentSdkCompletion(completed, body);
  // An inspector-abort-candidate is promoted only here, after independent SDK
  // success. Official positive generation proof remains mandatory in the spec.
  const streamedText = await assertCanonicalChatStream(captured.capture, body);
  expect(streamedText === completed.messages.at(-1)?.parts.map(part => part.text).join(""), "captured stream bytes must reconstruct the entire actual saved reply exactly").toBe(true);
  expect(JSON.stringify(completed.messages.slice(0, saved.messages.length)) === JSON.stringify(saved.messages), "each reply must preserve every earlier completed turn and first assessment").toBe(true);
  expect(completed.messages.length === saved.messages.length + 2 && completed.messages.at(-1)?.id === body.replyMessageId).toBe(true);
  await expect(reply.getByText(chatAssessmentNotice, { exact: true })).toBeVisible();
  return { body, completed, text: completed.messages.at(-1)!.parts.map(part => part.text).join("") };
  } finally {
    try { await observer.dispose(); }
    finally {
      const finalCapture = await captureOutcome;
      if (finalCapture.kind !== "failed") finalCapture.capture.body.fill(0);
    }
  }
}

export async function captureChatCheckpoint(page: Page, info: TestInfo, state: string) {
  for (const width of [1440, 360]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), "chat must fit both employee viewports").toBe(false);
    const path = info.outputPath(`${state}-${width}.png`);
    await page.screenshot({ path, fullPage: true });
    await info.attach(`${state}-${width}`, { path, contentType: "image/png" });
  }
}
