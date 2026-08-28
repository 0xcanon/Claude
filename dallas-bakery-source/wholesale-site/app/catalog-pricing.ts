/**
 * Case pricing — the pure half of the catalog, and still the price authority.
 *
 * Clients send SKUs and case counts, never money; every amount charged is
 * computed here from product rows the server loaded. No database import, so
 * pricing stays unit-testable and the same arithmetic runs everywhere:
 * checkout, order intake, and standing-order charges.
 */

import { MINIMUM_CASES } from "./order-rules.ts";

/** Default loaves per case. Each product can override it. */
export const LOAVES_PER_CASE = 25;

export type CatalogProductRow = {
  sku: string;
  handle: string;
  title: string;
  description: string;
  loafPriceCents: number;
  loavesPerCase: number;
  imageUrl: string;
  /** Parcel a single case ships in. UPS bills on these. */
  boxWeightOz: number;
  boxLengthIn: number;
  boxWidthIn: number;
  boxHeightIn: number;
  active: boolean;
  sortOrder: number;
};

/**
 * Exclusive per-customer prices: SKU -> price per loaf in cents. Absent
 * entries (and absent maps) mean the catalog price applies.
 */
export type PriceOverrides = Record<string, number>;

function loafPriceFor(product: CatalogProductRow, overrides?: PriceOverrides) {
  const override = overrides?.[product.sku];
  return Number.isInteger(override) && (override as number) > 0 ? (override as number) : product.loafPriceCents;
}

export function casePriceCents(product: Pick<CatalogProductRow, "loafPriceCents" | "loavesPerCase">) {
  return product.loafPriceCents * product.loavesPerCase;
}

export type CartLine = { sku: string; cases: number };

export type PricedLine = {
  sku: string;
  title: string;
  cases: number;
  loaves: number;
  unitAmountCents: number;
  lineTotalCents: number;
};

export type PricedCart = {
  ok: true;
  lines: PricedLine[];
  caseCount: number;
  loafCount: number;
  boxCount: number;
  subtotalCents: number;
  shippingCents: number;
  totalCents: number;
} | {
  ok: false;
  error: string;
};

const MAX_CASES_PER_LINE = 200;

/**
 * Prices a cart against the product rows given. Enforces the minimum and
 * rejects anything it does not recognise — an unknown or deactivated SKU
 * fails the cart rather than being silently dropped, so a buyer never pays
 * for a cart different from the one they reviewed.
 *
 * Shipping is PER CASE: one case is one box at the box rate, whatever the
 * retail box size says.
 *
 * `overrides` carries a buyer's exclusive prices (SKU -> cents per loaf);
 * when present they replace the catalog price for those SKUs, so the same
 * call prices every buyer correctly.
 */
export function priceCartFromProducts(
  products: CatalogProductRow[],
  lines: CartLine[],
  shipping: { rateCents: number },
  overrides?: PriceOverrides,
): PricedCart {
  const bySku = new Map(products.filter((product) => product.active).map((product) => [product.sku, product]));
  const priced: PricedLine[] = [];
  let caseCount = 0;
  let loafCount = 0;
  let subtotalCents = 0;

  for (const line of lines) {
    const product = bySku.get(String(line?.sku || ""));
    const cases = Number(line?.cases);
    if (!product) {
      return { ok: false, error: "That case is no longer available. Refresh the catalog and try again." };
    }
    if (!Number.isInteger(cases) || cases < 0 || cases > MAX_CASES_PER_LINE) {
      return { ok: false, error: "Case quantities must be whole numbers." };
    }
    if (cases === 0) continue;

    const unitAmountCents = loafPriceFor(product, overrides) * product.loavesPerCase;
    priced.push({
      sku: product.sku,
      title: product.title,
      cases,
      loaves: cases * product.loavesPerCase,
      unitAmountCents,
      lineTotalCents: unitAmountCents * cases,
    });
    caseCount += cases;
    loafCount += cases * product.loavesPerCase;
    subtotalCents += unitAmountCents * cases;
  }

  if (caseCount < MINIMUM_CASES) {
    return {
      ok: false,
      error: MINIMUM_CASES === 1
        ? "Wholesale orders start at one case."
        : `Wholesale orders start at ${MINIMUM_CASES} cases.`,
    };
  }

  const boxCount = caseCount;
  const shippingCents = boxCount * shipping.rateCents;

  return {
    ok: true,
    lines: priced,
    caseCount,
    loafCount,
    boxCount,
    subtotalCents,
    shippingCents,
    totalCents: subtotalCents + shippingCents,
  };
}

/**
 * Compact cart encoding for Stripe metadata, which caps a value at 500
 * characters: "WS-BARBARI-25:2|WS-NATURAL-25:1". Names and amounts are
 * deliberately left out — intake re-prices from the catalog, so the order
 * that gets recorded is priced by the same authority that charged the card.
 */
export function encodeCartLines(lines: Pick<PricedLine, "sku" | "cases">[]) {
  return lines.map((line) => `${line.sku}:${line.cases}`).join("|");
}

export function decodeCartLines(encoded: string): CartLine[] {
  return String(encoded || "")
    .split("|")
    .map((piece) => piece.trim())
    .filter(Boolean)
    .map((piece) => {
      const separator = piece.lastIndexOf(":");
      if (separator < 0) return null;
      const sku = piece.slice(0, separator);
      const cases = Number(piece.slice(separator + 1));
      return sku && Number.isInteger(cases) && cases > 0 ? { sku, cases } : null;
    })
    .filter((line): line is CartLine => line !== null);
}

/**
 * Validates an exclusive per-loaf price the way the admin API stores it —
 * the same bounds a product's own price must satisfy.
 */
export function validateCustomerPriceCents(value: number): string | null {
  if (!Number.isInteger(value) || value < 1 || value > 10_000) {
    return "Exclusive price per loaf must be between $0.01 and $100.00.";
  }
  return null;
}

/**
 * Validates the editable fields of a product the way the admin API stores
 * them. Returns an error message, or null when everything is sound.
 */
export function validateProductInput(input: {
  sku: string;
  title: string;
  loafPriceCents: number;
  loavesPerCase: number;
  boxWeightOz: number;
  boxLengthIn: number;
  boxWidthIn: number;
  boxHeightIn: number;
}): string | null {
  if (!/^[A-Z0-9][A-Z0-9-]{2,39}$/.test(input.sku)) {
    return "SKU must be 3-40 characters: capital letters, numbers, and dashes (e.g. WS-BARBARI-25).";
  }
  if (!input.title.trim()) return "Every product needs a name.";
  if (!Number.isInteger(input.loafPriceCents) || input.loafPriceCents < 1 || input.loafPriceCents > 10_000) {
    return "Price per loaf must be between $0.01 and $100.00.";
  }
  if (!Number.isInteger(input.loavesPerCase) || input.loavesPerCase < 1 || input.loavesPerCase > 500) {
    return "Loaves per case must be a whole number between 1 and 500.";
  }
  if (!Number.isInteger(input.boxWeightOz) || input.boxWeightOz < 16 || input.boxWeightOz > 150 * 16) {
    return "Box weight must be between 1 and 150 pounds.";
  }
  for (const [label, value] of [
    ["length", input.boxLengthIn],
    ["width", input.boxWidthIn],
    ["height", input.boxHeightIn],
  ] as const) {
    if (!Number.isInteger(value) || value < 1 || value > 108) {
      return `Box ${label} must be a whole number of inches between 1 and 108.`;
    }
  }
  return null;
}
