import assert from "node:assert/strict";
import test from "node:test";

import {
  priceCartFromProducts,
  stockStateFor,
  validateProductInput,
  type CatalogProductRow,
} from "../app/catalog-pricing.ts";

const shipping = { rateCents: 1250 };

function product(sku: string, overrides: Partial<CatalogProductRow> = {}): CatalogProductRow {
  return {
    sku,
    handle: sku.toLowerCase(),
    title: `${sku} — Case of 25`,
    description: "",
    loafPriceCents: 250,
    loavesPerCase: 25,
    imageUrl: "",
    boxWeightOz: 432,
    boxLengthIn: 24,
    boxWidthIn: 16,
    boxHeightIn: 6,
    ingredients: "Flour, Salt, Yeast, Filtered Water",
    allergens: "Wheat",
    netWeight: "14 oz",
    shelfLife: "14 days at room temperature",
    storage: "Keep at room temperature.",
    certifications: "Kosher (K Pareve), Halal, Vegan",
    inStock: true,
    dailyCapacityCases: 0,
    maxCasesPerOrder: 0,
    active: true,
    sortOrder: 0,
    ...overrides,
  };
}

test("a sold-out bread cannot be bought, and says so by name", () => {
  const cart = priceCartFromProducts(
    [product("WS-RYE-25", { inStock: false, title: "Rye" })],
    [{ sku: "WS-RYE-25", cases: 2 }],
    shipping,
  );
  assert.equal(cart.ok, false);
  if (!cart.ok) assert.match(cart.error, /Rye is sold out/);
});

test("the rest of a cart is not silently dropped when one bread is sold out", () => {
  // The cart fails as a whole rather than quietly charging for less bread
  // than the buyer reviewed.
  const cart = priceCartFromProducts(
    [product("WS-A-25"), product("WS-B-25", { inStock: false })],
    [{ sku: "WS-A-25", cases: 2 }, { sku: "WS-B-25", cases: 1 }],
    shipping,
  );
  assert.equal(cart.ok, false);
});

test("a per-order cap refuses the case that crosses it", () => {
  const products = [product("WS-RYE-25", { maxCasesPerOrder: 4, title: "Rye" })];
  assert.equal(priceCartFromProducts(products, [{ sku: "WS-RYE-25", cases: 4 }], shipping).ok, true);
  const over = priceCartFromProducts(products, [{ sku: "WS-RYE-25", cases: 5 }], shipping);
  assert.equal(over.ok, false);
  if (!over.ok) assert.match(over.error, /limited to 4 cases per order/);
});

test("daily capacity counts what today already committed", () => {
  const products = [product("WS-RYE-25", { dailyCapacityCases: 10, title: "Rye" })];
  // Six already ordered leaves four.
  const fits = priceCartFromProducts(products, [{ sku: "WS-RYE-25", cases: 4 }], shipping, undefined, {
    "WS-RYE-25": 6,
  });
  assert.equal(fits.ok, true);

  const overflows = priceCartFromProducts(products, [{ sku: "WS-RYE-25", cases: 5 }], shipping, undefined, {
    "WS-RYE-25": 6,
  });
  assert.equal(overflows.ok, false);
  if (!overflows.ok) assert.match(overflows.error, /Only 4 cases of Rye are left today/);
  // Singular agreement: "1 case … is left today", never "are".
  const single = priceCartFromProducts(products, [{ sku: "WS-RYE-25", cases: 2 }], shipping, undefined, {
    "WS-RYE-25": 9,
  });
  assert.equal(single.ok, false);
  if (!single.ok) assert.match(single.error, /Only 1 case of Rye is left today/);
});

test("a fully committed day says so instead of quoting zero left", () => {
  const cart = priceCartFromProducts(
    [product("WS-RYE-25", { dailyCapacityCases: 10, title: "Rye" })],
    [{ sku: "WS-RYE-25", cases: 1 }],
    shipping,
    undefined,
    { "WS-RYE-25": 10 },
  );
  assert.equal(cart.ok, false);
  if (!cart.ok) assert.match(cart.error, /fully booked for today/);
});

