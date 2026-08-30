import assert from "node:assert/strict";
import test from "node:test";

import {
  planForEvent,
  reconcileCapture,
  shouldActOnExistingOrder,
  signatureIsFresh,
  SIGNATURE_TOLERANCE_SECONDS,
} from "../app/webhook-intake.ts";

/* ------------------------------------------------- duplicate deliveries -- */

test("the same wholesale intent twice yields the same dedupe key", () => {
  const event = {
    type: "payment_intent.succeeded",
    data: { object: { id: "pi_123", metadata: { source: "wholesale-order", channel: "wholesale" } } },
  };
  const first = planForEvent(event);
  const second = planForEvent(event);
  assert.equal(first.kind, "record-intent");
  assert.equal(second.kind, "record-intent");
  // Same key means the unique index turns the second write into a no-op.
  assert.deepEqual(first, second);
});

test("a retail checkout's payment intent is acknowledged, not recorded", () => {
  // Stripe emits payment_intent.succeeded for Checkout Sessions too. Recording
  // both would put the same box on the bench twice.
  const plan = planForEvent({
    type: "payment_intent.succeeded",
    data: { object: { id: "pi_retail", metadata: {} } },
  });
  assert.equal(plan.kind, "acknowledge");
});

test("a wholesale intent missing our own metadata is not recorded", () => {
  const plan = planForEvent({
    type: "payment_intent.succeeded",
    data: { object: { id: "pi_x", metadata: { channel: "wholesale" } } },
  });
  assert.equal(plan.kind, "acknowledge");
});

test("a checkout session records under its session id", () => {
  const plan = planForEvent({
    type: "checkout.session.completed",
    data: { object: { id: "cs_777" } },
  });
  assert.equal(plan.kind, "record-session");
  assert.equal(plan.kind === "record-session" && plan.dedupeKey, "cs_777");
});

test("an event with no id is acknowledged rather than recorded blank", () => {
  assert.equal(planForEvent({ type: "checkout.session.completed", data: { object: {} } }).kind, "acknowledge");
  assert.equal(planForEvent({ type: "payment_intent.succeeded", data: { object: {} } }).kind, "acknowledge");
});

test("event types nobody handles are acknowledged so Stripe stops retrying", () => {
  const plan = planForEvent({ type: "invoice.paid", data: { object: { id: "in_1" } } });
  assert.equal(plan.kind, "acknowledge");
  assert.match(plan.kind === "acknowledge" ? plan.why : "", /invoice\.paid/);
});

test("an event with no type at all is acknowledged", () => {
  assert.equal(planForEvent({}).kind, "acknowledge");
});

/* ------------------------------------------------------ delayed replay -- */

test("a signature inside the tolerance window is fresh", () => {
  const now = 1_800_000_000;
  assert.equal(signatureIsFresh(`t=${now - 10},v1=abc`, now), true);
  assert.equal(signatureIsFresh(`t=${now - SIGNATURE_TOLERANCE_SECONDS},v1=abc`, now), true);
});

test("a captured webhook replayed an hour later is refused", () => {
  const now = 1_800_000_000;
  // The HMAC still matches — this is the only thing that stops the replay.
  assert.equal(signatureIsFresh(`t=${now - 3600},v1=abc`, now), false);
});

test("a signature timestamped in the future is refused too", () => {
  const now = 1_800_000_000;
  assert.equal(signatureIsFresh(`t=${now + 3600},v1=abc`, now), false);
});

test("a malformed or missing timestamp is refused", () => {
  const now = 1_800_000_000;
  assert.equal(signatureIsFresh("v1=abc", now), false);
  assert.equal(signatureIsFresh("t=,v1=abc", now), false);
  assert.equal(signatureIsFresh("t=notanumber,v1=abc", now), false);
  assert.equal(signatureIsFresh("", now), false);
});

/* ------------------------------------------------------- money matching -- */

test("a matching capture records the amount and says nothing", () => {
  const result = reconcileCapture(12_450, 12_450);
  assert.equal(result.totalCents, 12_450);
  assert.equal(result.mismatch, false);
  assert.equal(result.alert, undefined);
});

test("the charged amount always wins, and a shortfall is flagged", () => {
  // The buyer had a cart open when a price went up.
  const result = reconcileCapture(12_000, 12_450);
  assert.equal(result.totalCents, 12_000, "the invoice has to match the bank");
  assert.equal(result.mismatch, true);
  assert.match(result.alert || "", /\$120\.00/);
  assert.match(result.alert || "", /less than/);
});

test("an overcharge is flagged in the buyer's favour wording", () => {
  const result = reconcileCapture(13_000, 12_450);
  assert.equal(result.totalCents, 13_000);
  assert.match(result.alert || "", /more than/);
  assert.match(result.alert || "", /\$5\.50/);
});

test("a missing captured amount does not become a negative order", () => {
  const result = reconcileCapture(0, 12_450);
  assert.equal(result.totalCents, 0);
  assert.equal(result.mismatch, true);
});

/* --------------------------------------------------- late after refund -- */

test("a first delivery for an unseen order is acted on", () => {
  assert.equal(shouldActOnExistingOrder(null), true);
});

test("a retry for an order still in flight is acted on", () => {
  for (const status of ["paid", "held", "labeled", "shipped", "delivered"]) {
    assert.equal(shouldActOnExistingOrder({ status }), true, status);
  }
});

test("a webhook arriving after the owner cancelled or refunded is ignored", () => {
  // Stripe retries for days. Re-running intake here would resurrect an order
  // the bakery has already settled with the buyer.
  assert.equal(shouldActOnExistingOrder({ status: "cancelled" }), false);
  assert.equal(shouldActOnExistingOrder({ status: "refunded" }), false);
});
