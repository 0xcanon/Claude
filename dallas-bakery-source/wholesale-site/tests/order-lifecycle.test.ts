import assert from "node:assert/strict";
import test from "node:test";

import {
  assessRefund,
  buyerStage,
  canCorrectOrder,
  canRequestCancellation,
  canTransition,
  hasLeftTheBakery,
  isKnownReason,
  isTerminal,
  RESOLUTION_REASONS,
  type OrderStage,
} from "../app/order-status.ts";

const ALL: OrderStage[] = ["paid", "held", "labeled", "shipped", "delivered", "cancelled", "refunded"];

test("every stage has buyer-facing wording", () => {
  for (const stage of ALL) {
    const shown = buyerStage(stage);
    assert.equal(shown.key, stage);
    assert.ok(shown.label.length > 0, `${stage} has no label`);
    assert.ok(shown.detail.length > 0, `${stage} has no detail`);
    assert.ok([1, 2, 3].includes(shown.step));
  }
  // An unknown status must never crash a buyer's order list.
  assert.equal(buyerStage("nonsense").key, "paid");
});

test("a settled order cannot move again", () => {
  for (const stage of ["cancelled", "refunded"] as OrderStage[]) {
    assert.equal(isTerminal(stage), true);
    for (const target of ALL) {
      assert.equal(canTransition(stage, target), false, `${stage} -> ${target} should be refused`);
    }
  }
});

test("an order can be held and released without losing its place", () => {
  assert.equal(canTransition("paid", "held"), true);
  assert.equal(canTransition("held", "paid"), true);
  assert.equal(canTransition("held", "labeled"), true);
});

test("a shipped order can never be cancelled — only refunded", () => {
  assert.equal(canTransition("shipped", "cancelled"), false);
  assert.equal(canTransition("delivered", "cancelled"), false);
  assert.equal(canTransition("shipped", "refunded"), true);
  assert.equal(canTransition("shipped", "delivered"), true);
});

test("an order that has left the bakery can no longer be corrected", () => {
  assert.equal(canCorrectOrder("paid"), true);
  assert.equal(canCorrectOrder("held"), true);
  // The address is printed on the label by now.
  assert.equal(canCorrectOrder("labeled"), false);
  assert.equal(canCorrectOrder("shipped"), false);
  assert.equal(hasLeftTheBakery("shipped"), true);
  assert.equal(hasLeftTheBakery("delivered"), true);
  assert.equal(hasLeftTheBakery("labeled"), false);
});

test("a buyer can ask to cancel until the label is bought, and only once", () => {
  assert.equal(canRequestCancellation("paid", null), true);
  assert.equal(canRequestCancellation("held", null), true);
  assert.equal(canRequestCancellation("labeled", null), false);
  assert.equal(canRequestCancellation("shipped", null), false);
  // Asking twice does nothing.
  assert.equal(canRequestCancellation("paid", "2026-09-01 10:00:00"), false);
});

const cardOrder = { status: "shipped", totalCents: 20_000, refundedCents: 0, paymentTerms: "card" };

test("a refund can never exceed what is left on the order", () => {
  const full = assessRefund(cardOrder, 20_000);
  assert.equal(full.ok, true);
  if (full.ok) {
    assert.equal(full.amountCents, 20_000);
    assert.equal(full.leavesFullyRefunded, true);
  }

  const over = assessRefund(cardOrder, 20_001);
  assert.equal(over.ok, false);
  if (!over.ok) assert.match(over.error, /more than is left/);
});

test("partial refunds add up and stop at the total", () => {
  const first = assessRefund(cardOrder, 5_000);
  assert.equal(first.ok, true);
  if (first.ok) {
    assert.equal(first.kind, "partial");
    assert.equal(first.leavesFullyRefunded, false);
  }

  // $50 already back; $150 remains.
  const partly = { ...cardOrder, refundedCents: 5_000 };
  assert.equal(assessRefund(partly, 15_000).ok, true);
  const tooMuch = assessRefund(partly, 15_001);
  assert.equal(tooMuch.ok, false);

  // The last cent closes it out.
  const last = assessRefund(partly, 15_000);
  if (last.ok) assert.equal(last.leavesFullyRefunded, true);
});

test("an order already fully refunded cannot be refunded again", () => {
  const done = { ...cardOrder, refundedCents: 20_000 };
  const again = assessRefund(done, 1);
  assert.equal(again.ok, false);
  if (!again.ok) assert.match(again.error, /already been refunded in full/);
});

test("an invoiced order is cancelled, not refunded — nothing was charged", () => {
  const account = { status: "paid", totalCents: 20_000, refundedCents: 0, paymentTerms: "account" };
  const attempt = assessRefund(account, 20_000);
  assert.equal(attempt.ok, false);
  if (!attempt.ok) assert.match(attempt.error, /Cancel it to release the credit/);
});

test("a refund amount must be a real positive amount", () => {
  for (const bad of [0, -100, 12.5, Number.NaN]) {
    const attempt = assessRefund(cardOrder, bad);
    assert.equal(attempt.ok, false, `${bad} should be refused`);
  }
});

test("resolution reasons are a fixed list the owner picks from", () => {
  assert.ok(RESOLUTION_REASONS.length >= 5);
  assert.equal(isKnownReason("Short shipment"), true);
  assert.equal(isKnownReason("  Damaged in transit  "), true);
  assert.equal(isKnownReason("whatever I feel like"), false);
  assert.equal(isKnownReason(""), false);
});
