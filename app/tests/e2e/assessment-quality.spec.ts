import { test, expect } from "@playwright/test";
import { assessActualCase } from "./helpers/assessment-observations";

test.use({ locale: "pl-PL", timezoneId: "Europe/Warsaw", actionTimeout: 10_000 });
test.setTimeout(600_000);

test("intact photo cannot automatically refuse an employee-reported functional complaint", async ({ page }, info) => {
  const { decision } = await assessActualCase(page, info, "functional-complaint");
  expect(decision.outcome).not.toBe("preliminary_refusal");
  expect(decision.limitations.length + decision.questions.length).toBeGreaterThan(0);
});

test("material unknown return requires clarification or employee verification instead of invented eligibility", async ({ page }, info) => {
  const { analysis, decision } = await assessActualCase(page, info, "unknown-return");
  expect(analysis.possibleCauses).toHaveLength(0);
  expect(["additional_information_required", "human_verification_required"]).toContain(decision.outcome);
  if (decision.outcome === "additional_information_required") expect(decision.questions.length).toBeGreaterThan(0);
  else expect(decision.nextSteps.length).toBeGreaterThan(0);
  // Exact grounding, questions and factual limits require independent human review of the actual card.
});
