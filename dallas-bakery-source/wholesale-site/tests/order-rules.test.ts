import assert from "node:assert/strict";
import test from "node:test";

import {
  MINIMUM_CASES,
  cutoffState,
  isDeliverableState,
  orderRules,
  orderRulesLines,
} from "../app/order-rules.ts";

test("delivery area covers the lower 48 and excludes the rest", () => {
  assert.ok(isDeliverableState("TX"));
  assert.ok(isDeliverableState("ny"));
  assert.ok(isDeliverableState(" ca "));
  assert.equal(isDeliverableState("AK"), false);
  assert.equal(isDeliverableState("HI"), false);
  assert.equal(isDeliverableState("PR"), false);
  assert.equal(isDeliverableState(""), false);
});

test("noon Central is the cutoff, evaluated in bakery time not UTC", () => {
  // 16:00 UTC on a Wednesday in August is 11:00 Central — still before noon.
  const beforeCutoff = cutoffState(new Date("2026-08-26T16:00:00Z"));
  assert.equal(beforeCutoff.shipsToday, true);

  // 18:00 UTC the same day is 13:00 Central — past the cutoff.
  const afterCutoff = cutoffState(new Date("2026-08-26T18:00:00Z"));
  assert.equal(afterCutoff.shipsToday, false);
  assert.match(afterCutoff.label, /next business day/);
});

test("weekend and Friday afternoon orders point at Monday", () => {
  const saturday = cutoffState(new Date("2026-08-29T16:00:00Z"));
  assert.equal(saturday.shipsToday, false);
  assert.match(saturday.label, /Monday/);

  const fridayAfternoon = cutoffState(new Date("2026-08-28T18:00:00Z"));
  assert.equal(fridayAfternoon.shipsToday, false);
  assert.match(fridayAfternoon.label, /Monday/);
});

test("rules are stated once and reused verbatim", () => {
  const rules = orderRules();
  assert.equal(rules.minimumCases, MINIMUM_CASES);
  assert.equal(rules.minimumLabel, "1 case");
  assert.equal(rules.cutoffLabel, "12:00 PM Central");
  assert.equal(rules.deliveryAreaLabel, "Contiguous United States");

  const lines = orderRulesLines();
  assert.equal(lines.length, 5);
  assert.ok(lines[0].includes("12:00 PM Central"));
  assert.ok(lines[1].includes("1 case"));
  assert.ok(lines[2].includes("UPS Ground"));
  assert.ok(lines[4].includes("7 days"));
});
