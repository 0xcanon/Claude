/**
 * Places a wholesale order on the buyer's credit line — no card involved.
 *
 * Only buyers the owner granted a credit limit can use this, and only while
 * the order fits their available credit. Pricing is identical to the card
 * path: the client sends SKUs and case counts, the server prices them (the
 * buyer's exclusive prices included), so terms never change what an order
 * costs. The order is recorded immediately — there is no webhook to wait
 * for — and the response carries the recorded order in the same shape the
 * order-status endpoint returns, so confirmation screens need no polling.
 *
 * Two simultaneous orders could each pass the credit check before the other
 * records; for a bakery whose buyers order once a day that window is
 * accepted, and the owner sees every account order in /admin either way.
 */

import { eq } from "drizzle-orm";

import { getDb } from "../../../../db";
import { orders } from "../../../../db/schema";
import { BuyerAuthError, requireBuyer } from "../../../buyer-auth.ts";
import { creditStateFor } from "../../../buyer-credit.ts";
import { resolveDeliveryLocation } from "../../../buyer-locations.ts";
import { assessAccountOrder } from "../../../credit-terms.ts";
import { priceOverridesFor } from "../../../customer-pricing.ts";
import {
  buyerOrderConfirmationEmail,
  ownerNewOrderEmail,
  sendMail,
} from "../../../email-notifications.ts";
import { cutoffState } from "../../../order-rules.ts";
import { recordOrder } from "../../../orders-service.ts";
import { getWholesaleShippingSettings } from "../../../shipping-settings.ts";
import { priceCart, type CartLine } from "../../../wholesale-catalog.ts";

export const dynamic = "force-dynamic";

function trackingUrl(trackingNumber: string) {
  return trackingNumber ? `https://www.ups.com/track?tracknum=${trackingNumber}` : "";
}

export async function POST(request: Request) {
  try {
    const buyer = await requireBuyer(request);

    let body: { lines?: CartLine[]; locationId?: string };
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Invalid request." }, { status: 400 });
    }

    const credit = await creditStateFor(buyer.applicationId);
    const shipping = await getWholesaleShippingSettings();
    const overrides = await priceOverridesFor(buyer.applicationId);
    const cart = await priceCart(Array.isArray(body.lines) ? body.lines : [], shipping, overrides);
    if (!cart.ok) return Response.json({ error: cart.error }, { status: 400 });

    // 400, not 403: clients treat 401/403 as an expired session, and a full
    // credit line is a checkout problem, not an authentication one.
    const verdict = assessAccountOrder(credit, cart.totalCents);
    if (!verdict.ok) return Response.json({ error: verdict.error, credit }, { status: 400 });

    const deliverTo = await resolveDeliveryLocation(buyer, String(body.locationId || ""));
    const shipsToday = cutoffState().shipsToday;

    const items = cart.lines.map((line) => ({
      sku: line.sku,
      name: line.title,
      quantity: line.cases,
      unitAmountCents: line.unitAmountCents,
    }));

    const result = await recordOrder({
      channel: "wholesale",
      // No Stripe object exists for an account order; a synthetic unique id
      // fills the dedupe column the same way an intent id does for cards.
      stripeSessionId: `acct_${crypto.randomUUID()}`,
      stripePaymentIntentId: "",
      customerName: deliverTo.name,
      email: buyer.email,
      phone: buyer.phone,
      street: deliverTo.street,
      street2: deliverTo.street2,
      city: deliverTo.city,
      state: deliverTo.state,
      zip: deliverTo.zip,
      items,
      loafCount: cart.loafCount,
      caseCount: cart.caseCount,
      subtotalCents: cart.subtotalCents,
      shippingCents: cart.shippingCents,
      totalCents: cart.totalCents,
      applicationId: buyer.applicationId,
      paymentTerms: "account",
    });

    const emailDetails = {
      channel: "wholesale",
      orderNumber: result.orderNumber,
      customerName: deliverTo.name,
      email: buyer.email,
      city: deliverTo.city,
      state: deliverTo.state,
      items: items.map((item) => ({ name: item.name, quantity: item.quantity })),
      caseCount: cart.caseCount,
      boxCount: cart.boxCount,
      loafCount: cart.loafCount,
      subtotalCents: cart.subtotalCents,
      shippingCents: cart.shippingCents,
      totalCents: cart.totalCents,
      shipsToday,
      paymentTerms: "account" as const,
    };
    await sendMail(ownerNewOrderEmail(emailDetails));
    await sendMail(buyerOrderConfirmationEmail(emailDetails));

    const [order] = await getDb().select().from(orders).where(eq(orders.id, result.id)).limit(1);
    if (!order) {
      // Should be unreachable — the insert just happened — but never leave
      // the buyer without confirmation that the order exists.
      return Response.json({ status: "recorded", orderNumber: result.orderNumber });
    }

    return Response.json({
      status: "recorded",
      order: {
        id: order.id,
        name: `#${order.orderNumber}`,
        placedAt: order.createdAt,
        caseCount: cart.caseCount,
        boxCount: order.boxCount,
        loafCount: order.loafCount,
        subtotal: (order.subtotalCents / 100).toFixed(2),
        shipping: (order.shippingCents / 100).toFixed(2),
        total: (order.totalCents / 100).toFixed(2),
        currencyCode: "USD",
        items,
        trackingNumber: order.trackingNumber,
        statusPageUrl: trackingUrl(order.trackingNumber),
        paymentTerms: "account",
        deliverTo: {
          name: order.customerName,
          street: order.street,
          street2: order.street2,
          city: order.city,
          state: order.state,
          zip: order.zip,
        },
      },
      credit: await creditStateFor(buyer.applicationId),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (caught) {
    if (caught instanceof BuyerAuthError) {
      return Response.json({ error: caught.message }, { status: caught.status });
    }
    console.error("Order on account failed:", caught);
    return Response.json({ error: "The order could not be placed. Try again in a moment." }, { status: 500 });
  }
}
