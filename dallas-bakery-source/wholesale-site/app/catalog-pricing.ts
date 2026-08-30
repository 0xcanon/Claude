import { siteUrl } from "./buyer-portal.ts";

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
  /** Food spec shown to buyers — the same words as the physical label. */
  ingredients: string;
  allergens: string;
  netWeight: string;
  shelfLife: string;
  storage: string;
  certifications: string;
  /** Sold-out switch. False hides the bread from ordering without deleting it. */
  inStock: boolean;
  /** Cases the bakery can make in a day. 0 means no limit. */
  dailyCapacityCases: number;
  /** Cap on one order's cases of this bread. 0 means no limit. */
  maxCasesPerOrder: number;
  active: boolean;
  sortOrder: number;
};

/**
 * Exclusive per-customer prices: SKU -> price per loaf in cents. Absent
 * entries (and absent maps) mean the catalog price applies.
 */
export type PriceOverrides = Record<string, number>;

/** Cases of each SKU committed by today's orders, keyed by SKU. */
export type CommittedCases = Record<string, number>;

export type StockState = {
  /** True when a buyer can add this bread to a cart at all. */
  available: boolean;
  /** Cases still sellable today, or null when there is no daily limit. */
  remainingToday: number | null;
  /** Largest number of cases one order may take, or null when uncapped. */
  maxPerOrder: number | null;
  /** What the buyer is told, e.g. "Sold out" or "Only 4 cases left today". */
  label: string;
};

function caseWord(count: number) {
  return `${count} case${count === 1 ? "" : "s"}`;
}

/**
 * Turns a product's stock settings and today's commitments into the one
 * sentence a buyer sees. The wording never mentions capacity or ovens — a
 * buyer only needs to know what they can order.
 */
export function stockStateFor(
  product: Pick<CatalogProductRow, "inStock" | "dailyCapacityCases" | "maxCasesPerOrder">,
  committedCases = 0,
): StockState {
  const maxPerOrder = product.maxCasesPerOrder > 0 ? product.maxCasesPerOrder : null;
  if (!product.inStock) {
    return { available: false, remainingToday: 0, maxPerOrder, label: "Sold out" };
  }
  if (product.dailyCapacityCases <= 0) {
    return {
      available: true,
      remainingToday: null,
      maxPerOrder,
      label: maxPerOrder ? `Up to ${caseWord(maxPerOrder)} per order` : "In stock",
    };
  }
  const remaining = Math.max(0, product.dailyCapacityCases - Math.max(0, committedCases));
  if (remaining === 0) {
    return { available: false, remainingToday: 0, maxPerOrder, label: "Fully booked today" };
  }
  const orderCap = maxPerOrder ? Math.min(maxPerOrder, remaining) : remaining;
  // Only warn when the day is genuinely running short; a full oven should not
  // look like scarcity marketing.
  const low = remaining <= Math.max(3, Math.ceil(product.dailyCapacityCases * 0.2));
  return {
    available: true,
    remainingToday: remaining,
    maxPerOrder: orderCap,
    label: low ? `Only ${caseWord(remaining)} left today` : "In stock",
  };
}

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
  /**
   * Cases of each SKU already committed by today's orders. Used with the
   * product's daily capacity so the catalog cannot sell more bread than the
   * bakery can bake. Absent means "nothing committed yet".
   */
  committedCasesBySku?: Record<string, number>,
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

    // Stock and capacity, checked before any money is computed.
    if (!product.inStock) {
      return { ok: false, error: `${product.title} is sold out right now. Remove it to place the rest of your order.` };
    }
    if (product.maxCasesPerOrder > 0 && cases > product.maxCasesPerOrder) {
      return {
        ok: false,
        error: `${product.title} is limited to ${product.maxCasesPerOrder} case${product.maxCasesPerOrder === 1 ? "" : "s"} per order.`,
      };
    }
    if (product.dailyCapacityCases > 0) {
      const committed = Math.max(0, Number(committedCasesBySku?.[product.sku] || 0));
      const remaining = Math.max(0, product.dailyCapacityCases - committed);
      if (cases > remaining) {
        return {
          ok: false,
          error: remaining === 0
            ? `${product.title} is fully booked for today. Try again tomorrow, or call us.`
            : `Only ${remaining} case${remaining === 1 ? " " : "s "}of ${product.title} ${remaining === 1 ? "is" : "are"} left today.`,
        };
      }
    }

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
 * Where a product photo is allowed to live.
 *
 * Only this site. A photo on someone else's server disappears the day that
 * company reorganises, and the buyer catalog goes blank with no warning and no
 * error — which is exactly what happened when the homepage photographs were
 * hot-linked from the retail store's CDN.
 *
 * Site-relative is also the only form both surfaces can use: the website
 * resolves it against its own origin, and the app resolves it against the API
 * base. An absolute URL to our own domain would break the app the moment the
 * domain changed.
 */
export function validateImageUrl(imageUrl: string | undefined): string | null {
  const value = String(imageUrl || "").trim();
  if (!value) return null; // Optional — the catalog falls back to a stock photo.
  if (/^https?:\/\//i.test(value)) {
    return "Use a photo stored on this site, like /images/barbari.webp. A link to another company's server stops working the day they change it.";
  }
  if (!value.startsWith("/images/")) {
    return "Product photos live in /images/. Use a path like /images/barbari.webp.";
  }
  if (value.includes("..")) {
    return "That photo path is not valid.";
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
  dailyCapacityCases?: number;
  maxCasesPerOrder?: number;
  imageUrl?: string;
}): string | null {
  const imageProblem = validateImageUrl(input.imageUrl);
  if (imageProblem) return imageProblem;

  for (const [label, value] of [
    ["Daily capacity", input.dailyCapacityCases],
    ["Per-order limit", input.maxCasesPerOrder],
  ] as const) {
    if (value === undefined) continue;
    if (!Number.isInteger(value) || value < 0 || value > 100_000) {
      return `${label} must be a whole number of cases (0 means no limit).`;
    }
  }
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

/**
 * Makes a product photo loadable by every client, not just the website.
 *
 * Photos are stored as site-relative paths ("/images/case.jpg") because that
 * is what keeps them on our own server and survives a domain change. A browser
 * resolves that against the page it is on. The apps have no page, so React
 * Native's <Image> was handed a URI with no host and quietly rendered nothing
 * — every product card in the buyer app was blank.
 *
 * Absolutising here rather than in the apps means the phones already installed
 * start showing photos the moment this deploys, with no app-store release.
 */
export function absoluteImageUrl(imageUrl: string) {
  const value = String(imageUrl || "").trim();
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  return `${siteUrl()}${value.startsWith("/") ? "" : "/"}${value}`;
}
