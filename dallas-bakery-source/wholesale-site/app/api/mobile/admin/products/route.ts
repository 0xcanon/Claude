/**
 * Stock control from the bench.
 *
 * This is the one thing the owner most needs away from a desk: the rye ran
 * out, so take it off sale before the next order comes in rather than
 * disappointing a buyer and refunding it afterwards. Deliberately narrow —
 * it can flip a bread on or off and adjust the day's capacity, and nothing
 * else. Editing ingredients, allergens or dimensions stays in the portal,
 * where there is room to read what you are changing.
 */

import { mobileJson, requireMobileAdmin } from "../../../../mobile-admin-auth.ts";
import { catalogWithStock, getProduct, setProductInStock } from "../../../../wholesale-catalog.ts";
import { getDb } from "../../../../../db";
import { products } from "../../../../../db/schema";
import { eq, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireMobileAdmin(request);
  if (!auth.ok) return auth.response;

  const rows = await catalogWithStock();
  return mobileJson({
    products: rows.map((product) => ({
      sku: product.sku,
      title: product.title,
      imageUrl: product.imageUrl,
      active: Boolean(product.active),
      inStock: Boolean(product.inStock),
      loavesPerCase: product.loavesPerCase,
      loafPriceCents: product.loafPriceCents,
      dailyCapacityCases: product.dailyCapacityCases,
      committedToday: product.committedToday,
      stock: product.stock,
    })),
  });
}

export async function PATCH(request: Request) {
  const auth = await requireMobileAdmin(request);
  if (!auth.ok) return auth.response;

  let body: { sku?: string; inStock?: unknown; dailyCapacityCases?: unknown };
  try {
    body = await request.json();
  } catch {
    return mobileJson({ error: "Invalid request." }, 400);
  }

  const sku = String(body.sku || "").trim();
  if (!sku) return mobileJson({ error: "Which bread?" }, 400);
  const existing = await getProduct(sku);
  if (!existing) return mobileJson({ error: "That bread is no longer in the catalog." }, 404);

  if (typeof body.inStock === "boolean") {
    await setProductInStock(sku, body.inStock);
  }

  if (body.dailyCapacityCases !== undefined) {
    const capacity = Number(body.dailyCapacityCases);
    // Zero means "no cap", which is different from "none available" — that is
    // what the in-stock switch is for.
    if (!Number.isInteger(capacity) || capacity < 0 || capacity > 100_000) {
      return mobileJson({ error: "Daily capacity has to be a whole number of cases, or 0 for no limit." }, 400);
    }
    await getDb()
      .update(products)
      .set({ dailyCapacityCases: capacity, updatedAt: sql`CURRENT_TIMESTAMP` })
      .where(eq(products.sku, sku));
  }

  const after = (await catalogWithStock()).find((row) => row.sku === sku);
  return mobileJson({
    ok: true,
    product: after && {
      sku: after.sku,
      title: after.title,
      inStock: Boolean(after.inStock),
      dailyCapacityCases: after.dailyCapacityCases,
      committedToday: after.committedToday,
      stock: after.stock,
    },
  });
}
