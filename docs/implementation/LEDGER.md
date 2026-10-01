# Implementation Ledger

Execution is authorized by the active user goal, superseding the index's earlier plan-only delivery. The task registry remains the dependency authority.

| Task | Status | Accepted base | File / port lease | Evidence | Verified commit / blocker |
| --- | --- | --- | --- | --- | --- |
| S00 | green/committed | 0782a20 | none | tracked specifications; both policy SHA-256 digests match manifest | 2020f82, 1c84e11, 0782a20 |
| S01 | green/committed | 0782a20 | generated scaffold ownership returned to BE; port 3000 transferred to S02 | app/verification-output/S01/20261001-0839/; S01/manual/manual-report.md; final mobile/desktop screenshots | 0041bde5f3dbcdd428aab1375ec39dcaea1c9e08 |
| S02 | green/committed | 0041bde | leases returned; live dev exec27903/PID4028 held by BE | app/verification-output/S02/20261001-0858/; S02/manual/ | 438d30cc6e44bd5332d9a8b8433a6aabb961ef03 |
| S02 manual QA | green | 438d30c | none | S02/manual/manual-report.md; mobile/desktop screenshots and status evidence | PASS: no console errors/warnings; root/favicon 200; private URLs 404 |
| Q02 preparation | research complete; implementation pending dispatch | 0041bde | no files | Commons candidates researched by QA; no acquisition or visual/decode acceptance yet | no claim of Q02 completion |

All other packages remain pending. Acceptance evidence, not this ledger, proves completion.

## S01 acceptance and compatibility review

Official generator used directly in app, original README preserved, no nested Git. Clean npm ci --strict-peer-deps and npm ls, lint/typecheck/build and independent real headed Playwright CLI manual checks passed. Generated next-env.d.ts remains ignored by generator convention. Runtime agentRules:false prevents unsolicited generated guides.

TypeScript 7.0.2 failed stable parser compatibility. All ESLint 9 patches are deprecated, while config-next's stable React/import/accessibility plugins exclude ESLint 10. The accepted, documented ADR-001 correction uses TypeScript 6.0.3, ESLint 10.11.0, direct official Next plugin, typescript-eslint and React Hooks rules. General React/import/JSX accessibility plugin rules remain unavailable until compatible releases; scoped tests and manual accessibility checks remain mandatory.

Independent manual QA found favicon 404; BE copied the existing brand favicon and verified matching SHA-256 and HTTP 200. Fresh QA console showed zero errors/warnings at 360x800 and 1440x900, without overflow. English/unbranded generated placeholder is explicitly provisional S01, not product acceptance. F01 owns Polish brand UI. No AI flow or provider generation is claimed.

S02 added the actual root/favicon endpoint regression after establishing healthy infrastructure. Logs/screenshots remain ignored evidence, not committed application state.


## S02 acceptance

Healthy bootstrap preceded two meaningful failing assertions for missing unit/integration scripts. Final unit 7/7 and integration 3/3 passed. Real DOM assertions and @ alias, legitimate server-only import/default rejection, real filesystem and Sharp, HTML shell and favicon bytes are covered. Clean strict-peer installation, npm dependency resolution, lint, typecheck and build passed. Separate headed CLI manual QA at 360/1440 passed with inspected screenshots, keyboard focus and no overflow/errors/warnings. Actual root/favicon returned 200; checked private URLs returned 404. No AI/provider generation or product/brand acceptance is claimed. Test scripts are separate; no production mock-provider switch exists. Bootstrap integration currently requires the matching running local dev server.
