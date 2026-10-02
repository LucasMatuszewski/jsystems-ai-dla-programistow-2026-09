import { expect, type Page, type TestInfo } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { ACTIVE_CASE_STORAGE_KEY, activeCaseSnapshotSchema } from "../../../src/lib/contracts/session";
import { createAnalysisRequestSchema, createDecisionRequestSchema } from "../../../src/lib/contracts/requests";
import { createImageAnalysisSchema } from "../../../src/lib/contracts/analysis";
import { createInitialDecisionSchema } from "../../../src/lib/contracts/decision";
import { SCENARIOS, CATEGORIES, BUYER_STATUSES, SELLER_STATUSES, REMEDIES } from "../../../src/lib/contracts/form";
import { FIRST_ASSESSMENT_NOTICE, OUTCOME_LABELS, formatFirstDecision } from "../../../src/lib/contracts/first-message";
import { choose, fillCase, labels, localDate, preparePhoto, submit } from "./case-input";
import { readCapturedRuntimeEvidence, verifyCapturedGenerations } from "./app-readiness";
import { assertRealGenerations, waitForOperationCompletion } from "./runtime-evidence";

export const assessmentLabels = {
  processing: "Przygotowanie wstępnej oceny", stages: ["Przygotowanie zdjęcia", "Analiza stanu sprzętu", "Przygotowanie oceny"],
  card: "Wstępna ocena początkowa", summary: "Dane sprawy",
  sections: ["Wstępny wynik", "Podsumowanie", "Uzasadnienie", "Ustalenia i zgłoszone fakty", "Podstawa procedury", "Ograniczenia oceny", "Pytania uzupełniające", "Dalsze kroki pracownika"],
} as const;
export type AssessmentCase = "damaged-complaint" | "used-return" | "functional-complaint" | "unknown-return" | "example-phone" | "example-laptop";
const configuredModel = "openai/gpt-6-luna";
const sourceManifest = JSON.parse(readFileSync(resolve("../assets/policy-sources/manifest.json"), "utf8")) as { source_url: string; files: { file: string; sha256: string }[] };

async function captureApprovedCase(page: Page, info: TestInfo, state: string, width: number) {
  const path = info.outputPath(`${state}-${width}.png`);
  await page.screenshot({ path, fullPage: true });
  await info.attach(`${state}-${width}`, { path, contentType: "image/png" });
}

async function fillAssessmentCase(page: Page, name: AssessmentCase) {
  const scenario = name.endsWith("return") ? "return" : "complaint";
  await fillCase(page, scenario);
  const example = name === "example-phone" || name === "example-laptop";
  if (example) {
    await choose(page, labels.category, name === "example-laptop" ? "Komputery" : "Smartfony i tablety");
    await page.getByLabel(labels.name, { exact: true }).fill(name === "example-laptop" ? "Laptop demonstracyjny" : "Telefon demonstracyjny");
  }
  if (name !== "unknown-return") {
    await page.getByRole("checkbox", { name: labels.unknownDelivery, exact: true }).uncheck();
    await page.getByLabel(labels.delivery, { exact: true }).fill(await localDate(page, -8));
  }
  const reason = example
    ? "Klient zgłasza, że urządzenie nie włącza się, i prosi o naprawę. Pracownik nie ustalił przyczyny ani nie przeprowadził badania technicznego. Jest to zgłoszenie klienta, nie wynik weryfikacji zdjęcia."
    : name === "used-return"
    ? `Zakup na odległość przez internet przez konsumenta od przedsiębiorcy. Zwykły seryjny telefon, nie wykonany na indywidualne zamówienie; według informacji pracownika nie zachodzi wyjątek od odstąpienia. Klient zgłasza odstąpienie od umowy dzisiaj, ${await localDate(page)}. Telefon był krótko zwyczajnie używany. Pracownik potwierdza komplet dołączonych akcesoriów i brak dodatkowych uszkodzeń. Są to informacje pracownika, nie ustalenia ze zdjęcia.`
    : name === "unknown-return" ? "Klient chce odstąpić od umowy. Pracownik nie zna statusu kupującego ani daty dostarczenia. Brak potwierdzenia daty zgłoszenia odstąpienia i kompletu akcesoriów. Zdjęcie pokazuje tylko tył telefonu."
    : name === "functional-complaint" ? "Według zgłoszenia klienta telefon nie włącza się. Pracownik nie ustalił przyczyny ani sprawności w badaniu technicznym. Brak informacji o upadku, zalaniu lub działaniu klienta. Zdjęcie nie potwierdza działania urządzenia."
    : "Klient zgłasza niedziałający ekran i widoczne pęknięcia. Pracownik nie ustalił przyczyny ani chwili uszkodzenia. Brak potwierdzenia, że klient spowodował uszkodzenie. Klient prosi o naprawę.";
  await page.getByLabel(labels.reason, { exact: true }).fill(reason);
  if (name === "unknown-return") await choose(page, labels.buyer, "Nie wiem");
  const fixture = example ? `example-images/${name === "example-laptop" ? "laptop-1.png" : "phone-1.jpg"}`
    : name === "damaged-complaint" ? "damaged-smartphone.jpg" : name === "unknown-return" ? "ambiguous-smartphone.jpg" : "intact-smartphone.jpg";
  await preparePhoto(page, fixture);
  return scenario;
}

