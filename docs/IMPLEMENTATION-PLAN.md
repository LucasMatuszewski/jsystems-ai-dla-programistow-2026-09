# Hardware Service Decision Copilot — Implementation Coordination

**Updated:** 2026-10-01
**Status:** Plan only; application execution requires a separate instruction.

## Authority and confirmed delivery

[PRD](PRD.md) defines functionality, [ADRs](ADR/000-main-architecture.md) define implementation decisions, and [design guidelines](design-guidelines.md) define visuals. This index coordinates execution; it does not replace those sources. The requested alternate PRD filename is absent; `docs/PRD.md` is canonical.

The six confirmed preferences are:

1. Current delivery is the plan and agent definitions; no app implementation now.
2. English plan lives at `docs/IMPLEMENTATION-PLAN.md`; application/chat text is Polish.
3. Use native `.codex/agents/{fe-developer,be-developer,qa-engineer}.toml` definitions, inheriting settings.
4. One shared repository; parallel edits only on disjoint leased files. No worktrees/branches.
5. Use existing authorized OpenRouter configuration and ADR limits; no additional cost cap.
6. Final PoC includes its README, training demo script and manual QA evidence.

The baseline is already committed: `2020f82` (plan/native roles) and `1c84e11` (PRD/ADRs/policy sources). **S00 is complete**; verify referenced artifacts if subsequently changed, without repeating an empty commit. The application remains README-only. Out-of-scope features remain those in PRD §7.

## Coordinator reading and dispatch

Load this index, then only the selected packet. Use [delegation protocol](implementation/DELEGATION.md) to supply complete but scoped input. Do not bulk-read packet files, PRD/ADRs or previous conversation. [Coverage assignments](implementation/COVERAGE.md) are loaded for an audit/Q08 or selected criterion rows only.

BE = be-developer; FE = fe-developer; QA = qa-engineer. The orchestrator manages and reviews; specialists author and implement. Prefer exact native roles after verifying availability. If unavailable, assign the matching brief to frontend-nextjs-developer, worker/default or e2e-qa-engineer respectively; writing role files does not reload this session.

This table is the **only dependency registry**. Completion dependencies mean accepted, green and committed. R is an early QA behavioral-red checkpoint, not completion of its QA package. QA tests and the paired product change enter one verified feature commit; unreachable future behavior cannot block an earlier checkpoint.

## Six phases and release gates

| Phase | Packages | Gate |
| --- | --- | --- |
| 1 — Baseline/bootstrap | S00–S03, Q01–Q02 | Official scaffold, healthy runners, real-photo provenance, stable component setup |
| 2 — Foundations | C01–C03, B01–B05, F01–F03 | Frozen shared contracts; real private resources/image preparation; branded form/storage modules |
| 3 — Initial assessment | B06–B07, F04–F06, Q03–Q04 | Real analysis/decision generations, validated first message and populated chat |
| 4 — Chat/continuity | B08–B09, F07–F09, Q05–Q06 | Real stream, truthful retry/completion, refresh/reset/tab isolation |
| 5 — Quality/capacity | F10, Q07 | Brand/accessibility fixes and five independent actual cases |
| 6 — Demo/acceptance | D01, Q08 | Verified runbook and all 58 AC/34 TAC evidence |

BE foundations, FE UI and QA preparation can overlap only with committed prerequisites and disjoint files. Phase gates release completed behavior; QA R checkpoints start earlier as specified below.

## Task registry

