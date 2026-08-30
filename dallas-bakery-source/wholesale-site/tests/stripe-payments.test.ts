import assert from "node:assert/strict";
import test from "node:test";

import { stripeForm } from "../app/stripe.ts";
import {
  decodeCartLines,
  encodeCartLines,
  priceCartFromProducts,
  type CatalogProductRow,
} from "../app/catalog-pricing.ts";

const shipping = { rateCents: 1250 };

function product(sku: string, loafPriceCents: number): CatalogProductRow {
  return {
    sku, handle: sku.toLowerCase(), title: `${sku} — Case of 25`, description: "",
    loafPriceCents, loavesPerCase: 25, imageUrl: "",
    boxWeightOz: 432, boxLengthIn: 24, boxWidthIn: 16, boxHeightIn: 6,
    ingredients: "", allergens: "", netWeight: "", shelfLife: "", storage: "", certifications: "",
    inStock: true, dailyCapacityCases: 0, maxCasesPerOrder: 0,
    active: true, sortOrder: 0,
  };
}

const PRODUCTS = [product("WS-BARBARI-25", 250), product("WS-SESAME-25", 180)];

test("stripe form encoding flattens nested objects into bracket keys", () => {
  const form = stripeForm({
    amount: 18750,
    currency: "usd",
    payment_method_types: ["card"],
    metadata: { channel: "wholesale", caseCount: 3 },
  });
  assert.equal(form.get("amount"), "18750");
  assert.equal(form.get("currency"), "usd");
  assert.equal(form.get("payment_method_types[0]"), "card");
  assert.equal(form.get("metadata[channel]"), "wholesale");
  assert.equal(form.get("metadata[caseCount]"), "3");
});

test("stripe form encoding drops null and undefined instead of sending 'null'", () => {
  const form = stripeForm({ a: 1, b: null, c: undefined });
  assert.equal(form.get("a"), "1");
  assert.equal(form.has("b"), false);
  assert.equal(form.has("c"), false);
});

test("a cart survives the round trip through Stripe metadata", () => {
  const lines = [
    { sku: "WS-BARBARI-25", cases: 2 },
    { sku: "WS-SESAME-25", cases: 1 },
  ];
  const encoded = encodeCartLines(lines);
  assert.equal(encoded, "WS-BARBARI-25:2|WS-SESAME-25:1");
  assert.deepEqual(decodeCartLines(encoded), lines);
  // Stripe caps a metadata value at 500 characters; the whole catalog fits.
  assert.ok(encodeCartLines([
    { sku: "WS-BARBARI-25", cases: 200 },
    { sku: "WS-NATURAL-25", cases: 200 },
    { sku: "WS-WHEAT-25", cases: 200 },
    { sku: "WS-SESAME-25", cases: 200 },
  ]).length < 500);
});

test("decoding rejects junk rather than inventing a line", () => {
  assert.deepEqual(decodeCartLines(""), []);
  assert.deepEqual(decodeCartLines("garbage"), []);
  assert.deepEqual(decodeCartLines("WS-BARBARI-25:0"), []);
  assert.deepEqual(decodeCartLines("WS-BARBARI-25:-2"), []);
  assert.deepEqual(decodeCartLines("WS-BARBARI-25:1.5"), []);
  // A good line beside a bad one still comes through.
  assert.deepEqual(decodeCartLines("bad|WS-BARBARI-25:2"), [{ sku: "WS-BARBARI-25", cases: 2 }]);
});

test("re-pricing a decoded cart reproduces the amount that was charged", () => {
  // This is what the webhook does: the order recorded on the shipping bench is
  // priced by the same module that set the PaymentIntent amount.
  const lines = [{ sku: "WS-BARBARI-25", cases: 2 }, { sku: "WS-SESAME-25", cases: 1 }];
  const atCheckout = priceCartFromProducts(PRODUCTS, lines, shipping);
  const atIntake = priceCartFromProducts(PRODUCTS, decodeCartLines(encodeCartLines(lines)), shipping);
  assert.ok(atCheckout.ok && atIntake.ok);
  if (!atCheckout.ok || !atIntake.ok) return;
  assert.equal(atIntake.totalCents, atCheckout.totalCents);
  assert.equal(atIntake.subtotalCents, 6250 * 2 + 4500);
  // Three cases, three boxes.
  assert.equal(atIntake.boxCount, 3);
  assert.equal(atIntake.shippingCents, 3750);
});

test("an unknown sku in metadata fails the re-price instead of shipping a free box", () => {
  const decoded = decodeCartLines("WS-GONE-25:2");
  const priced = priceCartFromProducts(PRODUCTS, decoded, shipping);
  assert.equal(priced.ok, false);
});
