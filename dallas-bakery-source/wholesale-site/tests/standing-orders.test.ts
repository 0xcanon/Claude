import assert from "node:assert/strict";
import test from "node:test";

import {
  WEEKDAY_NAMES,
  centralDateString,
  centralWeekday,
  isDueToday,
} from "../app/standing-schedule.ts";

// 2026-08-25T17:00:00Z is a Tuesday, noon in Central (CDT, UTC-5).
const TUESDAY_NOON_CT = new Date("2026-08-25T17:00:00Z");
// 03:00Z the same calendar date is still MONDAY 10pm in Central.
const LATE_MONDAY_CT = new Date("2026-08-25T03:00:00Z");

test("weekdays and dates are evaluated in Central time, not UTC", () => {
  assert.equal(centralWeekday(TUESDAY_NOON_CT), 2);
  assert.equal(WEEKDAY_NAMES[2], "Tuesday");
  assert.equal(centralDateString(TUESDAY_NOON_CT), "2026-08-25");
  // The same UTC date is still Monday the 24th at the bakery.
  assert.equal(centralWeekday(LATE_MONDAY_CT), 1);
  assert.equal(centralDateString(LATE_MONDAY_CT), "2026-08-24");
});

test("a standing order is due only on its own weekday", () => {
  const tuesdayOrder = { active: true, weekday: 2, lastRunDate: "" };
  assert.equal(isDueToday(tuesdayOrder, TUESDAY_NOON_CT), true);
  assert.equal(isDueToday({ ...tuesdayOrder, weekday: 3 }, TUESDAY_NOON_CT), false);
  assert.equal(isDueToday(tuesdayOrder, LATE_MONDAY_CT), false);
});

test("a run today is never repeated today, and never blocks next week", () => {
  const order = { active: true, weekday: 2, lastRunDate: "2026-08-25" };
  assert.equal(isDueToday(order, TUESDAY_NOON_CT), false);
  // Next Tuesday, the stamp is a week old and the order is due again.
  assert.equal(isDueToday(order, new Date("2026-09-01T17:00:00Z")), true);
});

test("a paused order is never due", () => {
  assert.equal(isDueToday({ active: false, weekday: 2, lastRunDate: "" }, TUESDAY_NOON_CT), false);
});
