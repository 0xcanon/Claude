/**
 * Standing weekly orders: "every Tuesday, these cases."
 *
 * A daily cron calls runDueStandingOrders. For each active order whose
 * weekday matches today (Central time), the buyer's saved card is charged
 * off-session through a PaymentIntent tagged exactly like a checkout payment,
 * so the existing Stripe webhook records it, the owner is alerted, and the
 * buyer gets the same confirmation email — one intake path, not two.
 *
 * Idempotency is layered: `lastRunDate` skips a same-day re-run, and the
 * PaymentIntent's idempotency key (application id + date) means even a
 * crashed run retried by the next cron can never charge twice.
 */

import { eq, sql } from "drizzle-orm";

import { getDb } from "../db";
import { standingOrders } from "../db/schema";
import { findApprovedBuyer, type ApprovedBuyer } from "./buyer-auth.ts";
import { resolveDeliveryLocation } from "./buyer-locations.ts";
import { sendMail, standingOrderProblemEmail } from "./email-notifications.ts";
import { getWholesaleShippingSettings } from "./shipping-settings.ts";
import { centralDateString, isDueToday } from "./standing-schedule.ts";
import { createPaymentIntent, listCardPaymentMethods } from "./stripe.ts";
import { getOrCreateStripeCustomer } from "./stripe-customers.ts";
import { priceOverridesFor } from "./customer-pricing.ts";
import { decodeCartLines, encodeCartLines, priceCart } from "./wholesale-catalog.ts";

export type StandingOrderRow = typeof standingOrders.$inferSelect;

export async function getStandingOrder(applicationId: string) {
  const [row] = await getDb()
    .select()
    .from(standingOrders)
    .where(eq(standingOrders.applicationId, applicationId))
    .limit(1);
  return row || null;
}

export async function setStandingOrder(input: {
  applicationId: string;
  email: string;
  weekday: number;
  lines: { sku: string; cases: number }[];
  locationId: string;
}) {
  const encoded = encodeCartLines(input.lines);
  await getDb()
    .insert(standingOrders)
    .values({
      applicationId: input.applicationId,
      email: input.email,
      weekday: input.weekday,
      lines: encoded,
      locationId: input.locationId,
      active: true,
    })
    .onConflictDoUpdate({
      target: standingOrders.applicationId,
      set: {
        email: input.email,
        weekday: input.weekday,
        lines: encoded,
        locationId: input.locationId,
        active: true,
        updatedAt: sql`CURRENT_TIMESTAMP`,
      },
    });
}

export async function pauseStandingOrder(applicationId: string) {
  await getDb()
    .update(standingOrders)
    .set({ active: false, updatedAt: sql`CURRENT_TIMESTAMP` })
    .where(eq(standingOrders.applicationId, applicationId));
}

async function markRun(applicationId: string, date: string, status: string) {
  await getDb()
    .update(standingOrders)
    .set({ lastRunDate: date, lastRunStatus: status, updatedAt: sql`CURRENT_TIMESTAMP` })
    .where(eq(standingOrders.applicationId, applicationId));
}

async function chargeStandingOrder(order: StandingOrderRow, buyer: ApprovedBuyer, today: string) {
  const shipping = await getWholesaleShippingSettings();
  // The buyer's exclusive prices apply to standing runs the same as checkout.
  const cart = await priceCart(decodeCartLines(order.lines), shipping, await priceOverridesFor(order.applicationId));
  if (!cart.ok) return { ok: false as const, reason: `cart: ${cart.error}` };

  const customerId = await getOrCreateStripeCustomer(buyer);
  if (!customerId) return { ok: false as const, reason: "no Stripe customer" };
  const methods = await listCardPaymentMethods(customerId);
  const card = methods.ok ? methods.data.data?.[0] : undefined;
  if (!card) return { ok: false as const, reason: "no saved card" };

  const deliverTo = await resolveDeliveryLocation(buyer, order.locationId);
  const intent = await createPaymentIntent(
    {
      amount: cart.totalCents,
      currency: "usd",
      customer: customerId,
      payment_method: card.id,
      confirm: true,
      off_session: true,
      payment_method_types: ["card"],
      receipt_email: buyer.email,
      description: `Dallas Bakery standing order — ${cart.caseCount} case${cart.caseCount === 1 ? "" : "s"}`,
      statement_descriptor_suffix: "WHOLESALE",
      metadata: {
        channel: "wholesale",
        source: "wholesale-order",
        origin: "standing-order",
        applicationId: buyer.applicationId,
        lines: encodeCartLines(cart.lines),
        caseCount: String(cart.caseCount),
        loafCount: String(cart.loafCount),
        boxCount: String(cart.boxCount),
        subtotalCents: String(cart.subtotalCents),
        shippingCents: String(cart.shippingCents),
        businessName: buyer.businessName.slice(0, 200),
        contactName: buyer.contactName.slice(0, 200),
        phone: buyer.phone.slice(0, 40),
        locationName: deliverTo.name.slice(0, 200),
        street: deliverTo.street.slice(0, 200),
        street2: deliverTo.street2.slice(0, 200),
        city: deliverTo.city.slice(0, 100),
        state: deliverTo.state.slice(0, 10),
        zip: deliverTo.zip.slice(0, 20),
      },
    },
    // One charge per business per day, even across crashed and retried runs.
    `standing-${order.applicationId}-${today}`,
  );
  if (!intent.ok) return { ok: false as const, reason: intent.message };
  if (intent.data.status !== "succeeded" && intent.data.status !== "processing") {
    return { ok: false as const, reason: `payment ${intent.data.status || "failed"}` };
  }
  return { ok: true as const };
}

/**
 * The daily cron body. Every failure is contained to its own standing order
 * and reported to that buyer — one declined card never stops the next
 * business's bread.
 */
export async function runDueStandingOrders(now: Date = new Date()) {
  const today = centralDateString(now);
  const rows = await getDb()
    .select()
    .from(standingOrders)
    .where(eq(standingOrders.active, true));

  const outcomes: { applicationId: string; ok: boolean; reason?: string }[] = [];
  for (const order of rows) {
    if (!isDueToday(order, now)) continue;
    try {
      const buyer = await findApprovedBuyer(order.email);
      const result = buyer
        ? await chargeStandingOrder(order, buyer, today)
        : { ok: false as const, reason: "account no longer approved" };
      await markRun(order.applicationId, today, result.ok ? "charged" : `failed: ${result.reason}`);
      if (!result.ok) {
        console.error(`Standing order for ${order.email} failed: ${result.reason}`);
        await sendMail(standingOrderProblemEmail(order.email, result.reason || "payment failed"));
      }
      outcomes.push({ applicationId: order.applicationId, ok: result.ok, reason: result.ok ? undefined : result.reason });
    } catch (caught) {
      const reason = caught instanceof Error ? caught.message : "unexpected error";
      console.error(`Standing order for ${order.email} crashed: ${reason}`);
      await markRun(order.applicationId, today, `failed: ${reason}`);
      outcomes.push({ applicationId: order.applicationId, ok: false, reason });
    }
  }
  return outcomes;
}
