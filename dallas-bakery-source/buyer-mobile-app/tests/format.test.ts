import assert from "node:assert/strict";
import test from "node:test";

import {
  cartLoaves,
  cartQuantity,
  cartSubtotal,
  caseLabel,
  loafLabel,
  loafPrice,
  loavesPerCase,
  normalizeQuantity,
  shippingEstimate,
} from "../src/lib/format.ts";
import type { CatalogProduct } from "../src/types.ts";

const shipping = {
  rateCents: 1250,
  unitsPerBox: 25,
  formattedRate: "$12.50",
};

/** A case product shaped the way /api/buyer/catalog sends it. */
function caseProduct(sku: string, casePrice: string, unitsPerCase = 25): CatalogProduct {
  return {
    id: sku,
    handle: sku.toLowerCase(),
    title: `${sku} — Case of ${unitsPerCase}`,
    description: "",
    imageUrl: "",
    imageAlt: "",
    variant: {
      id: sku,
      title: `Case of ${unitsPerCase}`,
      availableForSale: true,
      price: { amount: casePrice, currencyCode: "USD" },
      quantityRule: { minimum: 1, maximum: null, increment: 1 },
      unitsPerCase,
    },
  };
}

test("shipping is one box per case, billed at the box rate", () => {
  assert.deepEqual(shippingEstimate(0, shipping), { boxes: 0, cents: 0 });
  assert.deepEqual(shippingEstimate(1, shipping), { boxes: 1, cents: 1250 });
  assert.deepEqual(shippingEstimate(3, shipping), { boxes: 3, cents: 3750 });
  assert.deepEqual(shippingEstimate(10, shipping), { boxes: 10, cents: 12500 });
});

test("the case rate does not depend on the retail box size", () => {
  // priceCart on the server bills per case too. If this drifted, the buyer
  // would review one total and Stripe would charge another.
  for (const unitsPerBox of [25, 50, 100]) {
    assert.deepEqual(shippingEstimate(3, { ...shipping, unitsPerBox }), { boxes: 3, cents: 3750 });
  }
});

test("cart quantity counts cases and ignores empty or negative lines", () => {
  assert.equal(cartQuantity({ a: 2, b: 1, c: -5, d: 0 }), 3);
});

test("quantity changes respect minimums and increments", () => {
  assert.equal(normalizeQuantity(1, 10, 5), 10);
  assert.equal(normalizeQuantity(11, 10, 5), 15);
  assert.equal(normalizeQuantity(0, 10, 5), 0);
});

test("a case is priced as a whole, and the loaf price is derived from it", () => {
  const barbari = caseProduct("WS-BARBARI-25", "50.00");
  assert.equal(loavesPerCase(barbari), 25);
  assert.equal(loafPrice(barbari), 2);
  assert.equal(cartSubtotal([barbari], { "WS-BARBARI-25": 3 }), 150);
});

test("case size falls back to 25 when the server omits it", () => {
  const legacy = caseProduct("WS-LEGACY-25", "50.00");
  delete legacy.variant.unitsPerCase;
  assert.equal(loavesPerCase(legacy), 25);
});

test("a three-case cart bills three boxes and reports its loaf count", () => {
  const barbari = caseProduct("WS-BARBARI-25", "50.00");
  const cart = { "WS-BARBARI-25": 3 };

  assert.equal(cartQuantity(cart), 3);
  assert.equal(cartLoaves([barbari], cart), 75);
  assert.deepEqual(shippingEstimate(cartQuantity(cart), shipping), { boxes: 3, cents: 3750 });
  assert.equal(cartSubtotal([barbari], cart), 150);
});

test("mixed cases add up across differently sized cases", () => {
  const products = [caseProduct("A", "50.00"), caseProduct("B", "36.00", 12)];
  const cart = { A: 2, B: 3 };
  assert.equal(cartQuantity(cart), 5);
  assert.equal(cartLoaves(products, cart), 2 * 25 + 3 * 12);
  assert.equal(cartSubtotal(products, cart), 2 * 50 + 3 * 36);
});

test("case and loaf labels read naturally in the singular", () => {
  assert.equal(caseLabel(1), "1 case");
  assert.equal(caseLabel(4), "4 cases");
  assert.equal(loafLabel(1), "1 loaf");
  assert.equal(loafLabel(25), "25 loaves");
});
