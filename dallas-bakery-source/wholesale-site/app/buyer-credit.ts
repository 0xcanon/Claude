/**
 * A buyer's credit position, database-backed.
 *
 * The limit lives on the wholesale application (granted in /admin); the
 * outstanding balance is the sum of that business's unpaid account orders.
 * The arithmetic and the "does one more order fit" rule live in
 * credit-terms.ts (pure) — this module only loads the numbers.
 */

import { and, eq, isNull, ne, sql } from "drizzle-orm";

import { getDb } from "../db";
import { orders, wholesaleApplications } from "../db/schema";
import { computeCreditState, type CreditState } from "./credit-terms.ts";

export type { CreditState } from "./credit-terms.ts";

export async function creditStateFor(applicationId: string): Promise<CreditState> {
  const id = String(applicationId || "").trim();
  if (!id) return computeCreditState(0, 0);
  const db = getDb();
  const [application] = await db
    .select({
      creditLimitCents: wholesaleApplications.creditLimitCents,
      creditTermsDays: wholesaleApplications.creditTermsDays,
    })
    .from(wholesaleApplications)
    .where(eq(wholesaleApplications.id, id))
    .limit(1);
  // Refunded account orders were cancelled before invoicing and never owe
  // anything, so they don't hold credit. The overdue slice — unpaid past its
  // due date — locks the account until the owner marks it settled.
  const [balance] = await db
    .select({
      outstandingCents: sql<number>`COALESCE(SUM(${orders.totalCents}), 0)`,
      overdueCents: sql<number>`COALESCE(SUM(CASE WHEN ${orders.invoiceDueAt} IS NOT NULL AND ${orders.invoiceDueAt} < date('now') THEN ${orders.totalCents} ELSE 0 END), 0)`,
    })
    .from(orders)
    .where(and(
      eq(orders.applicationId, id),
      eq(orders.paymentTerms, "account"),
      isNull(orders.invoicePaidAt),
      ne(orders.status, "refunded"),
    ));
  return computeCreditState(
    application?.creditLimitCents ?? 0,
    Number(balance?.outstandingCents || 0),
    application?.creditTermsDays ?? 0,
    Number(balance?.overdueCents || 0),
  );
}