test("capacity beyond today's commitment cannot go negative", () => {
  // More committed than capacity (the owner lowered capacity mid-day) still
  // refuses cleanly rather than computing a negative allowance.
  const cart = priceCartFromProducts(
    [product("WS-RYE-25", { dailyCapacityCases: 5, title: "Rye" })],
    [{ sku: "WS-RYE-25", cases: 1 }],
    shipping,
    undefined,
    { "WS-RYE-25": 40 },
  );
  assert.equal(cart.ok, false);
  if (!cart.ok) assert.match(cart.error, /fully booked/);
});

test("zero means no limit for both capacity fields", () => {
  const cart = priceCartFromProducts(
    [product("WS-RYE-25", { dailyCapacityCases: 0, maxCasesPerOrder: 0 })],
    [{ sku: "WS-RYE-25", cases: 60 }],
    shipping,
    undefined,
    { "WS-RYE-25": 500 },
  );
  assert.equal(cart.ok, true);
});

test("stock limits are checked before any money is computed", () => {
  // An exclusive price on a sold-out bread must not produce a priced cart.
  const cart = priceCartFromProducts(
    [product("WS-RYE-25", { inStock: false })],
    [{ sku: "WS-RYE-25", cases: 1 }],
    shipping,
    { "WS-RYE-25": 100 },
  );
  assert.equal(cart.ok, false);
});

test("capacity numbers are validated the way the admin stores them", () => {
  const base = {
    sku: "WS-RYE-25",
    title: "Rye",
    loafPriceCents: 250,
    loavesPerCase: 25,
    boxWeightOz: 432,
    boxLengthIn: 24,
    boxWidthIn: 16,
    boxHeightIn: 6,
  };
  assert.equal(validateProductInput({ ...base, dailyCapacityCases: 0, maxCasesPerOrder: 0 }), null);
  assert.equal(validateProductInput({ ...base, dailyCapacityCases: 50, maxCasesPerOrder: 10 }), null);
  assert.match(String(validateProductInput({ ...base, dailyCapacityCases: -1 })), /Daily capacity/);
  assert.match(String(validateProductInput({ ...base, maxCasesPerOrder: 2.5 })), /Per-order limit/);
  assert.match(String(validateProductInput({ ...base, dailyCapacityCases: 200_000 })), /Daily capacity/);
});

test("stock wording tells a buyer only what they need to know", () => {
  assert.deepEqual(
    stockStateFor({ inStock: false, dailyCapacityCases: 0, maxCasesPerOrder: 0 }),
    { available: false, remainingToday: 0, maxPerOrder: null, label: "Sold out" },
  );

  const plentiful = stockStateFor({ inStock: true, dailyCapacityCases: 100, maxCasesPerOrder: 0 }, 10);
  assert.equal(plentiful.available, true);
  assert.equal(plentiful.label, "In stock");
  assert.equal(plentiful.remainingToday, 90);

  const scarce = stockStateFor({ inStock: true, dailyCapacityCases: 10, maxCasesPerOrder: 0 }, 8);
  assert.equal(scarce.label, "Only 2 cases left today");
  assert.equal(scarce.maxPerOrder, 2);

  const booked = stockStateFor({ inStock: true, dailyCapacityCases: 10, maxCasesPerOrder: 0 }, 10);
  assert.equal(booked.available, false);
  assert.equal(booked.label, "Fully booked today");
});

test("the per-order cap tightens to what is left today", () => {
  const state = stockStateFor({ inStock: true, dailyCapacityCases: 12, maxCasesPerOrder: 10 }, 9);
  assert.equal(state.maxPerOrder, 3);
});

test("no daily limit means no remaining-count is shown", () => {
  const state = stockStateFor({ inStock: true, dailyCapacityCases: 0, maxCasesPerOrder: 6 }, 0);
  assert.equal(state.remainingToday, null);
  assert.equal(state.label, "Up to 6 cases per order");
});
