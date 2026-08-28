import assert from "node:assert/strict";
import test from "node:test";

import { buyerStage, isTrackable, trackingUrl } from "../app/order-status.ts";

test("buyer stages read in plain language, not bench language", () => {
  assert.equal(buyerStage("paid").label, "Baking");
  assert.equal(buyerStage("labeled").label, "Packed");
  assert.equal(buyerStage("shipped").label, "Shipped");
  // "labeled" is an internal step; the buyer never sees that word.
  assert.doesNotMatch(buyerStage("labeled").label.toLowerCase(), /label/);
});

test("a refunded order says so and never offers tracking", () => {
  assert.equal(buyerStage("refunded").label, "Refunded");
  assert.equal(isTrackable("refunded", "1Z999AA10123456784"), false);
});

test("an unknown status falls back to the earliest stage, never to nothing", () => {
  assert.equal(buyerStage("").step, 1);
  assert.equal(buyerStage("something-new").step, 1);
});

test("tracking links point at UPS and encode the number", () => {
  assert.equal(trackingUrl(""), "");
  assert.equal(trackingUrl("   "), "");
  assert.match(trackingUrl("1Z999AA10123456784"), /^https:\/\/www\.ups\.com\/track\?/);
  assert.match(trackingUrl("1Z999AA10123456784"), /tracknum=1Z999AA10123456784/);
});

test("tracking is offered only once the parcel has actually shipped", () => {
  // A label bought this morning has a number UPS cannot show yet.
  assert.equal(isTrackable("labeled", "1Z999AA10123456784"), false);
  assert.equal(isTrackable("paid", ""), false);
  assert.equal(isTrackable("shipped", ""), false);
  assert.equal(isTrackable("shipped", "1Z999AA10123456784"), true);
});
