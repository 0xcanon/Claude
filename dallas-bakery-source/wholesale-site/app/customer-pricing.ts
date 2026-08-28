/**
 * Exclusive per-customer prices, database-backed.
 *
 * The owner sets a special price per loaf for one business on one product in
 * /admin. Every place a cart is priced loads that buyer's overrides through
 * here and hands them to the pure pricing core, so an exclusive price holds
 * on the website, in the app, at webhook intake, and on standing orders.
 */

import { and, eq, sql } from "drizzle-orm";

import { getDb } from "../db";
import { customerPrices } from "../db/schema";
import { validateCustomerPriceCents, type PriceOverrides } from "./catalog-pricing.ts";
import { getProduct } from "./wholesale-catalog.ts";

/** SKU -> cents per loaf for one business. Empty when none are set. */
export async function priceOverridesFor(applicationId: string): Promise<PriceOverrides> {
  const id = String(applicationId || "").trim();
  if (!id) return {};
  const rows = await getDb()
    .select({ sku: customerPrices.sku, loafPriceCents: customerPrices.loafPriceCents })
    .from(customerPrices)
    .where(eq(customerPrices.applicationId, id));
  return Object.fromEntries(rows.map((row) => [row.sku, row.loafPriceCents]));
}

/**
 * Sets (or replaces) one exclusive price. Returns an error message or null.
 * The product must exist so a typo can't create a price for nothing.
 */
export async function setCustomerPrice(
  applicationId: string,
  sku: string,
  loafPriceCents: number,
): Promise<string | null> {
  const problem = validateCustomerPriceCents(loafPriceCents);
  if (problem) return problem;
  if (!(await getProduct(sku))) return "That product no longer exists.";
  await getDb()
    .insert(customerPrices)
    .values({ applicationId, sku, loafPriceCents })
    .onConflictDoUpdate({
      target: [customerPrices.applicationId, customerPrices.sku],
      set: { loafPriceCents, updatedAt: sql`CURRENT_TIMESTAMP` },
    });
  return null;
}

/** Removes one exclusive price; the buyer goes back to the catalog price. */
export async function clearCustomerPrice(applicationId: string, sku: string) {
  await getDb()
    .delete(customerPrices)
    .where(and(eq(customerPrices.applicationId, applicationId), eq(customerPrices.sku, sku)));
}
