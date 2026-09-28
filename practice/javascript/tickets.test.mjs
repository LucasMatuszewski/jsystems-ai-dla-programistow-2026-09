import test from "node:test";
import assert from "node:assert/strict";
import { summarizeTicket, normalizeTitle, classifyPriority } from "./tickets.mjs";

test("baseline: a ticket has a readable summary", () => {
  assert.equal(summarizeTicket({ id: "T-1", title: "Cannot sign in" }), "T-1: Cannot sign in");
});

test("D1: title whitespace is collapsed", () => {
  assert.equal(normalizeTitle("  Cannot   sign\t in  "), "Cannot sign in");
});

test("D1: a blank title is rejected", () => {
  assert.throws(() => normalizeTitle(" \t "), /title/i);
});

test("D2: blocked tickets are high priority", () => {
  assert.equal(classifyPriority({ blocked: true, severity: 3 }), "high");
});

test("D2: severity one tickets are high priority", () => {
  assert.equal(classifyPriority({ blocked: false, severity: 1 }), "high");
});

test("D2: ordinary tickets remain normal", () => {
  assert.equal(classifyPriority({ blocked: false, severity: 3 }), "normal");
});
