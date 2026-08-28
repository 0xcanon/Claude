import assert from "node:assert/strict";
import test from "node:test";

import {
  LOAVES_PER_CASE,
  casePriceCents,
  priceCartFromProducts,
  validateCustomerPriceCents,
  validateProductInput,
  type CatalogProductRow,
} from "../app/catalog-pricing.ts";

const shipping = { rateCents: 1250 };

/** A product row the way migration 0011 seeds them. */
function product(sku: string, loafPriceCents: number, overrides: Partial<CatalogProductRow> = {}): CatalogProductRow {
  return {
    sku,
    handle: sku.toLowerCase(),
    title: `${sku} — Case of 25`,
    description: "",
    loafPriceCents,
    loavesPerCase: 25,
    imageUrl: "/images/case.jpg",
    boxWeightOz: 432,
    boxLengthIn: 24,
    boxWidthIn: 16,
    boxHeightIn: 6,
    active: true,
    sortOrder: 0,
    ...overrides,
  };
}

const CATALOG = [
  product("WS-BARBARI-25", 250),
  product("WS-NATURAL-25", 250),
  product("WS-WHEAT-25", 250),
  product("WS-SESAME-25", 180),
];

test("case pricing matches the owner's numbers", () => {
  assert.equal(LOAVES_PER_CASE, 25);
  assert.equal(casePriceCents(CATALOG[0]!), 6250);
  // Sesame is the one exception at $1.80 a loaf.
  assert.equal(casePriceCents(CATALOG[3]!), 4500);
});

test("one case costs the case price plus one box of shipping", () => {
  const cart = priceCartFromProducts(CATALOG, [{ sku: "WS-BARBARI-25", cases: 1 }], shipping);
  assert.ok(cart.ok);
  if (!cart.ok) return;
  assert.equal(cart.subtotalCents, 6250);
  assert.equal(cart.boxCount, 1);
  assert.equal(cart.shippingCents, 1250);
  assert.equal(cart.totalCents, 7500);
  assert.equal(cart.loafCount, 25);
});

test("shipping is billed per case whatever the products weigh or hold", () => {
  const three = priceCartFromProducts(CATALOG, [{ sku: "WS-BARBARI-25", cases: 3 }], shipping);
  assert.ok(three.ok);
  if (!three.ok) return;
  assert.equal(three.boxCount, 3);
  assert.equal(three.shippingCents, 3750);
  assert.equal(three.totalCents, 6250 * 3 + 3750);
});

test("a product's own case size drives its loaf count and case price", () => {
  const minis = [product("WS-MINI-50", 160, { loavesPerCase: 50 })];
  const cart = priceCartFromProducts(minis, [{ sku: "WS-MINI-50", cases: 2 }], shipping);
  assert.ok(cart.ok);
  if (!cart.ok) return;
  assert.equal(cart.subtotalCents, 160 * 50 * 2);
  assert.equal(cart.loafCount, 100);
  // Still one box per case: 2 cases, 2 boxes.
  assert.equal(cart.boxCount, 2);
});

test("mixed cart totals across products", () => {
  const cart = priceCartFromProducts(
    CATALOG,
    [{ sku: "WS-BARBARI-25", cases: 2 }, { sku: "WS-SESAME-25", cases: 1 }],
    shipping,
  );
  assert.ok(cart.ok);
  if (!cart.ok) return;
  assert.equal(cart.caseCount, 3);
  assert.equal(cart.subtotalCents, 6250 * 2 + 4500);
  assert.equal(cart.shippingCents, 3750);
});

test("the one-case minimum is enforced server side", () => {
  const empty = priceCartFromProducts(CATALOG, [], shipping);
  assert.equal(empty.ok, false);
  const zeroed = priceCartFromProducts(CATALOG, [{ sku: "WS-BARBARI-25", cases: 0 }], shipping);
  assert.equal(zeroed.ok, false);
  if (!zeroed.ok) assert.match(zeroed.error, /one case/);
});

