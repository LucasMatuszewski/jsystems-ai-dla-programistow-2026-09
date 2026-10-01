# Verification Ownership Index

Load only for an audit/final Q08, or selected criterion rows. Requirement text remains in [PRD §6](../PRD.md#6-acceptance-criteria) and the referenced ADR criteria; this is assignment coverage, not a passing report.

U=unit, C=component, I=integration (only external LLM HTTP replaced), E=real no-mock E2E, M=independent manual QA, Build=lint/typecheck/build/boundary, STATIC=document/config checks. Test names below are selectors under the task's exact owned directory. Q08 records actual runs/commits/evidence paths; source identity/full-context proof is integration, not exposed product prompts.

## PRD

| ID | Owning tasks | Layers | Principal test/reference |
| --- | --- | --- | --- |
| AC-01 | C01,F02,Q03 | U/C, E, M | form-validation.spec.ts |
| AC-02 | C01,F02,Q03 | U/C, E | form-validation.spec.ts |
| AC-03 | C01,F02,Q03 | U/C, E, M | form-validation.spec.ts |
| AC-04 | C01,B06,F02,Q03 | U/C, I, E | analysis-route.test.ts; form-validation.spec.ts |
| AC-05 | C01,B06,F02,Q03 | U/C, I, E | analysis-route.test.ts; form-validation.spec.ts |
| AC-06 | C01,B06,F02,Q03 | U/C, I, E | analysis-route.test.ts; form-validation.spec.ts |
| AC-07 | C01,B06,F02,Q03 | U/C, I, E | analysis-route.test.ts; form-validation.spec.ts |
| AC-08 | C01,F02,Q03 | U/C, E | form-validation.spec.ts |
| AC-09 | C01,F02,Q03 | U/C, E | form-validation.spec.ts |
| AC-10 | C01,B06,F02,Q03 | U/C, I, E | analysis-route.test.ts; form-validation.spec.ts |
| AC-11 | C01,B06,F02,Q03 | U/C, I, E | analysis-route.test.ts; form-validation.spec.ts |
| AC-12 | C01,B06,F02,Q03 | U/C, I, E | analysis-route.test.ts; form-validation.spec.ts |
| AC-13 | C01,B06,F02,Q03 | U/C, I, E | analysis-route.test.ts; form-validation.spec.ts |
| AC-14 | F02,Q03 | C, E, M | form-validation.spec.ts |
| AC-15 | C02,B04,B05,F04,Q03 | U/C, I, E | image-preparation.spec.ts |
| AC-16 | B04,B05,F04,Q03 | U/C, I, E | image-preparation.spec.ts |
| AC-17 | F04,Q03 | C, E, M | image-preparation.spec.ts |
| AC-18 | F04,Q03 | C, E, M | image-preparation.spec.ts |
| AC-19 | B04,B05,B06,Q04 | I, E, M | initial-assessment.spec.ts |
| AC-20 | B04,B05,B09,F04,F05 | I, C, M | image-route.test.ts; picker tests |
| AC-21 | B02,B06,Q04 | I, E, M | analysis-route.test.ts; initial-assessment.spec.ts |
| AC-22 | B02,B06,Q04 | I, E, M | analysis-route.test.ts; initial-assessment.spec.ts |
| AC-23 | C02,B02,B06,Q04 | I, E, M | assessment-quality.spec.ts |
| AC-24 | F04,F05,F06,Q04 | C, E, M | initial-assessment.spec.ts |
| AC-25 | F05,F06,Q04 | C, E | initial-assessment.spec.ts |
| AC-26 | B01,B02,B07,B08,Q04 | I, E | policy-resources.test.ts; prompt-context.test.ts; initial-assessment.spec.ts |
| AC-27 | B01,B02,B07,B08,Q04 | I, E | policy-resources.test.ts; prompt-context.test.ts; initial-assessment.spec.ts |
| AC-28 | C02,C03,B07,F06,Q04 | U/C, I, E, M | initial-assessment.spec.ts |
| AC-29 | C02,B07,F06,Q04 | U/C, I, E | initial-assessment.spec.ts |
| AC-30 | C02,B07,F06,Q04 | U/C, I, E, M | assessment-quality.spec.ts |
| AC-31 | B02,B07,Q04 | I, E, M | assessment-quality.spec.ts |
| AC-32 | B02,B06,B07,Q04 | I, E, M | assessment-quality.spec.ts |
| AC-33 | B02,B07,Q04 | I, E, M | assessment-quality.spec.ts |
| AC-34 | B02,B07,Q04 | I, E, M | assessment-quality.spec.ts |
| AC-35 | C02,B02,B07,Q04 | I, E, M | decision-route.test.ts; assessment-quality.spec.ts |
| AC-36 | B02,B06,B07,Q04 | I, E, M | assessment-quality.spec.ts |
| AC-37 | B01,B07,B09,F05 | I, C, M | policy-resources.test.ts; decision-route.test.ts; controller tests |
| AC-38 | C03,B07,B08,F06,F07,Q05 | U/C, I, E, M | chat-streaming.spec.ts |
| AC-39 | C03,B08,F07,Q05 | U/C, I, E | chat-streaming.spec.ts |
| AC-40 | C03,B08,F07,Q05 | U/C, I, E | chat-streaming.spec.ts |
| AC-41 | B02,B08,F07,Q05 | I, E, M | chat-route.test.ts; chat-streaming.spec.ts |
| AC-42 | B02,B08,Q05 | I, E, M | chat-streaming.spec.ts |
| AC-43 | F07,F08,Q05 | C, E, M | chat-streaming.spec.ts; chat-retry.spec.ts |
| AC-44 | B02,B08,Q05 | I, E, M | chat-streaming.spec.ts |
| AC-45 | B02,B08,Q05 | I, E, M | chat-streaming.spec.ts |
| AC-46 | B02,B08,Q05 | I, E, M | chat-streaming.spec.ts |
| AC-47 | B09,F08,Q05 | I, C, E, M | chat-retry.spec.ts |
| AC-48 | B08,F08,Q05 | I, C, E, M | chat-retry.spec.ts |
| AC-49 | C03,F03,F09,Q06 | U/C, E, M | session-continuity.spec.ts |
| AC-50 | F06,F09,Q06 | C, E, M | session-continuity.spec.ts |
| AC-51 | B09,F08,F09,Q05,Q06 | I, C, E, M | chat-retry.spec.ts; session-continuity.spec.ts |
| AC-52 | F03,F09,Q06 | C, M | session-adapter.test.ts; storage-notice.test.tsx |
| AC-53 | F09,Q06 | C, E, M | new-case.spec.ts |
| AC-54 | F09,Q06 | C, E, M | new-case.spec.ts |
| AC-55 | F01–F10,Q03–Q08 | C, E, M | all relevant browser specs |
| AC-56 | F01,F06,F10,Q08 | C, E, M | release-acceptance.spec.ts |
| AC-57 | F02,F04,F07,F09,F10,Q08 | C, E, M | release-acceptance.spec.ts |
| AC-58 | F01,F06,F07,F10,Q08 | C, E, M | release-acceptance.spec.ts |

## ADR

| ID | Owning tasks | Layers | Canonical criterion selector |
| --- | --- | --- | --- |
| TAC-000-01 | B03,B06,B07,B08,Q04,Q05 | I,E | [ADR-000](../ADR/000-main-architecture.md#technical-acceptance-criteria) |
| TAC-000-02 | S01,S02,Q08 | Build,M | [ADR-000](../ADR/000-main-architecture.md#technical-acceptance-criteria) |
| TAC-000-03 | B03,B08,F07,Q08 | Build,I,E,M | [ADR-000](../ADR/000-main-architecture.md#technical-acceptance-criteria) |
| TAC-000-04 | Q04,Q05,Q07,Q08 | E | [ADR-000](../ADR/000-main-architecture.md#technical-acceptance-criteria) |
| TAC-000-05 | Q08 | STATIC | [ADR-000](../ADR/000-main-architecture.md#technical-acceptance-criteria) |
| TAC-001-01 | S01 | STATIC,Build | [ADR-001](../ADR/001-project-initialization.md#8-testing-strategy) |
| TAC-001-02 | S01,S02,Q08 | STATIC,Build | [ADR-001](../ADR/001-project-initialization.md#8-testing-strategy) |
| TAC-001-03 | S02,B03,Q01,Q08 | Build,E,M | [ADR-001](../ADR/001-project-initialization.md#8-testing-strategy) |
| TAC-001-04 | B01,B02,Q08 | I,Build | [ADR-001](../ADR/001-project-initialization.md#8-testing-strategy) |
| TAC-001-05 | S01,S02,S03,Q08 | STATIC,Build | [ADR-001](../ADR/001-project-initialization.md#8-testing-strategy) |
| TAC-002-01 | B04,B05,B06,Q04 | I,E | [ADR-002](../ADR/002-backend-ai-workflow.md#8-testing-strategy) |
| TAC-002-02 | B03,B06,B08,Q04 | I,E | [ADR-002](../ADR/002-backend-ai-workflow.md#8-testing-strategy) |
| TAC-002-03 | C02,B07,F06,Q04 | I,C,E | [ADR-002](../ADR/002-backend-ai-workflow.md#8-testing-strategy) |
| TAC-002-04 | B01,B02,B07,B08,Q04,Q05 | I,E | [ADR-002](../ADR/002-backend-ai-workflow.md#8-testing-strategy) |
| TAC-002-05 | C03,B08,F07,Q05 | I,C,E | [ADR-002](../ADR/002-backend-ai-workflow.md#8-testing-strategy) |
| TAC-002-06 | B03,B09,F05,F08,Q05 | U,I,E | [ADR-002](../ADR/002-backend-ai-workflow.md#8-testing-strategy) |
| TAC-002-07 | B08,B09,F08,Q05 | I,C,E | [ADR-002](../ADR/002-backend-ai-workflow.md#8-testing-strategy) |
| TAC-002-08 | B02,B07,B08,B09,F06,Q08 | I,E,M | [ADR-002](../ADR/002-backend-ai-workflow.md#8-testing-strategy) |
| TAC-003-01 | C03,F07,F09,Q06 | C,E | [ADR-003](../ADR/003-frontend-session.md#8-testing-strategy) |
| TAC-003-02 | C03,F06,F09,Q06 | U,C,E | [ADR-003](../ADR/003-frontend-session.md#8-testing-strategy) |
| TAC-003-03 | F08,Q05 | C,E | [ADR-003](../ADR/003-frontend-session.md#8-testing-strategy) |
| TAC-003-04 | C03,F07,Q05 | U,C,E | [ADR-003](../ADR/003-frontend-session.md#8-testing-strategy) |
| TAC-003-05 | F03,F09,Q06 | C,M | [ADR-003](../ADR/003-frontend-session.md#8-testing-strategy) |
| TAC-003-06 | S03,F07,Q05,Q08 | C,E,M | [ADR-003](../ADR/003-frontend-session.md#8-testing-strategy) |
| TAC-003-07 | F01,F10,Q08 | E,M | [ADR-003](../ADR/003-frontend-session.md#8-testing-strategy) |
| TAC-004-01 | All developer feature/bug packages,Q08 | U,C,I,E | [ADR-004](../ADR/004-verification.md#technical-acceptance-criteria) |
| TAC-004-02 | S02,BE integration packages,Q08 | I,STATIC | [ADR-004](../ADR/004-verification.md#technical-acceptance-criteria) |
| TAC-004-03 | Q01,Q03–Q08 | E,STATIC | [ADR-004](../ADR/004-verification.md#technical-acceptance-criteria) |
| TAC-004-04 | Q01,Q04,Q08 | E | [ADR-004](../ADR/004-verification.md#technical-acceptance-criteria) |
| TAC-004-05 | F09,Q06 | C,E | [ADR-004](../ADR/004-verification.md#technical-acceptance-criteria) |
| TAC-004-06 | B09,Q07 | I,E | [ADR-004](../ADR/004-verification.md#technical-acceptance-criteria) |
| TAC-004-07 | Q08 | STATIC,E,M | [ADR-004](../ADR/004-verification.md#technical-acceptance-criteria) |
| TAC-004-08 | All runtime packages,Q08 | M | [ADR-004](../ADR/004-verification.md#technical-acceptance-criteria) |
| TAC-004-09 | All packages,Q08 | STATIC | [ADR-004](../ADR/004-verification.md#technical-acceptance-criteria) |
