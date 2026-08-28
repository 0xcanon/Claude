import assert from "node:assert/strict";
import test from "node:test";

import {
  assessAccountOrder,
  computeCreditState,
  validateCreditLimitCents,
} from "../app/credit-terms.ts";

test("credit state: available is limit minus outstanding", () => {
  const state = computeCreditState(150_000, 40_000);
  assert.equal(state.limitCents, 150_000);
  assert.equal(state.outstandingCents, 40_000);
  assert.equal(state.availableCents, 110_000);
  assert.equal(state.enabled, true);
});

test("credit state: zero limit means card-only", () => {
  const state = computeCreditState(0, 0);
  assert.equal(state.enabled, false);
  assert.equal(state.availableCents, 0);
});

test("credit state: available floors at zero after the owner lowers a limit", () => {
  const state = computeCreditState(50_000, 80_000);
  assert.equal(state.availableCents, 0);
  assert.equal(state.outstandingCents, 80_000);
  assert.equal(state.enabled, true);
});

test("credit state: garbage inputs clamp instead of going negative", () => {
  const state = computeCreditState(Number.NaN, -500);
  assert.equal(state.limitCents, 0);
  assert.equal(state.outstandingCents, 0);
  assert.equal(state.enabled, false);
});

test("account order: fits when at or under available credit", () => {
  const state = computeCreditState(150_000, 40_000);
  assert.deepEqual(assessAccountOrder(state, 110_000), { ok: true });
  assert.deepEqual(assessAccountOrder(state, 7_500), { ok: true });
});

test("account order: rejected over the available credit, with the amount left", () => {
  const verdict = assessAccountOrder(computeCreditState(150_000, 100_000), 60_000);
  assert.equal(verdict.ok, false);
  if (!verdict.ok) assert.match(verdict.error, /\$500\.00/);
});

test("account order: rejected outright without a credit line", () => {
  const verdict = assessAccountOrder(computeCreditState(0, 0), 7_500);
  assert.equal(verdict.ok, false);
  if (!verdict.ok) assert.match(verdict.error, /not set up/i);
});

test("account order: zero or fractional totals never pass", () => {
  const state = computeCreditState(150_000, 0);
  assert.equal(assessAccountOrder(state, 0).ok, false);
  assert.equal(assessAccountOrder(state, 75.5).ok, false);
});

test("credit limit validation: bounds and integers", () => {
  assert.equal(validateCreditLimitCents(0), null);
  assert.equal(validateCreditLimitCents(150_000), null);
  assert.equal(validateCreditLimitCents(25_000_000), null);
  assert.notEqual(validateCreditLimitCents(-1), null);
  assert.notEqual(validateCreditLimitCents(25_000_001), null);
  assert.notEqual(validateCreditLimitCents(12.5), null);
});
