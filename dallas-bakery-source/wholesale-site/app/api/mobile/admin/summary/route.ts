/**
 * The first screen the owner sees in the morning: what the day owes, what is
 * ready to go, what is waiting on a decision, and what is owed in money.
 *
 * One request rather than five, because this is loaded standing at the bench
 * on a phone that may be on the bakery's wifi.
 */

import { sql } from "drizzle-orm";

import { getDb } from "../../../../../db";
import { supportCases, wholesaleApplications } from "../../../../../db/schema";
import { bakeSheet, daySummary } from "../../../../bake-sheet.ts";
import { mobileJson, requireMobileAdmin } from "../../../../mobile-admin-auth.ts";
import { bakeryDayStartIso } from "../../../../order-rules.ts";
import { listOrders } from "../../../../orders-service.ts";
import { upsConfigured, upsIsProduction } from "../../../../ups-shipping.ts";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireMobileAdmin(request);
  if (!auth.ok) return auth.response;

  const db = getDb();
  // Two reads: the queue drives the bake and ship numbers, the full list
  // drives the money, because an invoice outlives the queue.
  const [open, all] = await Promise.all([
    listOrders({ status: "unshipped" }),
    listOrders({ status: "all" }),
  ]);
  const today = bakeryDayStartIso().slice(0, 10);

  const [{ waiting }] = await db
    .select({ waiting: sql<number>`COUNT(*)` })
    .from(wholesaleApplications)
    .where(sql`${wholesaleApplications.status} = 'pending'`);

  const [{ problems }] = await db
    .select({ problems: sql<number>`COUNT(*)` })
    .from(supportCases)
    .where(sql`${supportCases.status} != 'resolved'`);

  return mobileJson({
    today,
    summary: daySummary(open, all, today),
    bakeSheet: bakeSheet(open),
    applicationsWaiting: Number(waiting || 0),
    problemsOpen: Number(problems || 0),
    ups: { connected: upsConfigured(), environment: upsIsProduction() ? "production" : "test" },
  });
}
