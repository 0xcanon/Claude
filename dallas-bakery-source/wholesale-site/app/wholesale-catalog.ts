/**
 * The product catalog, database-backed.
 *
 * The owner manages products in /admin; buyers see whatever is active here.
 * Pricing arithmetic lives in catalog-pricing.ts (pure) — this module loads
 * the rows and stays the only way products are read or written. Every price
 * charged is still computed server-side from these rows.
 */

import { asc, eq, sql } from "drizzle-orm";

import { getDb } from "../db";
import { products } from "../db/schema";
import { committedCasesToday, stockStateFor, type CommittedCases } from "./availability.ts";
import {
  priceCartFromProducts,
  validateProductInput,
  type CartLine,
  type CatalogProductRow,
  type PriceOverrides,
  type PricedCart,
} from "./catalog-pricing.ts";
import { MINIMUM_CASES } from "./order-rules.ts";

export {
  LOAVES_PER_CASE,
  casePriceCents,
  decodeCartLines,
  encodeCartLines,
} from "./catalog-pricing.ts";
export type { CartLine, CatalogProductRow, PriceOverrides, PricedCart, PricedLine } from "./catalog-pricing.ts";

function toRow(row: typeof products.$inferSelect): CatalogProductRow {
  return {
    sku: row.sku,
    handle: row.handle,
    title: row.title,
    description: row.description,
    loafPriceCents: row.loafPriceCents,
    loavesPerCase: row.loavesPerCase,
    imageUrl: row.imageUrl,
    boxWeightOz: row.boxWeightOz,
    boxLengthIn: row.boxLengthIn,
    boxWidthIn: row.boxWidthIn,
    boxHeightIn: row.boxHeightIn,
    ingredients: row.ingredients,
    allergens: row.allergens,
    netWeight: row.netWeight,
    shelfLife: row.shelfLife,
    storage: row.storage,
    certifications: row.certifications,
    inStock: row.inStock,
    dailyCapacityCases: row.dailyCapacityCases,
    maxCasesPerOrder: row.maxCasesPerOrder,
    active: row.active,
    sortOrder: row.sortOrder,
  };
}

/** Every product, retired ones included — the admin's view. */
export async function listAllProducts(): Promise<CatalogProductRow[]> {
  const rows = await getDb().select().from(products).orderBy(asc(products.sortOrder), asc(products.title));
  return rows.map(toRow);
}

/** What buyers can order right now. */
export async function listActiveProducts(): Promise<CatalogProductRow[]> {
  return (await listAllProducts()).filter((product) => product.active);
}

export async function getProduct(sku: string): Promise<CatalogProductRow | null> {
  const [row] = await getDb().select().from(products).where(eq(products.sku, sku)).limit(1);
  return row ? toRow(row) : null;
}

/**
 * Prices a cart against the live catalog. The price authority for checkout.
 * `overrides` carries a buyer's exclusive prices when they have any.
 *
 * Today's committed cases are loaded here rather than passed in, so every
 * caller — checkout, order intake, standing orders — gets the same capacity
 * check without having to remember to ask for it.
 */
export async function priceCart(
  lines: CartLine[],
  shipping: { rateCents: number },
  overrides?: PriceOverrides,
): Promise<PricedCart> {
  const [rows, committed] = await Promise.all([listActiveProducts(), committedCasesToday()]);
  return priceCartFromProducts(rows, lines, shipping, overrides, committed);
}

/**
 * Catalog shaped for the app's and the website's existing product types.
 * With overrides, a buyer's exclusive price replaces the list price — it is
 * simply THE price. Nothing in the payload signals that other businesses pay
 * differently: most buyers have their own pricing, and each one's catalog
 * should read as the ordinary catalog.
 *
 * The spec block (ingredients, allergens, weight, shelf life, storage,
 * certifications) travels with every product: a wholesale buyer needs those
 * words to satisfy their own food-safety file, and reading them off a photo
 * of a label is not good enough.
 */
