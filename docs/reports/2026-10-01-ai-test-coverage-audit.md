# AI test coverage and image provenance audit

Date: 2026-10-01  
Purpose: preserve the testing clarification from the side conversation for future reference and discussion with course participants.

## Main finding and correction

The earlier statement **“15 E2E tests passed without mocks”** described browser tests of the form and image-preparation subsystem. Those 15 tests did **not** invoke the LLM and therefore did **not** prove that the complete AI workflow worked end to end.

For this project's successful AI-flow E2E tests, “without mocks” must include actual application calls to OpenRouter. The absence of mocks alone is insufficient evidence if the tested journey stops before the model is invoked. Negative input tests can appropriately stop before the LLM, but their success cannot establish the successful AI path.

The model was exercised manually through real application endpoints. However, endpoint-level manual validation must be distinguished from completing the entire journey through the intended product UI. The evidence reviewed in this audit does not establish a passing full UI-to-OpenRouter-to-chat workflow.

## Scope and timing of this audit

This report is a snapshot of the evidence inspected during a side conversation. The main implementation thread could continue concurrently; this document is not a live completion dashboard.

During the side conversation, the agent inspected existing reports, test sources, fixture metadata, generation proofs, and failure artifacts. It also visually inspected the three original photographs and recomputed their SHA-256 hashes, which matched the provenance manifest. It did not run new browser journeys or generate new LLM responses during this audit, and it did not contact or delegate to subagents. The report requested by the user is the local documentation change resulting from this conversation.

## Images: source, content, and actual use

The user had not supplied photographs of the real devices. The project used public demonstration photographs from Wikimedia Commons. These are real photographs, not AI-generated images. They are not evidence about the user's actual devices.

| Fixture | Visible content | Author / license | Confirmed use in the reviewed evidence |
|---|---|---|---|
| `intact-smartphone.jpg` | Front of a Samsung Galaxy A13 with the screen off; fingerprints, reflections, and minor wear, without visible major cracked glass | Saimmx / CC0-1.0 | Passing form/upload browser tests and manual live-LLM analysis/decision tests |
| `damaged-smartphone.jpg` | Front of an iPhone with extensively cracked glass | Ed6767 / CC BY-SA 4.0 | Included in the full-assessment E2E scenarios; no confirmed passing complete live-LLM journey in this audit |
| `ambiguous-smartphone.jpg` | Rear housing and cameras of a Samsung Galaxy A13; the front screen is not visible | Saimmx / CC0-1.0 | Included in insufficient-evidence assessment scenarios; no confirmed passing complete live-LLM journey in this audit |

Original source pages:

