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
 * The balance can NEVER pass the limit. Two simultaneous orders could each
 * pass the credit check before the other records, so after recording, the
 * balance is re-checked — an order that pushed it past the limit is removed
 * again and refused, exactly as if the check had caught it up front.
 */

import { eq } from "drizzle-orm";

import { getDb } from "../../../../db";
import { orders } from "../../../../db/schema";
import { BuyerAuthError, requireBuyer } from "../../../buyer-auth.ts";
import { creditStateFor } from "../../../buyer-credit.ts";
import { resolveDeliveryLocation } from "../../../buyer-locations.ts";
import { assessAccountOrder, invoiceDueDateIso, netTermsLabel, overLimitMessage } from "../../../credit-terms.ts";
import { priceOverridesFor } from "../../../customer-pricing.ts";
import {
  buyerOrderConfirmationEmail,
  ownerNewOrderEmail,
  sendMail,
} from "../../../email-notifications.ts";
import { validateRequestedDeliveryDate } from "../../../delivery-dates.ts";
import { cutoffState, normalizePoNumber, validatePoNumber } from "../../../order-rules.ts";
import { recordOrder } from "../../../orders-service.ts";
import { orderPlacedPush, ownerNewOrderPush } from "../../../push-messages.ts";
import { pushToBuyer, pushToOwner } from "../../../push-notifications.ts";
import { getWholesaleShippingSettings } from "../../../shipping-settings.ts";
import { priceCart, type CartLine } from "../../../wholesale-catalog.ts";

export const dynamic = "force-dynamic";

function trackingUrl(trackingNumber: string) {
  return trackingNumber ? `https://www.ups.com/track?tracknum=${trackingNumber}` : "";
}

export async function POST(request: Request) {
  try {
    const buyer = await requireBuyer(request);

    let body: {
      lines?: CartLine[];
      locationId?: string;
      poNumber?: string;
      requestedDeliveryDate?: string;
    };
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Invalid request." }, { status: 400 });
    }

    const poProblem = validatePoNumber(body.poNumber);
    if (poProblem) return Response.json({ error: poProblem }, { status: 400 });
    const poNumber = normalizePoNumber(body.poNumber);

    const requestedDeliveryDate = String(body.requestedDeliveryDate || "").trim();
    const dateProblem = validateRequestedDeliveryDate(requestedDeliveryDate);
    if (dateProblem) return Response.json({ error: dateProblem }, { status: 400 });

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
    // The invoice due date is fixed now, from this customer's net terms.
    const invoiceDueAt = invoiceDueDateIso(new Date(), credit.termsDays);

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
      invoiceDueAt,
      poNumber,
      requestedDeliveryDate,
    });

    // The hard guarantee: re-check the balance now that this order is in.
    // If a simultaneous order slipped in between the check above and the
    // insert, the balance could have passed the limit — in that case this
    // order is removed again and refused, so the account never owes more
    // than its limit.
    const afterRecording = await creditStateFor(buyer.applicationId);
    if (afterRecording.outstandingCents > afterRecording.limitCents) {
      await getDb().delete(orders).where(eq(orders.id, result.id));
      const credit = await creditStateFor(buyer.applicationId);
      return Response.json({ error: overLimitMessage(credit), credit }, { status: 400 });
    }

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
      termsLabel: netTermsLabel(credit.termsDays),
      invoiceDueAt,
    };
    await sendMail(ownerNewOrderEmail(emailDetails));
    await sendMail(buyerOrderConfirmationEmail(emailDetails));

    // Push lands before email does, on both phones.
    await pushToBuyer(
      buyer.applicationId,
      orderPlacedPush({ orderNumber: result.orderNumber, caseCount: cart.caseCount, shipsToday }),
    );
    await pushToOwner(
      ownerNewOrderPush({
        orderNumber: result.orderNumber,
        businessName: buyer.businessName,
        caseCount: cart.caseCount,
        totalCents: cart.totalCents,
        paymentTerms: "account",
      }),
    );

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
        termsLabel: netTermsLabel(credit.termsDays),
        invoiceDueAt,
        poNumber: order.poNumber,
        requestedDeliveryDate: order.requestedDeliveryDate || "",
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
