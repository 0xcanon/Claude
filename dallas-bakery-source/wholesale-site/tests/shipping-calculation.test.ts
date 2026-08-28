import assert from "node:assert/strict";
import test from "node:test";

import {
  validateParcelWeightOz,
  shippingBoxesForQuantity,
  shippingCostCents,
  validateShippingRate,
} from "../app/shipping-calculation.ts";

test("shipping uses one $12.50 box for quantities 1 through 25", () => {
  assert.equal(shippingBoxesForQuantity(1, 25), 1);
  assert.equal(shippingBoxesForQuantity(25, 25), 1);
  assert.equal(shippingCostCents(25, { rateCents: 1250, unitsPerBox: 25 }), 1250);
});

test("shipping rounds partial boxes up", () => {
  assert.equal(shippingBoxesForQuantity(26, 25), 2);
  assert.equal(shippingCostCents(51, { rateCents: 1250, unitsPerBox: 25 }), 3750);
});

test("shipping rejects unsafe settings", () => {
  assert.throws(() => validateShippingRate(-1, 25), /Shipping/);
  assert.throws(() => validateShippingRate(1250, 0), /Box size/);
});

test("the packed box weighs 27 lb and UPS is billed exactly that", () => {
  // 432 oz is the owner's measured weight for a packed 25-loaf case.
  assert.equal(validateParcelWeightOz(432), 432);
  assert.equal(Math.ceil(432 / 16), 27);
});

test("impossible parcel weights are refused", () => {
  assert.throws(() => validateParcelWeightOz(0));
  assert.throws(() => validateParcelWeightOz(8));          // half a pound of bread box
  assert.throws(() => validateParcelWeightOz(150 * 16 + 1)); // over UPS's package cap
  assert.throws(() => validateParcelWeightOz(432.5));
});
