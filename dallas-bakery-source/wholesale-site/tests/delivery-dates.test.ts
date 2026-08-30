import assert from "node:assert/strict";
import test from "node:test";

import {
  addBusinessDays,
  deliveryWindowFor,
  formatDeliveryDate,
  isBusinessDay,
  nextBusinessDay,
  shipDateFor,
  validateRequestedDeliveryDate,
  DELIVERY_HORIZON_BUSINESS_DAYS,
  MAX_TRANSIT_BUSINESS_DAYS,
  MIN_TRANSIT_BUSINESS_DAYS,
} from "../app/delivery-dates.ts";

// Central time. 2026-09-14 is a Monday, 2026-09-19 a Saturday.
const MONDAY_MORNING = new Date("2026-09-14T15:00:00Z"); // 10am CDT
const MONDAY_AFTERNOON = new Date("2026-09-14T20:00:00Z"); // 3pm CDT
const FRIDAY_AFTERNOON = new Date("2026-09-18T20:00:00Z"); // 3pm CDT
const SATURDAY = new Date("2026-09-19T15:00:00Z");

test("weekends are not business days", () => {
  assert.equal(isBusinessDay("2026-09-14"), true); // Monday
  assert.equal(isBusinessDay("2026-09-18"), true); // Friday
  assert.equal(isBusinessDay("2026-09-19"), false); // Saturday
  assert.equal(isBusinessDay("2026-09-20"), false); // Sunday
});

test("the next business day skips the weekend", () => {
  assert.equal(nextBusinessDay("2026-09-17"), "2026-09-18"); // Thu -> Fri
  assert.equal(nextBusinessDay("2026-09-18"), "2026-09-21"); // Fri -> Mon
  assert.equal(nextBusinessDay("2026-09-19"), "2026-09-21"); // Sat -> Mon
  assert.equal(nextBusinessDay("2026-09-20"), "2026-09-21"); // Sun -> Mon
});

test("adding business days never lands on a weekend", () => {
  assert.equal(addBusinessDays("2026-09-14", 5), "2026-09-21");
  for (let days = 1; days <= 30; days += 1) {
    assert.equal(isBusinessDay(addBusinessDays("2026-09-14", days)), true);
  }
});

test("an order before the cutoff ships the same day", () => {
  assert.equal(shipDateFor(MONDAY_MORNING), "2026-09-14");
});

test("an order after the cutoff ships the next business day", () => {
  assert.equal(shipDateFor(MONDAY_AFTERNOON), "2026-09-15");
});

test("a Friday afternoon order ships Monday, not Saturday", () => {
  assert.equal(shipDateFor(FRIDAY_AFTERNOON), "2026-09-21");
});

test("a weekend order ships Monday", () => {
  assert.equal(shipDateFor(SATURDAY), "2026-09-21");
});

test("the delivery window starts at the earliest date a box can arrive", () => {
  const window = deliveryWindowFor(MONDAY_MORNING);
  assert.equal(window.shipDate, "2026-09-14");
  assert.equal(window.earliest, addBusinessDays("2026-09-14", MIN_TRANSIT_BUSINESS_DAYS));
  assert.equal(window.latest, addBusinessDays("2026-09-14", MAX_TRANSIT_BUSINESS_DAYS));
  assert.equal(window.options[0], window.earliest);
  assert.equal(window.options.length, DELIVERY_HORIZON_BUSINESS_DAYS);
  // Every offered date is a business day, in ascending order.
  window.options.forEach((option, index) => {
    assert.equal(isBusinessDay(option), true);
    if (index > 0) assert.ok(option > window.options[index - 1]!);
  });
});

test("no date is offered before the bread could physically arrive", () => {
  const window = deliveryWindowFor(MONDAY_MORNING);
  assert.ok(window.earliest > window.shipDate);
  assert.equal(validateRequestedDeliveryDate(window.shipDate, MONDAY_MORNING) !== null, true);
});

test("skipping the delivery date is always allowed", () => {
  assert.equal(validateRequestedDeliveryDate("", MONDAY_MORNING), null);
  assert.equal(validateRequestedDeliveryDate("   ", MONDAY_MORNING), null);
});

test("a date inside the window is accepted", () => {
  const window = deliveryWindowFor(MONDAY_MORNING);
  assert.equal(validateRequestedDeliveryDate(window.earliest, MONDAY_MORNING), null);
  assert.equal(validateRequestedDeliveryDate(window.latest, MONDAY_MORNING), null);
});

test("a weekend, a past date, and a far-future date are all refused", () => {
  assert.match(String(validateRequestedDeliveryDate("2026-09-19", MONDAY_MORNING)), /business days/);
  assert.match(String(validateRequestedDeliveryDate("2026-09-14", MONDAY_MORNING)), /earliest/);
  assert.match(String(validateRequestedDeliveryDate("2027-06-01", MONDAY_MORNING)), /too far ahead/);
});

test("malformed dates are refused rather than parsed loosely", () => {
  for (const bad of ["tomorrow", "09/22/2026", "2026-9-22", "2026-09-22T00:00:00Z"]) {
    assert.match(String(validateRequestedDeliveryDate(bad, MONDAY_MORNING)), /Pick a delivery date/);
  }
});

test("delivery dates read as a buyer expects", () => {
  assert.equal(formatDeliveryDate("2026-09-15"), "Tue, Sep 15");
  assert.equal(formatDeliveryDate(""), "");
  assert.equal(formatDeliveryDate("not-a-date"), "");
});