- [Samsung Galaxy A13 front](https://commons.wikimedia.org/wiki/File:20251110_180850_Samsung_Galaxy_A13_Front.jpg).
- [Cracked iPhone](https://commons.wikimedia.org/wiki/File:Cracked_iPhone.jpg).
- [Samsung Galaxy A13 rear](https://commons.wikimedia.org/wiki/File:20251110_180926_Samsung_Galaxy_A13_Back.jpg).

The original photographs were stored unchanged under deterministic fixture filenames. Full attribution, license URLs, dimensions, byte counts, and hashes are recorded in [the provenance manifest](../../app/tests/fixtures/provenance.json). The cracked iPhone photograph retains its CC BY-SA 4.0 licensing requirements. A candidate depicting scratched protective film was rejected after inspection because it was a drawing rather than a real photograph.

Technical fixtures also exist:

- `transparent.png`: a resized version of the real Samsung front photograph with a transparent border; used for replacement/PNG handling.
- `exif-rotated.jpg`: a rotated and resized derivative with EXIF orientation metadata.
- `valid.webp`: a still WebP derivative of the real photograph.
- `animated.webp`: two photograph-derived frames; used to test rejection of animated input.
- `oversize.jpg`: the real JPEG with deterministic trailing padding to 10,000,001 bytes; used for the upload-size boundary.
- `corrupt.bin`: deliberately invalid bytes; used to test decoding failure.
- `pixel-limit.png`: a generated technical image with 64,008,000 pixels; a pixel-limit fixture, not a device photograph.

Fixture availability does not mean every fixture was used in a passing test or sent to the LLM. In particular, the confirmed manual live-model cases used the Samsung **front** photograph for both complaint and return scenarios. The backend sent its prepared, normalized image to the model.

An apparently intact photograph does not prove functional health, safety, completeness, or suitability for resale as new. Statements such as “the phone does not turn on” came from demonstration employee-form inputs, not independent verification of the photographed device. Real device photographs and verified case facts remain additional representative validation work.

## Automated tests: what the 15 passing tests covered

The Q03 result comprised **8 form tests and 7 image tests**. They used real Chrome, the running application, real image preparation, and native browser storage. There were no route/provider/storage substitutions in these browser flows. Nevertheless, there were **no LLM calls**.

Covered behavior included:

- Form fields, scenario-specific validation, dates, remedies, Polish validation text, and focus behavior.
- Missing-photo validation and focus on the image input.
- Native JPEG selection, actual `POST /api/images/prepare`, real image decoding/normalization, preview, and saved prepared-image data.
- PNG replacement and retention of the rest of the form draft.
- Keyboard removal of the image, clearing saved image data, and blocking submission without an image.
- Local rejection of oversized input before an API call.
- Actual backend rejection of corrupt JPEG bytes and animated WebP input.

The tested successful submission reached local form success and remained on the form route. It did not establish model analysis, decision generation, a completed assessment card, navigation to chat, or a follow-up conversation.

The accurate description is **“15 passing browser tests of the form and image-preparation subsystem”**, rather than proof of complete AI E2E acceptance. A required API-key preflight is not evidence that the endpoint was called.

Evidence: [Q03 handoff](../../app/verification-output/Q03-image/run/handoff.md) and [passing browser-test output](../../app/verification-output/Q03-image/run/polish-chooser-live.txt).

## Manual QA: actual application and OpenRouter calls

### B06/F04: image preparation and analysis

The existing manual QA report records a running Next application in Chrome driven through the Playwright CLI. The operator filled native form controls and uploaded `intact-smartphone.jpg` through the native file input. The real preparation endpoint returned a normalized 2048 × 1536 JPEG of 480,195 bytes with a 512 × 384 thumbnail.

The manual checks covered missing-photo errors, PNG replacement, keyboard removal, corrupt-file rejection, genuine localStorage quota exhaustion and recovery, and restoration without another preparation request. Screenshots at 360 and 1440 pixels were inspected against the Allegro reference and design tokens. The final report records the Polish chooser correction and no unexpected browser errors; HTTP 422 errors from deliberately invalid uploads were expected.

For the model checks, actual browser requests to `POST /api/analysis` used the real prepared/form checkpoint. Complaint and return analyses both returned HTTP 200. The observed durations were approximately 12.5 seconds and 4.7 seconds. The official OpenRouter generation proof verifies **two actual analysis generations**. These were distinct scenarios, not automatic retries.

The complete production analysis UI was not available for those checks. A temporary browser DOM view was used to inspect the real response for QA. This demonstrates real endpoint/model behavior, but does not demonstrate the final product UI journey.

Evidence: [manual report and screenshot inventory](../../app/verification-output/b06-f04-manual/report.md) and [verified live-generation proof](../../app/verification-output/B06/run/live-generation-proof-verified.txt).

### B07: analysis and decision endpoints

The inspected evidence records two actual cases, each making an analysis call followed by a decision call: **four verified OpenRouter generations** in total. Native form/photo preparation was followed by browser-originated requests to the real application endpoints. Actual structured responses were reviewed in temporary QA views at desktop and mobile sizes.

The configured model was `openai/gpt-6-luna`. Official generation metadata resolved the canonical model as `openai/gpt-6-luna-20260922`; the official model metadata verified that alias relationship. The proof is based on completed generation metadata, not merely a model catalog entry or the presence of an API key.

Manual inspection found raw English enum terms in Polish explanations. The earlier handoff recorded a prompt correction and a requirement for fresh live-response revalidation. Endpoint success or generation proof alone does not establish final output-quality acceptance. This audit does not certify that later revalidation was completed.

Evidence: [B07 initial live-generation proof](../../app/verification-output/B07/20261001-owned/live-generations-proof-initial.txt).

## Integration tests and their different purpose

The inspected B07 handoff reported 6 owned unit tests and 43 integration tests passing. Integration tests mocked **only the external LLM HTTP boundary**, while exercising the applicable application contracts and internal dependencies. This is permitted by the project's integration-test strategy, but those results are not evidence of real OpenRouter requests and must not be counted as AI E2E validation without mocks.

## Full assessment E2E: not yet proven green

The Q04 evidence reviewed contains four failing full-assessment scenarios:

1. A damaged-device complaint produces a complete preliminary assessment from real analysis and decision.
2. A timely return involving a used device separates withdrawal eligibility from resale condition.
3. An intact-looking photograph does not automatically cause refusal of an employee-reported functional complaint.
4. Material uncertainty in a return requires clarification or employee verification rather than invented eligibility.

The recorded failure was that a valid prepared form did not activate the expected initial-assessment processing region. These failing runs do not establish a successful model workflow. No passing complete UI-to-OpenRouter-to-result/chat sequence was verified in this audit.

Evidence: [Q04 red-run output](../../app/verification-output/Q04/healthy-red.txt). Related screenshots and traces are under `app/verification-output/Q04/red-results/`.

## Progress reported during this conversation

The earlier status answer placed the main work in phase 3 of 6: initial assessment. It reported phases 1–2 completed, B06 image analysis and F04 image picker completed, and Q03 form/image verification committed. B07 decision-backend checks existed, while its manual/final acceptance still required care. F05/F06 assessment UI and Q04 full-flow tests were still in progress. Later chat, continuity, load, and demonstration work remained outstanding.

This was a point-in-time status statement, not a certification of the latest concurrent main-thread state. The audit establishes narrower facts: real image preparation worked in the inspected flows; real analysis and decision calls were made; the 15 passing browser tests omitted the LLM; and complete AI E2E acceptance had not been demonstrated by the reviewed evidence.

## Lessons for course participants

- State the tested boundary explicitly: form/upload, backend endpoint, or complete product workflow.
- Separate “no mocks were used” from “the relevant external service was actually invoked.”
- Distinguish passing automated tests, manual UI checks, real provider calls, and reviewed output quality.
- Record which exact photographs were used successfully; do not confuse the fixture inventory with exercised coverage.
- Preserve failing full-flow results alongside passing subsystem results so that implementation progress is not mistaken for completion.
- Under the repository's workflow, every app-affecting task requires manual QA. This audit does not prove that every historical phase satisfied that requirement.

Before claiming complete AI E2E acceptance, the actual user flow must successfully submit a real photograph, invoke OpenRouter, display the resulting assessment through the intended UI, and complete the applicable chat navigation/message flow, with manual review and screenshots. The existing subsystem results and endpoint proofs are useful evidence, but do not replace that missing acceptance evidence.
