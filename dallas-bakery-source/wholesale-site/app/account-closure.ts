/**
 * Closing a wholesale account, from inside the app.
 *
 * Apple requires any app that supports account creation to let a customer
 * delete that account from within the app — not by emailing someone. This is
 * the machinery behind that button.
 *
 * A wholesale account cannot simply vanish. The bakery has to keep what it
 * sold, to whom, and for how much: sales-tax records, the shipping record on
 * a delivered box, and any invoice still owed. So closing an account does the
 * honest version of deletion — everything personal that is ours to erase is
 * erased, the order records stay as the financial history they are, and the
 * buyer is told plainly which is which before they confirm.
 *
 * What is erased: the business and contact details on the account, saved
 * delivery addresses, the saved card (deleted at Stripe too), sign-in codes,
 * standing weekly orders, exclusive prices, push devices, and the marketing
 * list entry.
 *
 * What is kept: past orders, with the name and address they shipped to, and
 * any unpaid invoice. Those are the bakery's books.
 */

import { and, eq, isNull, sql } from "drizzle-orm";

import { getDb } from "../db";
import {
  buyerLocations,
  buyerLoginCodes,
  customerPrices,
  marketingSubscribers,
  orders,
  pushDevices,
  standingOrders,
  wholesaleApplications,
} from "../db/schema";
import { creditStateFor } from "./buyer-credit.ts";
import { MAX_CLOSE_REASON_LENGTH, closedEmailFor } from "./account-closure-rules.ts";
import { deleteCustomer } from "./stripe.ts";

export { MAX_CLOSE_REASON_LENGTH, closedEmailFor } from "./account-closure-rules.ts";

export type ClosurePreview = {
  businessName: string;
  email: string;
  /** Orders that will be kept as the bakery's financial record. */
  orderCount: number;
  /** Saved delivery addresses that will be erased. */
  locationCount: number;
  /** True when a standing weekly order will be cancelled. */
  hasStandingOrder: boolean;
  /** True when a saved card will be removed from Stripe. */
  hasSavedCard: boolean;
  /** True when this device family is registered for notifications. */
  pushDeviceCount: number;
  /** True when the buyer is on the marketing list. */
  onMarketingList: boolean;
  /** Money still owed on unpaid invoices. Closing does not cancel it. */
  outstandingCents: number;
  overdueCents: number;
};

/**
 * What closing this account would do, so the app can say it plainly before
 * anything is destroyed. Nothing here changes any data.
 */
export async function previewClosure(applicationId: string): Promise<ClosurePreview | null> {
  const db = getDb();
  const [account] = await db
    .select()
    .from(wholesaleApplications)
    .where(and(eq(wholesaleApplications.id, applicationId), isNull(wholesaleApplications.closedAt)))
    .limit(1);
  if (!account) return null;

  const [[orderRow], locations, [standing], devices, [subscriber], credit] = await Promise.all([
    db
      .select({ count: sql<number>`COUNT(*)` })
      .from(orders)
      .where(and(eq(orders.applicationId, applicationId), sql`${orders.status} != 'refunded'`)),
    db.select({ id: buyerLocations.id }).from(buyerLocations).where(eq(buyerLocations.applicationId, applicationId)),
    db
      .select({ active: standingOrders.active })
      .from(standingOrders)
      .where(eq(standingOrders.applicationId, applicationId))
      .limit(1),
    db.select({ token: pushDevices.token }).from(pushDevices).where(eq(pushDevices.applicationId, applicationId)),
    db
      .select({ unsubscribedAt: marketingSubscribers.unsubscribedAt })
      .from(marketingSubscribers)
      .where(eq(marketingSubscribers.email, account.email))
      .limit(1),
    creditStateFor(applicationId),
  ]);

  return {
    businessName: account.businessName,
    email: account.email,
    orderCount: Number(orderRow?.count || 0),
    locationCount: locations.length,
    hasStandingOrder: Boolean(standing?.active),
    hasSavedCard: Boolean(account.stripeCustomerId),
    pushDeviceCount: devices.length,
    onMarketingList: Boolean(subscriber && !subscriber.unsubscribedAt),
    outstandingCents: credit.outstandingCents,
    overdueCents: credit.overdueCents,
  };
}

export type ClosureResult = {
  ok: true;
  businessName: string;
  /** Orders kept as the bakery's financial record. */
  ordersRetained: number;
  outstandingCents: number;
} | {
  ok: false;
  error: string;
};

/**
 * Closes the account. Irreversible.
 *
 * Deliberately NOT blocked by an unpaid invoice. A buyer is entitled to leave
 * whether or not they owe money, and refusing to close the account until they
 * pay would turn a privacy right into a collections lever. The debt survives
 * in the order records, the owner is told, and the buyer is told before they
 * confirm — that is the honest arrangement.
 */
export async function closeAccount(
  applicationId: string,
  reason = "",
): Promise<ClosureResult> {
  const db = getDb();
  const [account] = await db
    .select()
    .from(wholesaleApplications)
    .where(and(eq(wholesaleApplications.id, applicationId), isNull(wholesaleApplications.closedAt)))
    .limit(1);
  if (!account) return { ok: false, error: "That account is already closed." };

  const credit = await creditStateFor(applicationId);
  const [orderRow] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(orders)
    .where(eq(orders.applicationId, applicationId));

  // The saved card lives at Stripe, so erasing it means asking Stripe to.
  // A failure here must not strand the buyer with a half-closed account —
  // it is logged loudly and the closure continues; past charges are kept by
  // Stripe either way, as the payment record.
  if (account.stripeCustomerId) {
    const removed = await deleteCustomer(account.stripeCustomerId);
    if (!removed.ok) {
      console.error(
        `Account ${applicationId} closed but Stripe customer ${account.stripeCustomerId} ` +
        `could not be deleted (${removed.message}). Remove it by hand in the Stripe dashboard.`,
      );
    }
  }

  // Everything that is only ever about this buyer goes.
  await db.delete(buyerLocations).where(eq(buyerLocations.applicationId, applicationId));
  await db.delete(standingOrders).where(eq(standingOrders.applicationId, applicationId));
  await db.delete(customerPrices).where(eq(customerPrices.applicationId, applicationId));
  await db.delete(pushDevices).where(eq(pushDevices.applicationId, applicationId));
  await db.delete(buyerLoginCodes).where(eq(buyerLoginCodes.email, account.email));
  await db.delete(marketingSubscribers).where(eq(marketingSubscribers.email, account.email));

  // The account row itself stays — order records point at it — but nothing
  // personal stays on it. The placeholder email keeps the column unique and
  // cannot route anywhere.
  await db
    .update(wholesaleApplications)
    .set({
      closedAt: sql`CURRENT_TIMESTAMP`,
      closedReason: String(reason || "").slice(0, MAX_CLOSE_REASON_LENGTH),
      businessName: "Closed account",
      contactName: "",
      email: closedEmailFor(applicationId),
      phone: "",
      website: "",
      street: "",
      street2: "",
      city: "",
      state: "",
      zip: "",
      additionalMarkets: "",
      standardizedAddress: "",
      matchedBusiness: "",
      ownerNotes: "",
      stripeCustomerId: "",
      // Kills the application-tracking link and any live sign-in path.
      trackingTokenHash: "",
      trackingTokenIssuedAt: 0,
      updatedAt: sql`CURRENT_TIMESTAMP`,
    })
    .where(eq(wholesaleApplications.id, applicationId));

  return {
    ok: true,
    businessName: account.businessName,
    ordersRetained: Number(orderRow?.count || 0),
    outstandingCents: credit.outstandingCents,
  };
}
