import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as analyze } from "@/app/api/analysis/route";
import { POST as decide } from "@/app/api/decisions/route";
import { POST as followUp } from "@/app/api/chat/route";
import { prepareImage } from "@/server/images/prepare-image";
import { createFormFingerprint } from "@/server/cases/form-fingerprint";
import { getAiConfiguration } from "@/server/ai/configuration";
import { loadPolicy, type LoadedPolicy } from "@/server/policies/policy-loader";
import { createImageAnalysisSchema, type ImageAnalysis } from "@/lib/contracts/analysis";
import { createInitialDecisionSchema, type InitialDecision } from "@/lib/contracts/decision";
import { createFirstDecisionMessage } from "@/lib/contracts/first-message";
import type { AnalysisRequest, ChatRequest } from "@/lib/contracts/requests";
import { terminalMetadataSchema, type CaseMessage } from "@/lib/contracts/messages";

const upstream = "https://openrouter.ai/api/v1/chat/completions";
const realFetch = globalThis.fetch;
const operation = (index: number) => `22222222-2222-4222-8222-${String(index).padStart(12, "0")}`;
type Key = "A" | "B";
type Stage = "analysis" | "decision" | "chat";
interface Fixture { key: string; caseId: string; tag: string; base: number; scenario: "complaint" | "return"; preparedImage: AnalysisRequest["preparedImage"]; form: AnalysisRequest["form"]; policy: LoadedPolicy }
interface State { fixture: Fixture; report: ImageAnalysis; decision: InitialDecision; history: CaseMessage[] }
interface Chunk { type: string; messageId?: string; delta?: string; messageMetadata?: unknown }
let fixtures: Record<Key, Fixture>;
let modelId: string;
let calls: { key: Key; stage: Stage; text: string; body: Record<string, unknown> }[];
let remote: (fixture: Fixture, stage: Stage, init?: RequestInit) => Promise<Response>;
function deferred<T>() { let release!: (value: T) => void; const promise = new Promise<T>(resolvePromise => { release = resolvePromise; }); return { promise, release }; }
async function within<T>(promise: Promise<T>, milliseconds = 4000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([promise, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("Case-isolation barrier did not complete")), milliseconds); })]); }
  finally { clearTimeout(timer); }
}
function request(path: string, value: unknown) { return new Request(`http://127.0.0.1:3000/api/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(value) }); }
function analysisOutput(fixture: Fixture) { return { imageQuality: "limited", observations: [{ finding: `Widoczny znak ${fixture.tag}`, visibleLocation: "Obudowa" }], signsOfUse: [], possibleCauses: [], limitations: ["Zdjęcie nie pokazuje działania"], missingInformation: ["Test działania"] }; }
function decisionOutput(fixture: Fixture) { return { outcome: "human_verification_required", greeting: "Dzień dobry", summary: `Sprawa ${fixture.tag} wymaga weryfikacji`, justification: ["Jedno zdjęcie nie pokazuje działania"], evidence: [`Zgłoszenie ${fixture.tag} pochodzi od pracownika`], policyReferences: [fixture.policy.headings[0].headingId], limitations: ["Brak testu działania"], questions: ["Czy sprawdzono zasilanie?"], nextSteps: ["Pracownik powinien zweryfikować objawy"], resaleAssessment: fixture.scenario === "return" ? "insufficient_evidence" : null, resaleExplanation: fixture.scenario === "return" ? "Jedno zdjęcie nie potwierdza kompletności i działania" : null }; }
function completion(fixture: Fixture, stage: Stage): Response {
  const id = `gen-b09-fixture-${fixture.key}-${stage}-12345678`;
  if (stage !== "chat") return Response.json({ id, object: "chat.completion", created: 1790000000, model: modelId, choices: [{ index: 0, message: { role: "assistant", content: JSON.stringify(stage === "analysis" ? analysisOutput(fixture) : decisionOutput(fixture)) }, finish_reason: "stop" }], usage: { prompt_tokens: 20, completion_tokens: 30, total_tokens: 50 } });
  const identity = { id, object: "chat.completion.chunk", created: 1790000000, model: modelId };
  return new Response([
    { ...identity, choices: [{ index: 0, delta: { role: "assistant", content: `Nowy zgłoszony fakt w sprawie ${fixture.tag} wymaga weryfikacji pracownika.` }, finish_reason: null }] },
    { ...identity, choices: [{ index: 0, delta: {}, finish_reason: "stop" }], usage: { prompt_tokens: 20, completion_tokens: 30, total_tokens: 50 } },
  ].map(event => `data: ${JSON.stringify(event)}\n\n`).join("") + "data: [DONE]\n\n", { headers: { "Content-Type": "text/event-stream" } });
}
async function chunks(response: Response): Promise<Chunk[]> { expect(response.status).toBe(200); const text = await response.text(); return text.split("\n").filter(line => line.startsWith("data: ") && line !== "data: [DONE]").map(line => JSON.parse(line.slice(6))); }
function modelText(body: Record<string, unknown>): string {
  return (body.messages as { content: string | { type: string; text?: string }[] }[]).map(message => typeof message.content === "string" ? message.content : message.content.filter(part => part.type === "text").map(part => part.text ?? "").join("")).join("\n");
}
async function startCase(fixture: Fixture): Promise<State> {
  const value: AnalysisRequest = { caseId: fixture.caseId, operationId: operation(fixture.base + 1), budgetMs: 120000, timeZone: "Europe/Warsaw", preparedImage: fixture.preparedImage, form: fixture.form };
  const analysisResponse = await analyze(request("analysis", value)); expect(analysisResponse.status).toBe(200);
  const report = createImageAnalysisSchema(fixture.scenario).parse(await analysisResponse.json());
  const decisionResponse = await decide(request("decisions", { caseId: fixture.caseId, operationId: operation(fixture.base + 2), budgetMs: 120000, timeZone: value.timeZone, form: fixture.form, imageAnalysis: report })); expect(decisionResponse.status).toBe(200);
  const decision = createInitialDecisionSchema(fixture.scenario, fixture.policy.headings.map(heading => heading.headingId)).parse(await decisionResponse.json());
  return { fixture, report, decision, history: [createFirstDecisionMessage(decision, `seed-${fixture.key}`), { id: `employee-${fixture.key}`, role: "user", parts: [{ type: "text", text: `Nowy zgłoszony fakt ${fixture.tag}: zasilacz działa z innym urządzeniem.` }] }] };
}
function chatInput(state: State, retry = false): ChatRequest {
  return { id: state.fixture.caseId, operationId: operation(state.fixture.base + (retry ? 4 : 3)), replyMessageId: `reply-${state.fixture.key}${retry ? "-retry" : ""}`, trigger: retry ? "regenerate-message" : "send-message", caseContext: { form: state.fixture.form, timeZone: "Europe/Warsaw", imageAnalysis: state.report, initialDecision: state.decision }, messages: state.history };
}
async function pipeline(fixture: Fixture) { const state = await startCase(fixture); return { state, parts: await chunks(await followUp(request("chat", chatInput(state)))) }; }
function expectComplete(parts: Chunk[], value: ChatRequest) {
  const metadata = terminalMetadataSchema.parse([...parts].reverse().find(part => part.messageMetadata !== undefined)?.messageMetadata);
  expect(metadata).toEqual({ operationId: value.operationId, finishReason: "stop", completionState: "complete" }); expect(parts.find(part => part.type === "start")?.messageId).toBe(value.replyMessageId);
  expect(parts.filter(part => part.type === "text-delta").map(part => part.delta).join("").includes(value.caseContext.form.equipmentName)).toBe(true);
}
function expectPrivateContexts() {
  for (const call of calls) {
    const own = fixtures[call.key]; const other = fixtures[call.key === "A" ? "B" : "A"];
    expect(call.text.includes(own.tag)).toBe(true); expect(call.text.includes(other.tag)).toBe(false);
    if (call.stage !== "analysis") { expect(call.text.includes(own.policy.html)).toBe(true); expect(call.text.includes(other.policy.html)).toBe(false); }
    else {
      const body = JSON.stringify(call.body);
      expect(body.includes(own.preparedImage.imageDataUrl)).toBe(true); expect(body.includes(other.preparedImage.imageDataUrl)).toBe(false);
    }
  }
}

describe("independent cases with real SDK/Sharp/contracts/policy and only external LLM HTTP fixtures", () => {
  beforeAll(async () => {
    const [imageA, imageB, complaint, returns] = await Promise.all([
      prepareImage(await readFile(resolve("tests/fixtures/images/damaged-smartphone.jpg"))), prepareImage(await readFile(resolve("tests/fixtures/images/intact-smartphone.jpg"))), loadPolicy("complaint"), loadPolicy("return"),
    ]);
    const baseForm = { category: "smartphones-tablets" as const, purchaseDate: "2026-01-01", deliveryDate: null, buyerStatus: "unknown" as const, sellerStatus: "business" as const };
    fixtures = {
      A: { key: "A", caseId: "11111111-1111-4111-8111-111111111111", tag: "PRZYKLAD-SPRAWA-A", base: 1000, scenario: "complaint", preparedImage: imageA, form: { ...baseForm, scenario: "complaint", equipmentName: "PRZYKLAD-SPRAWA-A", reason: "Nie włącza się", requestedRemedy: "repair" }, policy: complaint },
      B: { key: "B", caseId: "55555555-5555-4555-8555-555555555555", tag: "PRZYKLAD-SPRAWA-B", base: 2000, scenario: "return", preparedImage: imageB, form: { ...baseForm, scenario: "return", equipmentName: "PRZYKLAD-SPRAWA-B", reason: "", requestedRemedy: null }, policy: returns },
    };
    expect(imageA.sha256 === imageB.sha256).toBe(false);
  });
  beforeEach(() => {
    vi.stubEnv("OPENROUTER_API_KEY", "fixture-only-key"); vi.stubEnv("LLM_MODEL", "openai/gpt-6-luna"); modelId = getAiConfiguration().modelId;
    calls = []; remote = async (fixture, stage) => completion(fixture, stage);
    vi.stubGlobal("fetch", async (url: string | URL | Request, init?: RequestInit) => {
      if (String(url) !== upstream) return realFetch(url, init);
      const body = JSON.parse(String(init?.body)); const text = modelText(body); const key: Key = text.includes(fixtures.A.tag) ? "A" : "B";
      const stage: Stage = body.stream ? "chat" : body.max_tokens === 12288 ? "decision" : "analysis";
      calls.push({ key, stage, text, body }); return remote(fixtures[key], stage, init);
    });
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
  it("finishes one whole case while another analysis is pending without mixing images, facts, policies, history or identities", async () => {
    const heldA = deferred<Response>(); const bothStarted = deferred<void>(); const started = new Set<string>();
    remote = async (fixture, stage) => {
      if (stage === "analysis") { started.add(fixture.key); if (started.size === 2) bothStarted.release(); if (fixture.key === "A") return heldA.promise; }
      return completion(fixture, stage);
    };
    const a = pipeline(fixtures.A); const b = pipeline(fixtures.B); void a.catch(() => undefined); void b.catch(() => undefined);
    try {
      await within(bothStarted.promise); const resultB = await within(b);
      expect(calls.filter(call => call.key === "A").map(call => call.stage)).toEqual(["analysis"]);
      expectComplete(resultB.parts, chatInput(resultB.state)); heldA.release(completion(fixtures.A, "analysis")); const resultA = await within(a);
      expectComplete(resultA.parts, chatInput(resultA.state));
      for (const { state } of [resultA, resultB]) {
        expect(state.report.scenario).toBe(state.fixture.scenario); expect(state.report.imageDigest).toBe(state.fixture.preparedImage.sha256); expect(state.report.formFingerprint).toBe(createFormFingerprint(state.fixture.form));
        expect(state.decision.caseId).toBe(state.fixture.caseId); expect(state.decision.policy.digest).toBe(state.fixture.policy.provenance.digest);
      }
      expect(resultA.state.report.analysisId === resultB.state.report.analysisId).toBe(false); expect(resultA.state.decision.decisionId === resultB.state.decision.decisionId).toBe(false);
      expect(calls).toHaveLength(6); expectPrivateContexts();
    } finally { heldA.release(completion(fixtures.A, "analysis")); await Promise.allSettled([a, b]); }
  }, 10000);
  it("overlaps five complete cases at every AI stage without mixing images, facts, policies or full chronological history", async () => {
    const names = ["laptop-1.png", "laptop-2.webp", "phone-1.jpg", "phone-2.jpeg", "phone-3.jpeg"];
    const five: Fixture[] = await Promise.all(names.map(async (name, index) => {
      const preparedImage = await prepareImage(await readFile(resolve("tests/fixtures/images/example-images", name)));
      const scenario = index % 2 === 0 ? "complaint" : "return";
      const tag = `PRZYKLAD-PIEC-SPRAWA-${index + 1}`;
      const common = { category: "smartphones-tablets" as const, equipmentName: tag, purchaseDate: "2026-01-01", deliveryDate: null, buyerStatus: "unknown" as const, sellerStatus: "business" as const };
      return { key: `five-${index + 1}`, caseId: `11111111-1111-4111-8111-${String(index + 10).padStart(12, "0")}`, tag, base: 3000 + index * 100, scenario, preparedImage,
        form: scenario === "complaint" ? { ...common, scenario, reason: `Zgłoszony objaw ${tag}`, requestedRemedy: "repair" } : { ...common, scenario, reason: "", requestedRemedy: null },
        policy: await loadPolicy(scenario) };
    }));
    expect(new Set(five.map(fixture => fixture.preparedImage.sha256)).size).toBe(5);
    const stages: Stage[] = ["analysis", "decision", "chat"];
    const barriers = Object.fromEntries(stages.map(stage => [stage, { arrived: new Set<string>(), allArrived: deferred<void>(), release: deferred<void>() }])) as Record<Stage, { arrived: Set<string>; allArrived: ReturnType<typeof deferred<void>>; release: ReturnType<typeof deferred<void>> }>;
    const fiveCalls: { fixture: Fixture; stage: Stage; text: string; body: Record<string, unknown> }[] = [];
    vi.stubGlobal("fetch", async (url: string | URL | Request, init?: RequestInit) => {
      if (String(url) !== upstream) return realFetch(url, init);
      const body = JSON.parse(String(init?.body)); const text = modelText(body);
      const matching = five.filter(fixture => text.includes(fixture.tag)); expect(matching).toHaveLength(1);
      const fixture = matching[0]; const stage: Stage = body.stream ? "chat" : body.max_tokens === 12288 ? "decision" : "analysis";
      fiveCalls.push({ fixture, stage, text, body });
      const barrier = barriers[stage]; expect(barrier.arrived.has(fixture.key)).toBe(false); barrier.arrived.add(fixture.key);
      if (barrier.arrived.size === 5) barrier.allArrived.release();
      await barrier.release.promise;
      return completion(fixture, stage);
    });
    const pending = five.map(async fixture => {
      const state = await startCase(fixture);
      state.history = [state.history[0],
        { id: `prior-user-${fixture.key}`, role: "user", parts: [{ type: "text", text: `Wcześniejszy fakt ${fixture.tag}.` }] },
        { id: `prior-reply-${fixture.key}`, role: "assistant", parts: [{ type: "text", text: `Wcześniejsza wstępna odpowiedź ${fixture.tag}.` }] }, state.history[1]];
      const input = chatInput(state);
      return { state, input, parts: await chunks(await followUp(request("chat", input))) };
    });
    pending.forEach(promise => { void promise.catch(() => undefined); });
    try {
      for (const [index, stage] of stages.entries()) {
        await within(barriers[stage].allArrived.promise);
        expect(barriers[stage].arrived.size).toBe(5);
        expect(fiveCalls.filter(call => call.stage === stage)).toHaveLength(5);
        expect(fiveCalls).toHaveLength((index + 1) * 5);
        if (index < stages.length - 1) expect(barriers[stages[index + 1]].arrived.size).toBe(0);
        barriers[stage].release.release();
      }
      const results = await within(Promise.all(pending));
      expect(fiveCalls).toHaveLength(15);
      expect(new Set(results.map(({ state }) => state.report.analysisId)).size).toBe(5);
      expect(new Set(results.map(({ state }) => state.decision.decisionId)).size).toBe(5);
      expect(new Set(results.map(({ input }) => input.replyMessageId)).size).toBe(5);
      expect(new Set(five.flatMap(fixture => stages.map((_stage, index) => operation(fixture.base + index + 1)))).size).toBe(15);
      for (const { state, input, parts } of results) {
        const own = state.fixture; expectComplete(parts, input);
        expect(state.report.scenario).toBe(own.scenario); expect(state.report.imageDigest).toBe(own.preparedImage.sha256);
        expect(state.report.formFingerprint).toBe(createFormFingerprint(own.form)); expect(state.decision.caseId).toBe(own.caseId);
        expect(state.decision.scenario).toBe(own.scenario); expect(state.decision.policy.digest).toBe(own.policy.provenance.digest);
        const ownCalls = fiveCalls.filter(call => call.fixture.key === own.key); expect(ownCalls.map(call => call.stage)).toEqual(stages);
        for (const call of ownCalls) {
          for (const other of five.filter(fixture => fixture.key !== own.key)) {
            expect(call.text.includes(other.tag)).toBe(false);
            expect(JSON.stringify(call.body).includes(other.preparedImage.imageDataUrl)).toBe(false);
            if (call.stage !== "analysis" && other.scenario !== own.scenario) expect(call.text.includes(other.policy.html)).toBe(false);
          }
          if (call.stage === "analysis") expect(JSON.stringify(call.body).includes(own.preparedImage.imageDataUrl)).toBe(true);
          else expect(call.text.includes(own.policy.html)).toBe(true);
          if (call.stage === "chat") {
            const sent = call.body.messages as { role: string; content: string | { type: string; text?: string }[] }[];
            const chronological = sent.slice(-state.history.length).map(message => ({ role: message.role, text: typeof message.content === "string" ? message.content : message.content.map(part => part.text ?? "").join("") }));
            expect(chronological).toEqual(state.history.map(message => ({ role: message.role, text: message.parts.map(part => part.text).join("") })));
          }
        }
        for (const other of five.filter(fixture => fixture.key !== own.key)) expect(JSON.stringify({ report: state.report, decision: state.decision, parts }).includes(other.tag)).toBe(false);
      }
      const proofRoot = resolve("verification-output/B09/five-case-coverage"); await mkdir(proofRoot, { recursive: true });
      await writeFile(resolve(proofRoot, "proof.json"), JSON.stringify({ realProviderAccessClaim: false, caseCount: results.length, upstreamCalls: fiveCalls.length, overlappingPerStage: Object.fromEntries(stages.map(stage => [stage, barriers[stage].arrived.size])), uniqueImageDigests: new Set(five.map(fixture => fixture.preparedImage.sha256)).size, fullHistoryPreserved: true, crossCaseLeakage: false, completedReplies: results.length }) + "\n");
    } finally {
      stages.forEach(stage => barriers[stage].release.release());
      await Promise.allSettled(pending);
    }
  }, 20000);
  it("cancels one case before a late ignored-abort response while the other completes and explicit retry keeps the same employee turn", async () => {
    const [stateA, stateB] = await Promise.all([startCase(fixtures.A), startCase(fixtures.B)]);
    const beforeA = JSON.stringify(stateA); const beforeB = JSON.stringify(stateB); const lateA = deferred<Response>(); const readyA = deferred<void>(); const lateSettled = deferred<void>();
    let chatAttemptsA = 0; let signalA: AbortSignal | null | undefined; let signalB: AbortSignal | null | undefined;
    remote = async (fixture, stage, init) => {
      if (fixture.key === "A" && stage === "chat" && ++chatAttemptsA === 1) { signalA = init?.signal; readyA.release(); return lateA.promise.finally(() => lateSettled.release()); }
      if (fixture.key === "B" && stage === "chat") signalB = init?.signal;
      return completion(fixture, stage);
    };
    const valueA = chatInput(stateA); const valueB = chatInput(stateB); const responseA = await followUp(request("chat", valueA)); expect(responseA.status).toBe(200);
    const readerA = responseA.body!.getReader(); let cancellation: Promise<void> | undefined;
    const b = followUp(request("chat", valueB)).then(chunks); void b.catch(() => undefined);
    try {
      await within(readyA.promise); await within(readerA.read()); cancellation = readerA.cancel(); void cancellation.catch(() => undefined);
      const cancelledPromptly = await within(cancellation, 1000).then(() => true, () => false);
      const partsB = await within(b); expectComplete(partsB, valueB); expect(signalA?.aborted).toBe(true); expect(signalB?.aborted).toBe(false);
      expect(JSON.stringify(stateA) === beforeA).toBe(true); expect(JSON.stringify(stateB) === beforeB).toBe(true); expect(cancelledPromptly).toBe(true);
      const retry = chatInput(stateA, true); const retryParts = await chunks(await followUp(request("chat", retry))); expectComplete(retryParts, retry);
      expect(retry.messages.filter(message => message.role === "user").map(message => message.id)).toEqual(["employee-A"]); expect(chatAttemptsA).toBe(2);
      expectPrivateContexts();
    } finally {
      lateA.release(completion(fixtures.A, "chat")); await lateSettled.promise; await cancellation?.catch(() => undefined); await Promise.allSettled([b]); readerA.releaseLock();
    }
    await new Promise<void>(resolveTick => setImmediate(resolveTick));
  }, 10000);
});
