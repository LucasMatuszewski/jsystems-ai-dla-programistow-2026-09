# VM shutdown checkpoint — 1 October 2026

The user requested an immediate commit and GitHub push before VM shutdown, preserving unfinished work to resume tomorrow. This checkpoint is deliberately WIP; it is not feature acceptance. The urgent user instruction overrides the normal requirement to finish verification before committing. No force push or merge into the default branch is needed.

## Accepted baseline

- B07: b95091cef3ea3b32d14cbbd8543385726ea98e09 — real structured selected-policy initial decisions, reference validation, complete first-message size guard and Polish explanation instructions.
- Q01 privacy: 7b393aae78018d895eb30101b65d29aa2d8ad75b — safe failure context and trace artifacts, approved screenshots retained.
- Ledger: 22da557e9fff1ab3e8ce811caf7d3724df25b9f0.
- B07 real manual complaint/return analyses and decisions: eight authenticated official generation proofs accepted. Frozen lint/typecheck/dependencies/build and fresh manual 360/1440 checks passed. Earlier accepted tasks and SHAs are in LEDGER.md.

## Work preserved, not accepted yet

F05/F06 source is connected in the leased workflow, card, summary, persistent CaseShell provider, root layout and home/chat routes. API/controller tests initially passed25; six owned suites later passed50 including a meaningful duplicate-reference RED and correction to render unique trusted metadata references. Additional test-first fixes address a zero remaining budget between stage entry and request, clean draft debounce and restoring a failed-stage checkpoint as interrupted. Final affected regression and manual acceptance remain pending.

Two existing tests outside the original FE lease need a narrow test-only adaptation: app/src/features/case-form/equipment-image-picker.test.tsx and app/src/components/app-header.test.tsx render Home without the new persistent provider. Wrap Home with CaseShellProvider and mock the unit router, preserving behavioral assertions. The old picker assertion of temporary 'Dane formularza są poprawne.' after Dalej should become an assertion that the mocked controller starts once with submitted facts; the live workflow now replaces that temporary copy. Root had not approved or performed this adaptation at interruption. Scoped TypeScript must include tests/setup-unit.ts to load existing jest-dom matcher types; missing matcher types are a harness issue, not a product failure.

B08 streaming backend has a healthy behavioral RED checkpoint: U20 with17 expected failures/3 passes and real-SDK integration I46 with16 expected failures/30 passes. Actual Next HTTP invalid422 and full policy/history fixtures were healthy. Owned lint/types passed. Minimum GREEN was authorized and may be partially implemented in chat.ts, chat-history.ts, API chat route and their two test files. Inspect current code and rerun its scoped tests before claiming completion. Requirements include one90-second route-owned body-to-stream deadline, complete full context, text-only standard SDK UI stream, stable reply ID, safe JSON ErrorEnvelope in errorText, and terminal completion only after normal stop plus successful SDK onEnd and no abort/error/cancellation. Continue draining upstream while withholding finish to avoid onEnd deadlock. No truncation, hidden retry or completed-generation event for incomplete output. Real90-second lifecycle, stdout diagnostic proof and real provider/manual acceptance remain outstanding.

Q04 browser R is accepted: four healthy actual form/native preparation journeys failed specifically at missing processing before FE activation. A warning-free representative proved analysis0/decision0/extraPreparation0/browser errors0. These are RED evidence, not initial-quality acceptance. Q04 live four cases must still run after source freeze against a fresh captured server, with eight real analysis/decision IDs and independent human review.

Q01 metadata follow-up is GREEN scoped U55/lint/types, preserving all34 prior alias/privacy criteria. Six files change only test evidence helpers and Q04 proof wiring. Opt-in metadata polling retries only404 for the same captured generation IDs, with one absolute monotonic420-second diagnostic budget including alias lookup; all other invalid evidence fails immediately. Default verification remains one GET. Q04 proofs run concurrently with a shared deadline and600-second test budget; actual120-second app deadline and125-second UI wait are unchanged. Persisted safe identity artifacts distinguish correlation-only-unverified from official verified proof. No live/provider test of this follow-up has run yet.

## Resume workflow

1. Inspect current Git branch/status and this checkpoint. Preserve peer/user edits; do not infer green from the emergency commit.
2. Install dependencies if needed, configure the authorized OPENROUTER_API_KEY securely and retain configured LLM_MODEL=openai/gpt-6-luna. No credential is included in this checkpoint.
3. Finish the narrow FE test harness adaptations and owned tests; finish B08 scoped unit/integration/lifecycle tests. Revalidate the metadata helper tests.
4. Freeze all writers, run changed-scope checks/build, start the real app, then use a fresh test-owned capture for real Q04 and B08 available-scope manual proof. Actual metadata404 can take minutes; retry only the read-only metadata lookup, never the model automatically.
5. Independent Playwright CLI manual QA must inspect actual360/1440 screens and exercise real complaint/return workflows, cancellation/retry and live storage-warning navigation. Compare to assets/homepage.png and docs/design-guidelines.md.
6. Focused accepted commits follow only after real verification. Remaining plan scope includes B09, F07–F10, Q05–Q08 and D01; the full goal is not complete.

All agents were instructed to stop writes for the emergency backup. Last server was durable normal dev listener10716/CLI11632 on port3000, but those PIDs are not valid after VM restart. Verify actual process state before starting or stopping anything. Runtime credentials, dependencies/build caches and raw ignored evidence are intentionally excluded from Git. Safe acceptance summaries and source/tests are preserved here and in the ledger. Unknown empty app/src/app/api/AGENTS.md and docs/reports/2026-10-01-ai-test-coverage-audit.md were preserved as requested; the active authors denied creating the latter.
