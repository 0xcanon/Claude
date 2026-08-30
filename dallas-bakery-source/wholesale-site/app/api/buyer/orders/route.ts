/**
 * The buyer's own order history, with tracking.
 *
 * Scoped to the signed-in email, so an order belonging to another business is
 * never returned. Every field the "My orders" screens render — stage, cases,
 * boxes, totals, and the UPS tracking link — comes from here, so the app and
 * the website cannot drift apart on what an order says.
 */

import { desc, eq } from "drizzle-orm";

import { getDb } from "../../../../db";
import { orders } from "../../../../db/schema";
import { BuyerAuthError, requireBuyer } from "../../../buyer-auth.ts";
import { buyerEventsForOrder, readableActor } from "../../../order-events.ts";
import {
  buyerStage,
  canRequestCancellation,
  isTrackable,
  trackingUrl,
} from "../../../order-status.ts";

export const dynamic = "force-dynamic";

type StoredItem = { sku?: string; name?: string; quantity?: number; unitAmountCents?: number };

export async function GET(request: Request) {
  try {
    const buyer = await requireBuyer(request);

    // ?id=… asks for one order's story instead of the list: what happened,
    // when, and who did it. Only buyer-visible lines — the bakery's own
    // notes on an order stay with the bakery.
    const wantedId = new URL(request.url).searchParams.get("id") || "";
    if (wantedId) {
      const [one] = await getDb()
        .select()
        .from(orders)
        .where(eq(orders.id, wantedId))
        .limit(1);
      if (!one || one.email !== buyer.email) {
        return Response.json({ error: "That order isn't on your account." }, { status: 404 });
      }
      const events = await buyerEventsForOrder(one.id);
      return Response.json({
        id: one.id,
        orderNumber: one.orderNumber,
        stage: buyerStage(one.status).key,
        holdReason: one.holdReason,
        cancelRequested: Boolean(one.cancelRequestedAt),
        canRequestCancellation: canRequestCancellation(one.status, one.cancelRequestedAt),
        refunded: (one.refundedCents / 100).toFixed(2),
        timeline: events.map((event) => ({
          id: event.id,
          kind: event.kind,
          summary: event.summary,
          who: readableActor(event.actor),
          at: event.createdAt,
        })),
      }, { headers: { "Cache-Control": "no-store" } });
    }

    const rows = await getDb()
      .select()
      .from(orders)
      .where(eq(orders.email, buyer.email))
      .orderBy(desc(orders.orderNumber))
      .limit(50);

    return Response.json({
      orders: rows.map((order) => {
        const items = JSON.parse(order.itemsJson || "[]") as StoredItem[];
        // Wholesale line quantities are case counts.
        const caseCount = items.reduce((total, item) => total + Number(item.quantity || 0), 0);
        const stage = buyerStage(order.status);
        const trackable = isTrackable(order.status, order.trackingNumber);

        return {
          id: order.id,
          name: `#${order.orderNumber}`,
          processedAt: order.createdAt,
          shippedAt: order.shippedAt,

          // Stage, in the buyer's language.
          stage: stage.key,
          stageLabel: stage.label,
          stageDetail: stage.detail,
          stageStep: stage.step,

          // Tracking. `trackable` is what the UI gates the button on: a
          // tracking number exists from the moment a label is bought, but UPS
          // has nothing to show until the parcel is scanned.
          trackable,
          trackingNumber: trackable ? order.trackingNumber : "",
          trackingUrl: trackable ? trackingUrl(order.trackingNumber) : "",

          caseCount,
          boxCount: order.boxCount,
          loafCount: order.loafCount,
          items,

          subtotal: (order.subtotalCents / 100).toFixed(2),
          shipping: (order.shippingCents / 100).toFixed(2),
          total: { amount: (order.totalCents / 100).toFixed(2), currencyCode: "USD" },

          // "account" orders were placed on credit and are invoiced; the
          // buyer's screens badge them so a card charge is never implied.
          paymentTerms: order.paymentTerms === "account" ? "account" : "card",
          invoicePaid: Boolean(order.invoicePaidAt),
          invoiceDueAt: order.invoiceDueAt || "",

          deliverTo: {
            name: order.customerName,
            street: order.street,
            street2: order.street2,
            city: order.city,
            state: order.state,
            zip: order.zip,
          },

          // What the buyer is allowed to ask for on this order. Decided
          // here rather than in the app, so the website and the app can
          // never disagree about whether it is too late to cancel.
          canRequestCancellation: canRequestCancellation(order.status, order.cancelRequestedAt),
          cancelRequested: Boolean(order.cancelRequestedAt),
          holdReason: order.holdReason,
          refunded: (order.refundedCents / 100).toFixed(2),

          // Kept for older app builds that read these names.
          fulfillmentStatus: order.status === "shipped" ? "FULFILLED" : "UNFULFILLED",
          financialStatus: "PAID",
          statusPageUrl: trackable ? trackingUrl(order.trackingNumber) : "",
        };
      }),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (caught) {
    if (caught instanceof BuyerAuthError) {
      return Response.json({ error: caught.message }, { status: caught.status });
    }
    console.error("Buyer orders failed:", caught);
    return Response.json({ error: "Orders could not be loaded." }, { status: 500 });
  }
}
