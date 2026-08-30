/**
 * How much bread is still available today.
 *
 * A product can carry a daily capacity — the number of cases the bakery can
 * actually bake in a day. This module counts what today's orders have already
 * committed, so the catalog can stop selling the fifty-first case of a bread
 * the ovens can only make fifty of. Refunded orders release their cases back.
 *
 * Capacity is a soft, owner-set number: leaving it at 0 means "no limit", and
 * that is the default, so a bakery that never wants this simply never sets it.
 */

import { sql } from "drizzle-orm";

import { getDb } from "../db";
import { orders } from "../db/schema";
import { bakeryDayStartIso } from "./order-rules.ts";
import type { CommittedCases } from "./catalog-pricing.ts";

// The wording of a stock state is pure arithmetic, so it lives with the rest
// of the pure catalog logic and is re-exported here for callers that already
// import this module.
export { stockStateFor, type StockState, type CommittedCases } from "./catalog-pricing.ts";

/**
 * Sums today's committed cases per SKU. Line items are read out of each
 * order's stored JSON rather than a join table: an order snapshots what it
 * sold, and that snapshot is what the ovens have to produce.
 */
export async function committedCasesToday(now: Date = new Date()): Promise<CommittedCases> {
  const rows = await getDb()
    .select({ itemsJson: orders.itemsJson })
    .from(orders)
    .where(
      sql`${orders.createdAt} >= ${bakeryDayStartIso(now)} AND ${orders.status} != 'refunded' AND ${orders.channel} = 'wholesale'`,
    );

  const committed: CommittedCases = {};
  for (const row of rows) {
    let items: Array<{ sku?: string; quantity?: number }>;
    try {
      items = JSON.parse(row.itemsJson || "[]");
    } catch {
      // A malformed snapshot must not take down the catalog; it just does not
      // count toward capacity.
      continue;
    }
    if (!Array.isArray(items)) continue;
    for (const item of items) {
      const sku = String(item?.sku || "");
      const cases = Number(item?.quantity);
      if (!sku || !Number.isFinite(cases) || cases <= 0) continue;
      committed[sku] = (committed[sku] || 0) + cases;
    }
  }
  return committed;
}
