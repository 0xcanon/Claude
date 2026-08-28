/**
 * The confirmation screen's data source.
 *
 * After the card clears, the client knows its PaymentIntent id but the order
 * row is written by the Stripe webhook, which can land a moment later. This
 * answers "is it recorded yet?" so the app and the site can show a real order
 * number instead of guessing, and can keep polling briefly if it is not.
 *
 * The buyer's session must own the order: the email on the row has to match
 * the signed-in email, so an id from someone else's receipt returns nothing.
 */

import { and, eq } from "drizzle-orm";

import { getDb } from "../../../../db";
import { orders } from "../../../../db/schema";
import { BuyerAuthError, requireBuyer } from "../../../buyer-auth.ts";
import { retrievePaymentIntent } from "../../../stripe.ts";

export const dynamic = "force-dynamic";

function trackingUrl(trackingNumber: string) {
  return trackingNumber ? `https://www.ups.com/track?tracknum=${trackingNumber}` : "";
}

export async function GET(request: Request) {
  try {
    const buyer = await requireBuyer(request);
    const paymentIntentId = new URL(request.url).searchParams.get("paymentIntent") || "";
    if (!/^pi_[A-Za-z0-9_]+$/.test(paymentIntentId)) {
      return Response.json({ error: "Unknown payment." }, { status: 400 });
    }

    const [order] = await getDb()
      .select()
      .from(orders)
      .where(and(
        eq(orders.stripePaymentIntentId, paymentIntentId),
        eq(orders.email, buyer.email),
      ))
      .limit(1);

    if (order) {
      const items = JSON.parse(order.itemsJson || "[]") as { quantity?: number }[];
      // Wholesale line quantities are case counts, so their sum is the cases
      // on the order.
      const caseCount = items.reduce((total, item) => total + Number(item.quantity || 0), 0);
      return Response.json({
        status: "recorded",
        order: {
          id: order.id,
          name: `#${order.orderNumber}`,
          placedAt: order.createdAt,
          caseCount,
          boxCount: order.boxCount,
          loafCount: order.loafCount,
          subtotal: (order.subtotalCents / 100).toFixed(2),
          shipping: (order.shippingCents / 100).toFixed(2),
          total: (order.totalCents / 100).toFixed(2),
          currencyCode: "USD",
          items,
          trackingNumber: order.trackingNumber,
          statusPageUrl: trackingUrl(order.trackingNumber),
          deliverTo: {
            name: order.customerName,
            street: order.street,
            street2: order.street2,
            city: order.city,
            state: order.state,
            zip: order.zip,
          },
        },
      }, { headers: { "Cache-Control": "no-store" } });
    }

    // Not recorded yet. Ask Stripe directly so the buyer is told the truth:
    // a captured payment is safe and simply awaiting intake, while a payment
    // that never succeeded must not look like a placed order.
    const intent = await retrievePaymentIntent(paymentIntentId);
    const paid = intent.ok && intent.data.status === "succeeded";
    if (intent.ok && intent.data.metadata?.applicationId !== buyer.applicationId) {
      return Response.json({ error: "Unknown payment." }, { status: 404 });
    }

    return Response.json({
      status: paid ? "pending" : "unpaid",
      paymentStatus: intent.ok ? intent.data.status || "unknown" : "unknown",
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (caught) {
    if (caught instanceof BuyerAuthError) {
      return Response.json({ error: caught.message }, { status: caught.status });
    }
    console.error("Order status failed:", caught);
    return Response.json({ error: "Order status could not be loaded." }, { status: 500 });
  }
}
