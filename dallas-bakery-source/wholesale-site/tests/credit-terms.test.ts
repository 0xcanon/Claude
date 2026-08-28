import assert from "node:assert/strict";
import test from "node:test";

import {
  assessAccountOrder,
  computeCreditState,
  overLimitMessage,
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

test("account order: rejected over the available credit — points to the open invoices", () => {
  const verdict = assessAccountOrder(computeCreditState(150_000, 100_000), 60_000);
  assert.equal(verdict.ok, false);
  if (!verdict.ok) {
    assert.match(verdict.error, /\$500\.00/);
    // With money outstanding, the way forward is invoice first, card second.
    assert.match(verdict.error, /invoice/i);
    assert.match(verdict.error, /\$1,000\.00/);
    assert.match(verdict.error, /card/i);
  }
});

test("account order: over the limit with nothing outstanding points straight to card", () => {
  const verdict = assessAccountOrder(computeCreditState(150_000, 0), 200_000);
  assert.equal(verdict.ok, false);
  if (!verdict.ok) {
    assert.match(verdict.error, /\$1,500\.00 credit limit/);
    assert.match(verdict.error, /card/i);
    assert.doesNotMatch(verdict.error, /invoice/i);
  }
});

test("the credit line can never go negative: an order equal to available passes, one cent more fails", () => {
  const state = computeCreditState(150_000, 100_000);
  assert.equal(assessAccountOrder(state, 50_000).ok, true);
  assert.equal(assessAccountOrder(state, 50_001).ok, false);
  // And available itself is clamped at zero even when outstanding exceeds
  // the limit (the owner lowered it after orders were placed).
  assert.equal(computeCreditState(50_000, 80_000).availableCents, 0);
  assert.equal(assessAccountOrder(computeCreditState(50_000, 80_000), 1).ok, false);
});

test("over-limit message names the invoice balance only when one exists", () => {
  assert.match(overLimitMessage(computeCreditState(150_000, 40_000)), /invoice balance \(\$400\.00\)/);
  assert.doesNotMatch(overLimitMessage(computeCreditState(150_000, 0)), /invoice/);
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