export async function catalogForClients(currencyCode = "USD", overrides?: PriceOverrides) {
  const [rows, committed] = await Promise.all([listActiveProducts(), committedCasesToday()]);
  return rows.map((product) => {
    const override = overrides?.[product.sku];
    const loafPriceCents = Number.isInteger(override) && (override as number) > 0
      ? (override as number)
      : product.loafPriceCents;
    const stock = stockStateFor(product, committed[product.sku] || 0);
    return {
      id: product.sku,
      handle: product.handle,
      title: product.title,
      description: product.description,
      imageUrl: product.imageUrl,
      imageAlt: product.title,
      spec: {
        ingredients: product.ingredients,
        allergens: product.allergens,
        netWeight: product.netWeight,
        shelfLife: product.shelfLife,
        storage: product.storage,
        certifications: product.certifications,
      },
      stock,
      variant: {
        id: product.sku,
        title: `Case of ${product.loavesPerCase}`,
        availableForSale: stock.available,
        price: {
          amount: ((loafPriceCents * product.loavesPerCase) / 100).toFixed(2),
          currencyCode,
        },
        quantityRule: { minimum: MINIMUM_CASES, maximum: stock.maxPerOrder, increment: 1 },
        unitsPerCase: product.loavesPerCase,
      },
    };
  });
}

/** Today's remaining capacity per SKU, for the admin's stock screen. */
export async function catalogWithStock() {
  const [rows, committed] = await Promise.all([listAllProducts(), committedCasesToday()]);
  return rows.map((product) => ({
    ...product,
    committedToday: committed[product.sku] || 0,
    stock: stockStateFor(product, committed[product.sku] || 0),
  }));
}

export type { CommittedCases };

export type ProductInput = {
  sku: string;
  handle: string;
  title: string;
  description: string;
  loafPriceCents: number;
  loavesPerCase: number;
  imageUrl: string;
  boxWeightOz: number;
  boxLengthIn: number;
  boxWidthIn: number;
  boxHeightIn: number;
  ingredients: string;
  allergens: string;
  netWeight: string;
  shelfLife: string;
  storage: string;
  certifications: string;
  inStock: boolean;
  dailyCapacityCases: number;
  maxCasesPerOrder: number;
  sortOrder: number;
};

/** Creates a product. Returns an error message or null on success. */
export async function createProduct(input: ProductInput): Promise<string | null> {
  const problem = validateProductInput(input);
  if (problem) return problem;
  if (await getProduct(input.sku)) return "A product with that SKU already exists.";
  await getDb().insert(products).values({
    ...input,
    handle: input.handle || input.sku.toLowerCase(),
    imageUrl: input.imageUrl || "/images/case.jpg",
  });
  return null;
}

/** Updates a product's editable fields. The SKU itself never changes. */
export async function updateProduct(sku: string, input: Omit<ProductInput, "sku">): Promise<string | null> {
  const problem = validateProductInput({ ...input, sku });
  if (problem) return problem;
  const existing = await getProduct(sku);
  if (!existing) return "That product no longer exists.";
  await getDb()
    .update(products)
    .set({
      ...input,
      handle: input.handle || sku.toLowerCase(),
      imageUrl: input.imageUrl || "/images/case.jpg",
      updatedAt: sql`CURRENT_TIMESTAMP`,
    })
    .where(eq(products.sku, sku));
  return null;
}

/**
 * Hides a product from buyers (or brings it back). Carts and standing orders
 * that still reference a hidden product fail their next re-price with a clear
 * message instead of charging for bread that will not be baked.
 */
export async function setProductActive(sku: string, active: boolean) {
  await getDb()
    .update(products)
    .set({ active, updatedAt: sql`CURRENT_TIMESTAMP` })
    .where(eq(products.sku, sku));
}

/**
 * The one-click "we ran out" switch. Different from deactivating: the bread
 * stays in the catalog, visibly sold out, and comes back with one more click
 * tomorrow morning.
 */
export async function setProductInStock(sku: string, inStock: boolean) {
  await getDb()
    .update(products)
    .set({ inStock, updatedAt: sql`CURRENT_TIMESTAMP` })
    .where(eq(products.sku, sku));
}

/**
 * Removes a product permanently. Safe for history: orders snapshot their own
 * line items, so past orders, receipts, and the shipping queue keep showing
 * exactly what was sold.
 */
export async function deleteProduct(sku: string) {
  await getDb().delete(products).where(eq(products.sku, sku));
}