test("unknown, deactivated, and fractional cases are rejected, never dropped", () => {
  const unknown = priceCartFromProducts(CATALOG, [{ sku: "WS-CROISSANT-25", cases: 1 }], shipping);
  assert.equal(unknown.ok, false);
  const retired = priceCartFromProducts(
    [product("WS-RETIRED-25", 250, { active: false })],
    [{ sku: "WS-RETIRED-25", cases: 1 }],
    shipping,
  );
  assert.equal(retired.ok, false);
  const fractional = priceCartFromProducts(CATALOG, [{ sku: "WS-BARBARI-25", cases: 1.5 }], shipping);
  assert.equal(fractional.ok, false);
  const negative = priceCartFromProducts(CATALOG, [{ sku: "WS-BARBARI-25", cases: -3 }], shipping);
  assert.equal(negative.ok, false);
});

test("product input validation guards what the admin can save", () => {
  const good = {
    sku: "WS-RYE-25", title: "Rye — Case of 25",
    loafPriceCents: 300, loavesPerCase: 25,
    boxWeightOz: 432, boxLengthIn: 24, boxWidthIn: 16, boxHeightIn: 6,
  };
  assert.equal(validateProductInput(good), null);
  assert.match(validateProductInput({ ...good, sku: "bad sku" })!, /SKU/);
  assert.match(validateProductInput({ ...good, title: "  " })!, /name/);
  assert.match(validateProductInput({ ...good, loafPriceCents: 0 })!, /Price/);
  assert.match(validateProductInput({ ...good, loavesPerCase: 0 })!, /Loaves per case/);
  assert.match(validateProductInput({ ...good, boxWeightOz: 8 })!, /weight/);
  assert.match(validateProductInput({ ...good, boxLengthIn: 0 })!, /length/);
});

test("exclusive prices: an override replaces the catalog price for that SKU only", () => {
  // Barbari at $2.25/loaf for this buyer; sesame stays at list.
  const cart = priceCartFromProducts(
    CATALOG,
    [{ sku: "WS-BARBARI-25", cases: 2 }, { sku: "WS-SESAME-25", cases: 1 }],
    shipping,
    { "WS-BARBARI-25": 225 },
  );
  assert.ok(cart.ok);
  if (cart.ok) {
    const barbari = cart.lines.find((line) => line.sku === "WS-BARBARI-25")!;
    const sesame = cart.lines.find((line) => line.sku === "WS-SESAME-25")!;
    assert.equal(barbari.unitAmountCents, 225 * 25);
    assert.equal(sesame.unitAmountCents, 180 * 25);
    assert.equal(cart.subtotalCents, 2 * 225 * 25 + 180 * 25);
    // Shipping is untouched by exclusive pricing: still one box per case.
    assert.equal(cart.shippingCents, 3 * 1250);
  }
});

test("exclusive prices: absent or invalid overrides fall back to the catalog price", () => {
  const noMap = priceCartFromProducts(CATALOG, [{ sku: "WS-BARBARI-25", cases: 1 }], shipping);
  const emptyMap = priceCartFromProducts(CATALOG, [{ sku: "WS-BARBARI-25", cases: 1 }], shipping, {});
  const badValues = priceCartFromProducts(
    CATALOG,
    [{ sku: "WS-BARBARI-25", cases: 1 }],
    shipping,
    { "WS-BARBARI-25": 0, "WS-SESAME-25": 2.5 as unknown as number },
  );
  for (const cart of [noMap, emptyMap, badValues]) {
    assert.ok(cart.ok);
    if (cart.ok) assert.equal(cart.subtotalCents, 250 * 25);
  }
});

test("customer price validation matches product price bounds", () => {
  assert.equal(validateCustomerPriceCents(225), null);
  assert.equal(validateCustomerPriceCents(1), null);
  assert.equal(validateCustomerPriceCents(10_000), null);
  assert.notEqual(validateCustomerPriceCents(0), null);
  assert.notEqual(validateCustomerPriceCents(10_001), null);
  assert.notEqual(validateCustomerPriceCents(2.25), null);
});
