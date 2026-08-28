import type { CatalogProduct, CartQuantityMap, ShippingSettings } from "../types";

/**
 * Wholesale is sold by the case, never the loaf. Cart quantities, quantity
 * rules, and the case counts sent to checkout are all counted in CASES;
 * loaves only ever appear as display copy and in the shipping estimate,
 * which bills per box of loaves.
 */
export const LOAVES_PER_CASE = 25;

export function formatMoney(amount: string | number, currencyCode = "USD") {
  const value = typeof amount === "number" ? amount : Number(amount);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currencyCode,
  }).format(Number.isFinite(value) ? value : 0);
}

export function formatDate(value: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf())
    ? value
    : new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(parsed);
}

export function formatLocationAddress(address: {
  address1: string;
  address2: string;
  city: string;
  state: string;
  zip: string;
  formattedAddress: string[];
} | null) {
  if (!address) return "Address is being prepared";
  if (address.formattedAddress.length) return address.formattedAddress.join(" · ");
  return [address.address1, address.address2, [address.city, address.state, address.zip].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(" · ");
}

/** Loaves in one case of this product. */
export function loavesPerCase(product: CatalogProduct) {
  const declared = Number(product.variant.unitsPerCase);
  return Number.isFinite(declared) && declared > 0 ? Math.floor(declared) : LOAVES_PER_CASE;
}

/** Price of a single loaf, derived from the case price the server sends. */
export function loafPrice(product: CatalogProduct) {
  return Number(product.variant.price.amount) / loavesPerCase(product);
}

/** "1 case" / "3 cases" — the unit buyers actually order in. */
export function caseLabel(cases: number) {
  return `${cases} ${cases === 1 ? "case" : "cases"}`;
}

/** "50 loaves" — the plain-English size behind a case count. */
export function loafLabel(loaves: number) {
  return `${loaves} ${loaves === 1 ? "loaf" : "loaves"}`;
}

/** Total CASES in the cart. */
export function cartQuantity(cart: CartQuantityMap) {
  return Object.values(cart).reduce((total, quantity) => total + Math.max(0, quantity || 0), 0);
}

/**
 * Total LOAVES in the cart. Shipping bills per box of loaves, so this — not
 * the case count — is what the shipping estimate must be given.
 */
export function cartLoaves(products: CatalogProduct[], cart: CartQuantityMap) {
  return products.reduce((total, product) => (
    total + loavesPerCase(product) * Math.max(0, cart[product.variant.id] || 0)
  ), 0);
}

/** Cart subtotal: case price times case count, per line. */
export function cartSubtotal(products: CatalogProduct[], cart: CartQuantityMap) {
  return products.reduce((total, product) => (
    total + Number(product.variant.price.amount) * (cart[product.variant.id] || 0)
  ), 0);
}

/**
 * Wholesale shipping: one box per CASE, billed at the box rate. This mirrors
 * priceCart on the server exactly — three cases is three boxes at $12.50,
 * whatever the retail box size happens to be — so the total the buyer
 * reviews is the total Stripe charges.
 */
export function shippingEstimate(cases: number, settings: ShippingSettings) {
  if (cases <= 0) return { boxes: 0, cents: 0 };
  const boxes = Math.max(0, Math.floor(cases));
  return { boxes, cents: boxes * Math.max(0, settings.rateCents) };
}

export function normalizeQuantity(quantity: number, minimum: number, increment: number) {
  const safeMinimum = Math.max(1, Math.floor(minimum || 1));
  const safeIncrement = Math.max(1, Math.floor(increment || 1));
  if (quantity <= 0) return 0;
  if (quantity <= safeMinimum) return safeMinimum;
  return safeMinimum + Math.ceil((quantity - safeMinimum) / safeIncrement) * safeIncrement;
}
