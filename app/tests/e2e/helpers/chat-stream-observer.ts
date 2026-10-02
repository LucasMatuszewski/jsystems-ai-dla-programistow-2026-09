import type { CDPSession, Page } from "@playwright/test";
export type StreamCapture = { body: Buffer; status: number; contentType: string; identity: { id: string; operationId: string; replyMessageId: string } | null };
export type StreamCaptureDiagnostics = { canceled: boolean | null; errorCategory: "NONE" | "ABORTED" | "NETWORK" | "OTHER"; activationReady: boolean; loaded: boolean; bufferedByteCount: number; finishSeen: boolean; finishOperationMatches: boolean; doneSeen: boolean; errorOrAbortSeen: boolean };
export type StreamCaptureOutcome = { kind: "complete"; capture: StreamCapture } | { kind: "inspector-abort-candidate"; capture: StreamCapture; diagnostics: StreamCaptureDiagnostics } | { kind: "failed"; error: Error; diagnostics: StreamCaptureDiagnostics };
export async function startChatStreamObserver(page: Page, options: { url: string; method?: "POST" | "GET" }): Promise<{ finished: Promise<StreamCaptureOutcome>; dispose: () => Promise<void> }> {
  // Primary passive Chromium observation; never interception, fetch replacement or replay.
  // Protocol semantics: bufferedData precedes activation; dataReceived.data follows it.
  // https://github.com/ChromeDevTools/devtools-protocol/blob/master/json/browser_protocol.json
  const safeError = (code: string) => new Error(`Chat stream capture failed: ${code}`);
  let session: CDPSession;
  try { session = await page.context().newCDPSession(page); }
  catch { throw safeError("SESSION"); }
  let settle!: (outcome: StreamCaptureOutcome) => void;
  const finished = new Promise<StreamCaptureOutcome>(resolve => { settle = resolve; });
  let settled = false, disposed = false, activationReady = false, loaded = false;
  let targetId: string | null = null;
  let identity: StreamCapture["identity"] = null;
  let metadata: { status: number; contentType: string } | null = null;
  let noStore = false;
  let chunks: Buffer[] = [];
  let byteCount = 0;
  let canceled: boolean | null = null;
  let errorCategory: StreamCaptureDiagnostics["errorCategory"] = "NONE";
  let disposal: Promise<void> | undefined;
  const clearBytes = () => { for (const chunk of chunks) chunk.fill(0); chunks = []; byteCount = 0; };
  const diagnostics = (): StreamCaptureDiagnostics => {
    const safe = { canceled, errorCategory, activationReady, loaded, bufferedByteCount: byteCount, finishSeen: false, finishOperationMatches: false, doneSeen: false, errorOrAbortSeen: false };
    // Diagnostics describe observed bytes only, never authorize success. They
    // deliberately contain no IDs, text, raw protocol error or payload fragments.
    const bytes = Buffer.concat(chunks);
    try {
      for (const block of bytes.toString("utf8").split(/\r?\n\r?\n/).slice(0, -1)) {
        const data = block.split(/\r?\n/).filter(line => line.startsWith("data:")).map(line => line.slice(5).trimStart()).join("\n");
        if (data === "[DONE]") { safe.doneSeen = true; continue; }
        try {
          const event = JSON.parse(data);
          if (event?.type === "error" || event?.type === "abort") safe.errorOrAbortSeen = true;
          const terminal = event?.messageMetadata;
          if (event?.type === "finish" && terminal?.finishReason === "stop" && terminal?.completionState === "complete" && typeof terminal?.operationId === "string") {
            safe.finishSeen = true;
            safe.finishOperationMatches = terminal.operationId === identity?.operationId;
          }
        } catch { /* Partial/non-JSON content never becomes a terminal proof. */ }
      }
    } finally { bytes.fill(0); }
    return safe;
  };
  const fail = (code: string) => {
    if (settled) return;
    const diagnosticScalars = diagnostics();
    settled = true; clearTimeout(timer); clearBytes();
    settle({ kind: "failed", error: safeError(code), diagnostics: diagnosticScalars });
  };
  const decode = (encoded: unknown): Buffer | null => {
    if (typeof encoded !== "string" || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) { fail("INVALID_BYTES"); return null; }
    const bytes = Buffer.from(encoded, "base64");
    if (bytes.toString("base64") !== encoded) { fail("INVALID_BYTES"); return null; }
    return bytes;
  };
  const add = (bytes: Buffer, prefix = false) => {
    if (settled || disposed) { bytes.fill(0); return; }
    byteCount += bytes.length;
    if (byteCount > 1_000_000) { bytes.fill(0); fail("BYTE_LIMIT"); return; }
    if (prefix) chunks.unshift(bytes); else chunks.push(bytes);
  };
  const complete = () => {
    if (settled || disposed || !loaded || !activationReady) return;
    if (!metadata || byteCount === 0) { fail("EMPTY_STREAM"); return; }
    const body = Buffer.concat(chunks);
    try { new TextDecoder("utf-8", { fatal: true }).decode(body); }
    catch { body.fill(0); fail("INVALID_UTF8"); return; }
    settled = true; clearTimeout(timer); clearBytes();
    settle({ kind: "complete", capture: { body, ...metadata, identity } });
  };
  const candidateBody = (): Buffer | null => {
    if (!identity || !metadata || metadata.status !== 200 || !/^text\/event-stream(?:\s*;|\s*$)/i.test(metadata.contentType) || !activationReady || byteCount === 0) return null;
    const body = Buffer.concat(chunks);
    try {
      const wire = new TextDecoder("utf-8", { fatal: true }).decode(body);
      if (!/\r?\n\r?\n$/.test(wire)) throw new Error();
      const blocks = wire.split(/\r?\n\r?\n/).filter(block => block.trim().length > 0);
      if (blocks.at(-1) !== "data: [DONE]" || blocks.filter(block => block === "data: [DONE]").length !== 1) throw new Error();
      const events = blocks.slice(0, -1).map(block => {
        if (!block.startsWith("data: ") || block.includes("\n")) throw new Error();
        const event = JSON.parse(block.slice(6));
        if (!event || typeof event !== "object" || Array.isArray(event) || !["start", "start-step", "text-start", "text-delta", "text-end", "finish-step", "finish"].includes(event.type)) throw new Error();
        return event;
      });
      const starts = events.filter(event => event.type === "start"), finishes = events.filter(event => event.type === "finish");
      const terminal = finishes[0]?.messageMetadata;
      if (starts.length !== 1 || starts[0].messageId !== identity.replyMessageId || events[0] !== starts[0] || finishes.length !== 1 || events.at(-1) !== finishes[0] || !terminal || Object.keys(terminal).sort().join(",") !== "completionState,finishReason,operationId" || terminal.operationId !== identity.operationId || terminal.finishReason !== "stop" || terminal.completionState !== "complete") throw new Error();
      const parts = new Map<string, { open: boolean; text: string }>();
      for (const event of events) {
        if (event.type === "text-start") {
          if (typeof event.id !== "string" || event.id.trim().length === 0 || parts.has(event.id)) throw new Error();
          parts.set(event.id, { open: true, text: "" });
        } else if (event.type === "text-delta" || event.type === "text-end") {
          const part = parts.get(event.id);
          if (!part?.open) throw new Error();
          if (event.type === "text-delta") {
            if (typeof event.delta !== "string") throw new Error();
            part.text += event.delta;
          } else part.open = false;
        }
      }
      if (parts.size === 0 || [...parts.values()].some(part => part.open) || [...parts.values()].map(part => part.text).join("").trim().length === 0) throw new Error();
      return body;
    } catch { body.fill(0); return null; }
  };
  const onRequest = (event: { requestId: string; request: { url: string; method: string; postData?: string } }) => {
    if (disposed || settled || event.request.url !== options.url || event.request.method !== (options.method ?? "POST")) return;
    if (targetId !== null) { fail("MULTIPLE_REQUESTS"); return; }
    targetId = event.requestId;
    if ((options.method ?? "POST") === "POST") {
      try {
        const parsed = JSON.parse(event.request.postData ?? "") as Record<string, unknown>;
        if (![parsed.id, parsed.operationId, parsed.replyMessageId].every(value => typeof value === "string" && value.trim().length > 0)) throw new Error();
        const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        if (!uuid.test(parsed.id as string) || !uuid.test(parsed.operationId as string)) throw new Error();
        identity = { id: parsed.id as string, operationId: parsed.operationId as string, replyMessageId: parsed.replyMessageId as string };
      } catch { fail("REQUEST_IDENTITY"); }
    }
  };
  const onResponse = (event: { requestId: string; response: { status: number; headers: Record<string, string> } }) => {
    if (disposed || settled || event.requestId !== targetId) return;
    if (metadata) { fail("MULTIPLE_RESPONSES"); return; }
    const contentType = Object.entries(event.response.headers).find(([name]) => name.toLowerCase() === "content-type")?.[1] ?? "";
    const cacheControl = Object.entries(event.response.headers).find(([name]) => name.toLowerCase() === "cache-control")?.[1] ?? "";
    noStore = cacheControl.split(",").some(directive => directive.trim().toLowerCase() === "no-store");
    metadata = { status: event.response.status, contentType };
    // Tail events can arrive before this command resolves. Keep them in event order;
    // the command's buffered prefix is inserted exactly once ahead of those events.
    void session.send("Network.streamResourceContent", { requestId: targetId! }).then(result => {
      if (settled || disposed) return;
      const prefix = decode(result.bufferedData);
      if (!prefix) return;
      add(prefix, true); activationReady = true; complete();
    }, () => fail("ACTIVATION"));
  };
  const onData = (event: { requestId: string; data?: string; dataLength: number }) => {
    if (disposed || settled || event.requestId !== targetId) return;
    if (event.data === undefined) {
      // Before the activation response, nonstreamed bytes belong to bufferedData.
      if (activationReady && event.dataLength > 0) fail("MISSING_BYTES");
      return;
    }
    const bytes = decode(event.data);
    if (bytes) add(bytes);
  };
  const onFinished = (event: { requestId: string }) => { if (event.requestId === targetId) { loaded = true; complete(); } };
  const onFailed = (event: { requestId: string; canceled?: boolean; errorText?: string }) => {
    if (event.requestId !== targetId) return;
    canceled = typeof event.canceled === "boolean" ? event.canceled : null;
    errorCategory = event.errorText === "net::ERR_ABORTED" ? "ABORTED" : event.errorText === "net::ERR_FAILED" ? "NETWORK" : "OTHER";
    // Chromium's no-store inspector cancellation can accompany genuine SDK EOF.
    // This is a candidate ONLY: the caller must independently prove SDK success,
    // strict same-request SSE integrity and exact saved text; never manufacture EOF.
    const body = noStore && canceled === true && errorCategory === "ABORTED" ? candidateBody() : null;
    if (body && metadata && !settled && !disposed) {
      const diagnosticScalars = diagnostics();
      settled = true; clearTimeout(timer); clearBytes();
      settle({ kind: "inspector-abort-candidate", capture: { body, ...metadata, identity }, diagnostics: diagnosticScalars });
      return;
    }
    fail("TRANSPORT");
  };
  const onClosed = () => { if (!disposed) fail("DISCONNECTED"); };
  session.on("Network.requestWillBeSent", onRequest);
  session.on("Network.responseReceived", onResponse);
  session.on("Network.dataReceived", onData);
  session.on("Network.loadingFinished", onFinished);
  session.on("Network.loadingFailed", onFailed);
  session.on("close", onClosed);
  const dispose = () => {
    if (disposal) return disposal;
    disposed = true; fail("DISPOSED"); clearTimeout(timer); clearBytes();
    session.off("Network.requestWillBeSent", onRequest);
    session.off("Network.responseReceived", onResponse);
    session.off("Network.dataReceived", onData);
    session.off("Network.loadingFinished", onFinished);
    session.off("Network.loadingFailed", onFailed);
    session.off("close", onClosed);
    identity = null; metadata = null; targetId = null;
    disposal = session.detach().catch(() => { throw safeError("DETACH"); });
    return disposal;
  };
  const timer = setTimeout(() => fail("DEADLINE"), 125_000);
  try {
    await Promise.race([
      session.send("Network.enable", { maxPostDataSize: 300_000 }),
      finished.then(result => { if (result.kind === "failed") throw result.error; }),
    ]);
  } catch {
    try { await dispose(); } finally { throw safeError("ENABLE"); }
  }
  return { finished, dispose };
}
