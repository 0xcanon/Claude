/**
 * Creates the PaymentIntent the card form pays.
 *
 * The client sends SKUs and case counts only. Every amount is computed here
 * from the server catalog, so an edited page or a patched app cannot change
 * what a card is charged. The client gets back a client secret, which can
 * only confirm this one payment for this one amount.
 *
 * No shipping address is collected at payment: wholesale ships only to the
 * storefront verified during screening, which travels as metadata. That is
 * what stops an approved account from redirecting cases to a house.
 */

import { BuyerAuthError, requireBuyer } from "../../../buyer-auth.ts";
import { resolveDeliveryLocation } from "../../../buyer-locations.ts";
import { cutoffState } from "../../../order-rules.ts";
import { getWholesaleShippingSettings } from "../../../shipping-settings.ts";
import {
  createCustomerSession,
  createEphemeralKey,
  createPaymentIntent,
  stripePublishableKey,
  stripeSecretKey,
} from "../../../stripe.ts";
import { getOrCreateStripeCustomer } from "../../../stripe-customers.ts";
import { priceOverridesFor } from "../../../customer-pricing.ts";
import { encodeCartLines, priceCart, type CartLine } from "../../../wholesale-catalog.ts";

export const dynamic = "force-dynamic";

const NOT_CONNECTED =
  "Card payments are not connected yet. Call (469) 729-4706 and we'll take the order by phone.";

export async function POST(request: Request) {
  try {
    const buyer = await requireBuyer(request);

    if (!stripeSecretKey() || !stripePublishableKey()) {
      return Response.json({ error: NOT_CONNECTED }, { status: 503 });
    }

    let body: { lines?: CartLine[]; locationId?: string };
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Invalid request." }, { status: 400 });
    }

    const shipping = await getWholesaleShippingSettings();
    // Exclusive prices, when the owner has set any for this business.
    const overrides = await priceOverridesFor(buyer.applicationId);
    const cart = await priceCart(Array.isArray(body.lines) ? body.lines : [], shipping, overrides);
    if (!cart.ok) return Response.json({ error: cart.error }, { status: 400 });

    // The chosen delivery address, resolved against the owner-approved list.
    // An unknown id falls back to the screened primary storefront.
    const deliverTo = await resolveDeliveryLocation(buyer, String(body.locationId || ""));

    // The buyer's Stripe customer lets a saved card appear next time and be
    // charged off-session for standing orders. Its absence degrades to a
    // plain one-off card payment rather than failing checkout.
    const customerId = await getOrCreateStripeCustomer(buyer);

    const intent = await createPaymentIntent({
      amount: cart.totalCents,
      currency: "usd",
      ...(customerId ? { customer: customerId, setup_future_usage: "off_session" } : {}),
      // Card only. Wallets would need merchant configuration that does not
      // exist yet, and a wholesale buyer pays on a company card.
      payment_method_types: ["card"],
      receipt_email: buyer.email,
      description: `Dallas Bakery wholesale — ${cart.caseCount} case${cart.caseCount === 1 ? "" : "s"}`,
      statement_descriptor_suffix: "WHOLESALE",
      metadata: {
        channel: "wholesale",
        // Marks intents this endpoint created, so the webhook records them and
        // ignores payment intents that belong to a retail Checkout Session.
        source: "wholesale-order",
        applicationId: buyer.applicationId,
        // Cart is stored compactly and re-priced at intake, which keeps the
        // metadata well under Stripe's 500-character limit per value.
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
    });

    if (!intent.ok || !intent.data.client_secret) {
      return Response.json(
        { error: "Payment could not be started. Try again in a moment." },
        { status: 502 },
      );
    }

    // Saved-card display: the app's PaymentSheet needs an ephemeral key, the
    // web Payment Element a customer session. Both are optional extras.
    let ephemeralKeySecret = "";
    let customerSessionClientSecret = "";
    if (customerId) {
      const [ephemeral, customerSession] = await Promise.all([
        createEphemeralKey(customerId),
        createCustomerSession(customerId),
      ]);
      if (ephemeral.ok) ephemeralKeySecret = ephemeral.data.secret || "";
      if (customerSession.ok) customerSessionClientSecret = customerSession.data.client_secret || "";
    }

    return Response.json(
      {
        clientSecret: intent.data.client_secret,
        publishableKey: stripePublishableKey(),
        paymentIntentId: intent.data.id,
        customerId,
        ephemeralKeySecret,
        customerSessionClientSecret,
        summary: {
          caseCount: cart.caseCount,
          loafCount: cart.loafCount,
          boxCount: cart.boxCount,
          subtotalCents: cart.subtotalCents,
          shippingCents: cart.shippingCents,
          totalCents: cart.totalCents,
          lines: cart.lines.map((line) => ({
            sku: line.sku,
            title: line.title,
            cases: line.cases,
            loaves: line.loaves,
            unitAmountCents: line.unitAmountCents,
            lineTotalCents: line.lineTotalCents,
          })),
        },
        deliverTo: {
          businessName: deliverTo.name,
          street: deliverTo.street,
          street2: deliverTo.street2,
          city: deliverTo.city,
          state: deliverTo.state,
          zip: deliverTo.zip,
        },
        cutoff: cutoffState(),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (caught) {
    if (caught instanceof BuyerAuthError) {
      return Response.json({ error: caught.message }, { status: caught.status });
    }
    console.error("Payment intent error:", caught);
    return Response.json({ error: "Payment could not be started." }, { status: 500 });
  }
}