| Task packet | Role | Direct completion prerequisites | QA red checkpoint/start |
| --- | --- | --- | --- |
| [S00 — Tracked baseline](implementation/tasks/S00.md) | BE | Completed baseline | — |
| [S01 — Generated scaffold](implementation/tasks/S01.md) | BE | S00 | — |
| [S02 — Verification infrastructure](implementation/tasks/S02.md) | BE | S01 | — |
| [S03 — Selected UI primitives](implementation/tasks/S03.md) | FE | S02 | — |
| [C01 — Form/calendar contracts](implementation/tasks/C01.md) | BE | S02 | — |
| [C02 — Evidence/decision contracts](implementation/tasks/C02.md) | BE | C01 | — |
| [C03 — Frozen workflow contracts](implementation/tasks/C03.md) | BE | C02 | — |
| [B01 — Immutable policies](implementation/tasks/B01.md) | BE | S02 | — |
| [B02 — Scenario prompts](implementation/tasks/B02.md) | BE | B01, C02 | — |
| [B03 — Provider/request infrastructure](implementation/tasks/B03.md) | BE | C03 | — |
| [B04 — Sharp service](implementation/tasks/B04.md) | BE | C02, Q02 | — |
| [B05 — Image preparation route](implementation/tasks/B05.md) | BE | B04, B03, C03 | — |
| [B06 — Multimodal analysis route](implementation/tasks/B06.md) | BE | B02, B03, B05, C03 | — |
| [B07 — Initial decision route](implementation/tasks/B07.md) | BE | B01, B02, B03, B06, C03 | — |
| [B08 — Full-context chat stream](implementation/tasks/B08.md) | BE | B07, C03, B02, B03 | — |
| [B09 — Failure/isolation hardening](implementation/tasks/B09.md) | BE | B08 | — |
| [F01 — Branded shell](implementation/tasks/F01.md) | FE | S03 | — |
| [F02 — Conditional form](implementation/tasks/F02.md) | FE | F01, C01, Q03-form-R | Require Q03-form-R. |
| [F03 — Snapshot adapter](implementation/tasks/F03.md) | FE | C03 | — |
| [F04 — Image picker integration](implementation/tasks/F04.md) | FE | F02, F03, B05, Q02, Q03-image-R | Require Q03-image-R. |
| [F05 — Initial workflow controller](implementation/tasks/F05.md) | FE | F04, B06, B07, Q04-R | Require Q04-R. |
| [F06 — Decision card/navigation](implementation/tasks/F06.md) | FE | F05, C03 | — |
| [F07 — Text streaming chat](implementation/tasks/F07.md) | FE | F06, B08, Q05-R | Require Q05-R. |
| [F08 — Incomplete/retry lifecycle](implementation/tasks/F08.md) | FE | F07, B09 | Q05 retry R after F07/B09. |
| [F09 — Refresh/reset/tab isolation](implementation/tasks/F09.md) | FE | F08, F03, B09, Q06-R | Require Q06-R. |
| [F10 — Accessibility/brand fixes](implementation/tasks/F10.md) | FE | F09, Q06 | — |
| [Q01 — Real E2E harness](implementation/tasks/Q01.md) | QA | S02 | — |
| [Q02 — Licensed photo fixtures](implementation/tasks/Q02.md) | QA | S02 | — |
| [Q03 — Form/image checkpoints](implementation/tasks/Q03.md) | QA | Q01, Q02, F04 | Form R: Q01/F01/C01; image R: Q01/F02/B05/Q02. |
| [Q04 — Initial quality journeys](implementation/tasks/Q04.md) | QA | Q01, Q02, F06, Q03 | R: Q01/Q02/F04/B07, before F05/F06 activation. |
| [Q05 — Chat/retry journeys](implementation/tasks/Q05.md) | QA | Q04, F08 | Normal R: Q01/F06/B08 before F07; retry R: F07/B09 before F08. |
| [Q06 — Continuity journeys](implementation/tasks/Q06.md) | QA | Q05, F09 | R: Q01/F08, before F09. |
| [Q07 — Five-case capacity](implementation/tasks/Q07.md) | QA | Q06, F10, B09 | — |
| [D01 — Verified demo/runbook](implementation/tasks/D01.md) | BE | Q07 | — |
| [Q08 — Final acceptance](implementation/tasks/Q08.md) | QA | D01, Q07, all developer packages integrated | — |

## Ownership and acceptance

| Area | Owner and transfer |
| --- | --- |
| Package/lock/generated configuration/runners | BE; temporary S03 install lease to FE, then return |
| Shared contracts and formatter | BE C01–C03; freeze revision v1 before consumers |
| Server/resources/API routes | BE exclusively |
| Public brand/layout/CSS/pages/browser features | FE; transfer page/controller files between completed packets |
| Playwright configuration/real fixtures/browser specs | QA; named test-file lease for paired work |
| Commits | BE exclusively after global verification/commit freeze |
| Final README/demo | BE with FE/QA review |

Packets list exclusive files. New/changed ownership requires explicit transfer; no shared blanket test-directory ownership. BE sends FE/QA accepted contract/endpoint artifact paths and revisions. FE sends actual accessible-flow boundaries and protocol findings. QA supplies real fixtures, scoped red checkpoints and defects; production fixes return to their owner.

All writers stop for verification, manual QA and commit. The verifier must use only accepted dependencies/current-task files, never another task's uncommitted implementation. Hold the port-3000 lease; unrelated incomplete code that breaks build/startup delays the commit rather than being reverted or silently staged.

Maintain a concise ledger: task ID, status, accepted base/artifact revision, file/port leases, evidence paths, verified commit and blocker. States: pending → red-ready → implementing → green/committed; bootstrap/test-only exceptions are explicit. Review concise specialist results, not pasted logs.

Done requires the protocol's scoped checks, independent real manual QA where applicable and evidence acceptance. Failures create narrow developer regression/fix tasks; QA and the manager do not patch production. Preserve unrelated user edits, including existing configuration/skill changes. No automatic deployment, push or application execution follows this documentation update.
