Use the installed `write-prd` skill to create `docs/PRD.md` for an educational MVP called **Hardware Service Decision Copilot**. This is a synthetic course case, not a real company's policy or customer system. Follow the skill's interview and PRD workflow. Use the product facts below as the starting brief; resolve missing behavior with the learner before writing. Do not invent business limits or technical architecture.

## Problem and users

The support team receives electronics return and complaint requests through email. The initial report often lacks a product category, purchase date, useful description, or image. Agents switch between a policy document and the message thread and spend time requesting missing information. The MVP should guide a customer through an intake form and give the support employee an **advisory recommendation** with a reason and next steps. A person makes the final decision.

Primary users are (1) a customer submitting a case on a laptop or phone, (2) a support employee checking the recommendation and continuing a conversation, and (3) a support lead who needs to inspect whether recommendations follow the written policy. Describe their distinct goals and the main flow from first form field through human review. Include alternative flows for unclear images, missing purchase data, service unavailable, and a customer adding new information after the first recommendation.

## Intake and behavior

- The form asks whether this is a return or complaint, equipment category, product name/model, purchase date, description, and at least one image. A complaint needs a description. The selected path determines which synthetic policy document is relevant.
- The system validates the form before submission and shows a clear, field-specific error. It must not silently discard an uploaded image or a typed description.
- After submission, the user sees a progress state. Image analysis describes visible condition and uncertainty. A second step compares the form, image description, and applicable synthetic policy. A low-confidence or contradictory case is marked for human review.
- The result shows recommendation category, concise reason, evidence used, uncertainty, and next steps. It does not present the recommendation as a final legal decision.
- The user can ask follow-up questions in chat. The conversation keeps the submitted form and recommendation as context. New facts may trigger a fresh review but must not rewrite the original record without a visible trace.
- A support employee can inspect what information led to the recommendation. The MVP must not expose raw model reasoning or secrets.

Use only synthetic examples in the document. Propose at least four demo cases: an eligible return, a damaged complaint, an ambiguous image requiring a person, and a failed external service. For each, state the expected visible outcome and a measurable, numbered acceptance criterion (AC-1.1, AC-1.2, etc.). Each criterion must be precise enough to produce a test that can fail before implementation. Include a simple traceability table mapping AC -> proposed test -> evidence, while leaving implementation choices for the ADR. Make the out-of-scope boundary explicit: no production customer database, payment/refund processing, final automatic decision, account management, or external ticketing integration.

Output a concrete PRD that a developer and tester can use. Keep framework, SDK, database schema and implementation choices for the later ADR. Show assumptions separately and ask the learner to settle the questions required by the skill before treating the document as final.