async function checkpoint(page: Page) {
  const raw = await page.evaluate(key => localStorage.getItem(key), ACTIVE_CASE_STORAGE_KEY);
  const parsed = activeCaseSnapshotSchema.safeParse(raw ? JSON.parse(raw) : null);
  expect(parsed.success, "actual checkpoint must satisfy C03 without exposing its private payload").toBe(true);
  if (!parsed.success) throw new Error("Invalid actual assessment checkpoint");
  return parsed.data;
}

export async function assessActualCase(page: Page, testInfo: TestInfo, name: AssessmentCase) {
  let consoleFailures = 0;
  page.on("console", message => { if (message.type() === "error" || message.type() === "warning") consoleFailures++; });
  page.on("pageerror", () => { consoleFailures++; });
  expect((await page.goto("/"))?.status(), "real app must be healthy before behavioral assertions").toBe(200);
  const scenario = await fillAssessmentCase(page, name);
  const initial = await checkpoint(page);
  const apiRequests: string[] = [];
  page.on("request", request => { const path = new URL(request.url()).pathname; if (path.startsWith("/api/")) apiRequests.push(path); });
  const analysisResponse = page.waitForResponse(response => response.url().endsWith("/api/analysis") && response.request().method() === "POST", { timeout: 125_000 }).catch(() => null);
  const decisionResponse = page.waitForResponse(response => response.url().endsWith("/api/decisions") && response.request().method() === "POST", { timeout: 125_000 }).catch(() => null);
  await submit(page);
  const processing = page.getByRole("region", { name: assessmentLabels.processing, exact: true });
  try {
    await expect(processing, "valid prepared form must activate genuine initial assessment processing").toBeVisible();
  } finally {
    const countsPath = testInfo.outputPath("initial-activation-request-counts.json");
    writeFileSync(countsPath, JSON.stringify({ case: name, window: "initial-processing-visibility", analysis: apiRequests.filter(path => path === "/api/analysis").length, decision: apiRequests.filter(path => path === "/api/decisions").length, extraPreparation: apiRequests.filter(path => path === "/api/images/prepare").length, browserErrorsAndWarnings: consoleFailures }));
    await testInfo.attach("initial-activation-request-counts", {
      path: countsPath,
      contentType: "application/json",
    });
  }
  const stages = processing.getByRole("listitem");
  await expect(stages).toHaveCount(3);
  await expect(stages.nth(0)).toContainText(assessmentLabels.stages[0]);
  await expect(stages.nth(0)).toContainText("Ukończono");
  await expect(stages.nth(1)).toContainText(assessmentLabels.stages[1]);
  await expect(stages.nth(1)).toHaveAttribute("aria-current", "step");
  await expect(stages.nth(1)).toContainText("W trakcie");
  await expect(stages.nth(2)).toContainText(assessmentLabels.stages[2]);
  await expect(stages.nth(2)).toContainText("Nie rozpoczęto");
  await expect(processing.getByRole("status")).toContainText(assessmentLabels.stages[1]);
  // A real repeated employee activation must not create another operation. No clock/network manipulation.
  const repeatedSubmit = page.getByRole("button", { name: labels.submit, exact: true });
  if (await repeatedSubmit.isVisible()) {
    if (await repeatedSubmit.isEnabled()) await repeatedSubmit.click();
    else await expect(repeatedSubmit).toBeDisabled();
  }
  for (const width of [1440, 360]) {
    await page.setViewportSize({ width, height: 1000 });
    await captureApprovedCase(page, testInfo, "processing", width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  }
  const responseA = await analysisResponse;
  if (!responseA) throw new Error("Actual analysis response did not complete");
  expect(responseA.status(), "provider or output failure must fail honestly").toBe(200);
  const requestA = createAnalysisRequestSchema().safeParse(responseA.request().postDataJSON());
  const report = createImageAnalysisSchema(scenario).safeParse(await responseA.json());
  expect(requestA.success && report.success, "actual analysis request/report must be typed").toBe(true);
  if (!requestA.success || !report.success) throw new Error("Invalid actual analysis contract");
  expect(requestA.data.caseId).toBe(initial.caseId);
  expect(report.data.imageDigest).toBe(initial.preparedImage?.sha256);
  expect(report.data.modelId).toBe(configuredModel);
  const responseD = await decisionResponse;
  if (!responseD) throw new Error("Actual decision response did not complete");
  expect(responseD.status(), "provider or output failure must fail honestly").toBe(200);
  const requestD = createDecisionRequestSchema().safeParse(responseD.request().postDataJSON());
  const rawDecision: unknown = await responseD.json();
  const references = rawDecision && typeof rawDecision === "object" && "policyReferences" in rawDecision ? (rawDecision as { policyReferences: unknown }).policyReferences : null;
  const ids = Array.isArray(references) && references.every(value => typeof value === "string") ? references as string[] : [];
  const parsed = createInitialDecisionSchema(scenario, ids).safeParse(rawDecision);
  expect(requestD.success && parsed.success, "actual InitialDecision must be typed, never a guessed envelope").toBe(true);
  if (!requestD.success || !parsed.success) throw new Error("Invalid actual decision contract");
  const decision = parsed.data;
  // Targeted AC55 regression only: DTO enum values must not leak into these Polish demo-case explanations.
  // Schema enum fields, policy identifiers and official URLs are outside this natural-language check.
  const enumTokens = [...new Set([...SCENARIOS, ...CATEGORIES, ...BUYER_STATUSES, ...SELLER_STATUSES, ...REMEDIES])];
  const escapedTokens = enumTokens.sort((a, b) => b.length - a.length).map(value => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const rawEnum = new RegExp(`(?<![\\p{L}\\p{N}_-])(?:${escapedTokens.join("|")})(?![\\p{L}\\p{N}_-])`, "u");
  const employeeTexts = [decision.greeting, decision.summary, ...decision.justification, ...decision.evidence, ...decision.limitations, ...decision.questions, ...decision.nextSteps, ...(decision.resaleExplanation === null ? [] : [decision.resaleExplanation])];
  expect(employeeTexts.some(text => rawEnum.test(text.replace(/https?:\/\/\S+/g, ""))), "known raw DTO enum tokens must not leak into employee-facing demo-case explanations").toBe(false);
  expect(requestD.data.caseId).toBe(initial.caseId);
  expect(JSON.stringify(requestD.data.form) === JSON.stringify(requestA.data.form), "validated submitted facts must stay frozen").toBe(true);
  expect(JSON.stringify(requestD.data.imageAnalysis) === JSON.stringify(report.data), "decision must use the complete actual analysis").toBe(true);
  expect(decision.caseId).toBe(initial.caseId);
  expect(decision.modelId).toBe(configuredModel);
  expect(decision.preliminary && decision.employeeVerificationRequired).toBe(true);
  const source = sourceManifest.files.find(file => file.file === `allegro-${scenario === "complaint" ? "complaints" : "returns"}.html`);
  if (!source) throw new Error("Selected policy metadata missing");
  expect({ version: decision.policy.version, digest: decision.policy.digest, sourceUrl: decision.policy.sourceUrl, retrievedAt: decision.policy.retrievedAt }).toEqual({ version: source.sha256, digest: source.sha256, sourceUrl: sourceManifest.source_url, retrievedAt: "2026-09-30T09:15:03.305782Z" });
  const card = page.getByRole("article", { name: assessmentLabels.card, exact: true });
  await waitForOperationCompletion(card);
  await expect(page).toHaveURL(/\/chat$/);
  await expect(card).toHaveCount(1);
  await expect(card.getByText(FIRST_ASSESSMENT_NOTICE, { exact: true })).toBeVisible();
  const renderedCard = await card.innerText();
  expect(renderedCard.includes(decision.greeting), "actual card must contain its complete greeting without exposing model text in diagnostics").toBe(true);
  await expect(card).toContainText(OUTCOME_LABELS[decision.outcome]);
  expect(renderedCard.includes(decision.summary), "actual card must contain its complete summary without exposing model text in diagnostics").toBe(true);
  for (const heading of assessmentLabels.sections) await expect(card.getByRole("heading", { name: heading, exact: true })).toBeVisible();
  for (const reference of decision.policy.references) {
    expect(reference.url.startsWith(sourceManifest.source_url + "#"), "used references must point to the selected official source").toBe(true);
    await expect(card.getByRole("link", { name: reference.title, exact: true })).toHaveAttribute("href", reference.url);
  }
  if (scenario === "return") {
    expect(report.data.possibleCauses).toHaveLength(0);
    await expect(card.getByRole("heading", { name: "Ocena możliwości przyjęcia zwrotu", exact: true })).toBeVisible();
    await expect(card.getByRole("heading", { name: "Ocena stanu do ponownej sprzedaży", exact: true })).toBeVisible();
    expect(decision.resaleAssessment !== null && decision.resaleExplanation !== null).toBe(true);
  }
  const saved = await checkpoint(page);
  expect(saved.screen).toBe("chat");
  expect(saved.messages).toHaveLength(1);
  expect(saved.messages[0]?.role).toBe("assistant");
  expect(saved.messages[0]?.parts.map(part => part.text).join("") === formatFirstDecision(decision), "first assistant seed must retain complete deterministic text").toBe(true);
  expect(saved.initialDecision?.decisionId).toBe(decision.decisionId);
  expect(saved.imageAnalysis?.analysisId).toBe(report.data.analysisId);
  expect(saved.submittedForm !== null && JSON.stringify(saved.submittedForm) === JSON.stringify(requestA.data.form)).toBe(true);
  expect(apiRequests).toEqual(["/api/analysis", "/api/decisions"]);
  const expectedA = { caseId: initial.caseId, operationId: requestA.data.operationId, stage: "analysis" as const, modelId: configuredModel };
  const expectedD = { caseId: initial.caseId, operationId: requestD.data.operationId, stage: "decision" as const, modelId: configuredModel };
  const captured = await readCapturedRuntimeEvidence();
  const correlated = [...assertRealGenerations(captured, expectedA), ...assertRealGenerations(captured, expectedD)].map(({ caseId, operationId, stage, modelId, generationId }) => ({ caseId, operationId, stage, modelId, generationId }));
  const identityScalars = { case: name, caseId: initial.caseId, configuredModel, outcome: decision.outcome, policyDigest: decision.policy.digest, records: correlated };
  const correlationPath = testInfo.outputPath("correlation-only-generation-identities.json");
  writeFileSync(correlationPath, JSON.stringify({ verdict: "correlation-only-unverified", ...identityScalars }));
  await testInfo.attach("correlation-only-generation-identities", { path: correlationPath, contentType: "application/json" });
  const proofStarted = performance.now();
  const metadataWaitDeadlineMs = proofStarted + 420_000;
  const [proofA, proofD] = await Promise.all([
    verifyCapturedGenerations(expectedA, { metadataWaitDeadlineMs, attemptReportPath: testInfo.outputPath("analysis-proof-attempts.json") }),
    verifyCapturedGenerations(expectedD, { metadataWaitDeadlineMs, attemptReportPath: testInfo.outputPath("decision-proof-attempts.json") }),
  ]);
  expect(proofA).toHaveLength(1); expect(proofD).toHaveLength(1);
  expect(proofA[0].generationId).not.toBe(proofD[0].generationId);
  const verifiedPath = testInfo.outputPath("verified-generation-identities.json");
  writeFileSync(verifiedPath, JSON.stringify({ verdict: "verified", elapsedMs: performance.now() - proofStarted, ...identityScalars }));
  await testInfo.attach("verified-generation-identities", { path: verifiedPath, contentType: "application/json" });
  for (const width of [1440, 360]) {
    await page.setViewportSize({ width, height: 1000 });
    const disclosure = page.getByRole("button", { name: assessmentLabels.summary, exact: true });
    await expect(page.getByRole("button", { name: assessmentLabels.summary, exact: true, expanded: width !== 360 })).toBeVisible();
    await disclosure.focus(); await expect(disclosure).toBeFocused();
    if (width === 360) { await page.keyboard.press("Enter"); await expect(page.getByRole("button", { name: assessmentLabels.summary, exact: true, expanded: true })).toBeVisible(); }
    await expect(page.getByText(requestA.data.form.equipmentName, { exact: true })).toBeVisible();
    await captureApprovedCase(page, testInfo, "decision", width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  }
  expect(consoleFailures, "successful real journey must have no browser errors or warnings").toBe(0);
  return { analysis: report.data, decision };
}
