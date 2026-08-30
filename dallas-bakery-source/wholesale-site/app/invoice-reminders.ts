/**
 * The daily nudge on unpaid invoices.
 *
 * Runs from the same cron that charges standing orders. Three moments matter
 * to a buyer on net terms: three days before the due date, the morning it is
 * due, and once a week after it goes past due — at which point their account
 * is locked to card payment and they need to know why.
 *
 * Deliberately quiet: at most one push per invoice per run, and no push at
 * all on the days in between. The cadence itself lives in credit-terms.ts,
 * where it is unit-testable without a database.
 */

import { and, eq, isNull, sql } from "drizzle-orm";

import { getDb } from "../db";
import { orders } from "../db/schema";
import { reminderKindFor, type ReminderKind } from "./credit-terms.ts";
import { invoiceDuePush, invoiceOverduePush } from "./push-messages.ts";
import { pushToBuyer } from "./push-notifications.ts";

export type ReminderOutcome = {
  orderNumber: number;
  applicationId: string;
  kind: ReminderKind;
  devices: number;
};

/**
 * Sends today's invoice reminders. Only unpaid, unrefunded account orders
 * with a due date are considered; everything else was settled at checkout.
 */
export async function runInvoiceReminders(today = new Date()): Promise<ReminderOutcome[]> {
  const asOf = today.toISOString().slice(0, 10);
  const rows = await getDb()
    .select({
      orderNumber: orders.orderNumber,
      applicationId: orders.applicationId,
      invoiceDueAt: orders.invoiceDueAt,
    })
    .from(orders)
    .where(
      and(
        eq(orders.paymentTerms, "account"),
        isNull(orders.invoicePaidAt),
        sql`${orders.status} != 'refunded'`,
        sql`${orders.invoiceDueAt} IS NOT NULL`,
      ),
    )
    .limit(1000);

  const outcomes: ReminderOutcome[] = [];
  for (const row of rows) {
    if (!row.applicationId || !row.invoiceDueAt) continue;
    const due = String(row.invoiceDueAt).slice(0, 10);
    const daysUntilDue = Math.round(
      (new Date(`${due}T00:00:00Z`).getTime() - new Date(`${asOf}T00:00:00Z`).getTime()) / 86_400_000,
    );
    if (!Number.isFinite(daysUntilDue)) continue;

    const kind = reminderKindFor(daysUntilDue);
    if (!kind) continue;

    const message = kind === "overdue"
      ? invoiceOverduePush({ orderNumber: row.orderNumber })
      : invoiceDuePush({ orderNumber: row.orderNumber, daysUntilDue });
    const devices = await pushToBuyer(row.applicationId, message);
    outcomes.push({ orderNumber: row.orderNumber, applicationId: row.applicationId, kind, devices });
  }
  return outcomes;
}
