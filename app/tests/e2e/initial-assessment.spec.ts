import { test, expect } from "@playwright/test";
import { assessActualCase } from "./helpers/assessment-observations";

test.use({ locale: "pl-PL", timezoneId: "Europe/Warsaw", actionTimeout: 10_000 });
test.setTimeout(600_000);

test("damaged complaint produces one complete preliminary card from real analysis and decision", async ({ page }, info) => {
  await assessActualCase(page, info, "damaged-complaint");
});

test("complete timely used return separates withdrawal eligibility from resale condition", async ({ page }, info) => {
  const { decision } = await assessActualCase(page, info, "used-return");
  // Ordinary use alone is not a refusal. Clarification or human verification may still be justified.
  expect(decision.outcome).not.toBe("preliminary_refusal");
});
