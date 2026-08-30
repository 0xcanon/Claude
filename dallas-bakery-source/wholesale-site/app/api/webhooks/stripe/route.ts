/**
 * Stripe webhook — the only way orders enter the system.
 *
 * Both stores post here: the retail site (dallasbakery.com) and the wholesale
 * site (dallasbakery.net). The Checkout Session's metadata.channel says which,
 * so one shipping queue covers the whole day's boxes.
 *
 * Signature verification is done by hand against STRIPE_WEBHOOK_SECRET rather
 * than pulling in the Stripe SDK: the Worker has WebCrypto, and an unsigned
 * endpoint that creates orders would let anyone fabricate a shipment.
 */

import {
  buyerOrderConfirmationEmail,
  ownerNewOrderEmail,
  sendMail,
} from "../../../email-notifications.ts";
import { cutoffState } from "../../../order-rules.ts";
import { recordOrder, type NewOrderInput, type OrderChannel, type OrderItem } from "../../../orders-service.ts";
import { priceOverridesFor } from "../../../customer-pricing.ts";
import { orderPlacedPush, ownerNewOrderPush } from "../../../push-messages.ts";
import { pushToBuyer, pushToOwner } from "../../../push-notifications.ts";
import { getWholesaleShippingSettings } from "../../../shipping-settings.ts";
import { decodeCartLines, priceCart } from "../../../wholesale-catalog.ts";

export const dynamic = "force-dynamic";

const SIGNATURE_TOLERANCE_SECONDS = 300;

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let index = 0; index < a.length; index += 1) {
    mismatch |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return mismatch === 0;
}

function toHex(buffer: ArrayBuffer) {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function verifySignature(payload: string, header: string, secret: string) {
  const parts = Object.fromEntries(
    header.split(",").map((piece) => {
      const [key, value] = piece.split("=");
      return [key?.trim(), value?.trim()];
    }),
  ) as { t?: string; v1?: string };
  if (!parts.t || !parts.v1) return false;

  const age = Math.abs(Math.floor(Date.now() / 1000) - Number(parts.t));
  if (!Number.isFinite(age) || age > SIGNATURE_TOLERANCE_SECONDS) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${parts.t}.${payload}`),
  );
  return timingSafeEqual(toHex(signature), parts.v1);
}

type StripePaymentIntentEvent = {
  id?: string;
  amount?: number;
  amount_received?: number;
  receipt_email?: string;
  metadata?: Record<string, string>;
};

type StripeSession = {
  id?: string;
  payment_intent?: string;
  amount_subtotal?: number;
  amount_total?: number;
  total_details?: { amount_shipping?: number };
  customer_details?: { name?: string; email?: string; phone?: string };
  shipping_details?: {
    name?: string;
    address?: {
      line1?: string;
      line2?: string;
      city?: string;
      state?: string;
      postal_code?: string;
    };
  };
  metadata?: Record<string, string>;
  line_items?: {
    data?: {
      description?: string;
      quantity?: number;
      price?: { unit_amount?: number; product?: { metadata?: Record<string, string> } };
    }[];
  };
};

function readItems(session: StripeSession) {
  const rows = session.line_items?.data || [];
  const items: OrderItem[] = rows.map((row) => ({
    sku: String(row.price?.product?.metadata?.sku || ""),
    name: String(row.description || "Bread"),
    quantity: Number(row.quantity || 1),
    unitAmountCents: Number(row.price?.unit_amount || 0),
  }));
  // Retail only. Loaf count drives box count, and box count drives the UPS
  // labels; it is session metadata because Stripe line items carry no loaf
  // concept. Wholesale ships one box per case and is recorded above.
  const loafCount = Number(session.metadata?.loafCount || 0);
  return { items, loafCount };
}

/**
 * Records a wholesale order from a succeeded PaymentIntent.
 *
 * The cart is re-priced from the server catalog rather than trusted from
 * metadata, so what lands in the shipping queue is priced by the same module
 * that set the amount charged. If the two disagree the order is still recorded
 * against the amount Stripe actually captured, and the mismatch is logged.
 */
async function recordFromPaymentIntent(intent: StripePaymentIntentEvent) {
  const meta = intent.metadata || {};
  // Only intents this site created for wholesale. A retail Checkout Session
  // also emits payment_intent.succeeded, and recording both would put the same
  // box on the bench twice.
  if (!intent.id || meta.source !== "wholesale-order" || meta.channel !== "wholesale") {
    return Response.json({ received: true });
  }

  const shipping = await getWholesaleShippingSettings();
  // The buyer's exclusive prices apply at intake too, so the recorded order
  // re-prices to the same total the payment was created from.
  const overrides = await priceOverridesFor(String(meta.applicationId || ""));
  const cart = await priceCart(decodeCartLines(meta.lines || ""), shipping, overrides);
  if (!cart.ok) {
    // Nothing sensible to put on a packing slip. Acknowledge so Stripe stops
    // retrying, and leave a loud log: the payment succeeded and needs a human.
    console.error(
      `Paid wholesale intent ${intent.id} could not be re-priced (${cart.error}). Record it by hand.`,
    );
    return Response.json({ received: true, recorded: false });
  }

  const capturedCents = Number(intent.amount_received || intent.amount || 0);
  if (capturedCents !== cart.totalCents) {
    console.error(
      `Wholesale intent ${intent.id} captured ${capturedCents} but re-prices to ${cart.totalCents}. ` +
      "Recording the captured amount; check the catalog for a price change mid-checkout.",
    );
  }

  const items: OrderItem[] = cart.lines.map((line) => ({
    sku: line.sku,
    name: line.title,
    quantity: line.cases,
    unitAmountCents: line.unitAmountCents,
  }));

  try {
    const input: NewOrderInput = {
      channel: "wholesale",
      // The intent id doubles as the dedupe key, so a Stripe retry is a no-op.
      stripeSessionId: intent.id,
      stripePaymentIntentId: intent.id,
      // The label carries the location's name when one was chosen, so a
      // multi-store business's box says which store it is for.
      customerName: String(meta.locationName || meta.businessName || meta.contactName || ""),
      email: String(intent.receipt_email || ""),
      phone: String(meta.phone || ""),
      street: String(meta.street || ""),
      street2: String(meta.street2 || ""),
      city: String(meta.city || ""),
      state: String(meta.state || ""),
      zip: String(meta.zip || ""),
      items,
      loafCount: cart.loafCount,
      caseCount: cart.caseCount,
      subtotalCents: cart.subtotalCents,
      shippingCents: cart.shippingCents,
      totalCents: capturedCents || cart.totalCents,
      applicationId: String(meta.applicationId || ""),
      paymentTerms: "card",
      // Carried through from checkout so the packing slip and the buyer's
      // accounts-payable file agree on the same reference.
      poNumber: String(meta.poNumber || ""),
      requestedDeliveryDate: String(meta.requestedDeliveryDate || ""),
    };
    const result = await recordOrder(input);
    await announceOrder(input, result, cart.caseCount);
    return Response.json({ received: true, created: result.created });
  } catch (caught) {
    console.error("Wholesale order intake failed:", caught instanceof Error ? caught.message : caught);
    return Response.json({ error: "Order could not be recorded." }, { status: 500 });
  }
}

/**
 * Announces a freshly recorded order: an alert to the owner (both channels —
 * the bakery has to know to bake), and a branded confirmation to wholesale
 * buyers (retail buyers already get the store's own flow). Runs only when the
 * order was actually created, so a Stripe retry never re-sends the emails,
 * and sendMail swallows failures so a mail outage cannot fail the webhook.
 */
async function announceOrder(
  input: NewOrderInput,
  result: { created: boolean; orderNumber: number },
  caseCount: number,
) {
  if (!result.created) return;
  const details = {
    channel: input.channel,
    orderNumber: result.orderNumber,
    customerName: input.customerName,
    email: input.email,
    city: input.city,
    state: input.state,
    items: input.items.map((item) => ({ name: item.name, quantity: item.quantity })),
    caseCount,
    boxCount: input.channel === "wholesale" && input.caseCount ? input.caseCount : 0,
    loafCount: input.loafCount,
    subtotalCents: input.subtotalCents,
    shippingCents: input.shippingCents,
    totalCents: input.totalCents,
    shipsToday: cutoffState().shipsToday,
  };
  // boxCount above may be 0 for retail; derive a sane value for the copy.
  if (!details.boxCount) details.boxCount = Math.max(1, Math.ceil(details.loafCount / 25));
  await sendMail(ownerNewOrderEmail(details));
  if (input.channel === "wholesale" && input.email) {
    await sendMail(buyerOrderConfirmationEmail(details));
  }

  if (input.channel !== "wholesale") return;
  if (input.applicationId) {
    await pushToBuyer(
      input.applicationId,
      orderPlacedPush({
        orderNumber: result.orderNumber,
        caseCount,
        shipsToday: details.shipsToday,
      }),
    );
  }
  await pushToOwner(
    ownerNewOrderPush({
      orderNumber: result.orderNumber,
      businessName: input.customerName,
      caseCount,
      totalCents: input.totalCents,
      paymentTerms: input.paymentTerms || "card",
    }),
  );
}

export async function POST(request: Request) {
  const secret = String(process.env.STRIPE_WEBHOOK_SECRET || "").trim();
  if (!secret) {
    console.error("Stripe webhook received but STRIPE_WEBHOOK_SECRET is not set.");
    return Response.json({ error: "Webhook is not configured." }, { status: 503 });
  }

  const payload = await request.text();
  const header = request.headers.get("stripe-signature") || "";
  if (!(await verifySignature(payload, header, secret))) {
    return Response.json({ error: "Invalid signature." }, { status: 400 });
  }

  let event: { type?: string; data?: { object?: StripeSession } };
  try {
    event = JSON.parse(payload);
  } catch {
    return Response.json({ error: "Invalid payload." }, { status: 400 });
  }

  // Wholesale pays through a PaymentIntent created by /api/buyer/payment-intent,
  // so the card form can live on our own site and inside the app. Retail still
  // uses Checkout Sessions. Both land here.
  if (event.type === "payment_intent.succeeded") {
    return recordFromPaymentIntent((event.data?.object || {}) as StripePaymentIntentEvent);
  }

  // Every other event type is acknowledged so Stripe stops retrying it.
  if (event.type !== "checkout.session.completed") {
    return Response.json({ received: true });
  }

  const session = (event.data?.object || {}) as StripeSession;
  if (!session.id) return Response.json({ received: true });

  // Wholesale sessions do not collect an address at checkout — delivery is
  // locked to the approved storefront, which travels as metadata.
  const meta = session.metadata || {};
  const address = session.shipping_details?.address || {
    line1: meta.street,
    line2: meta.street2,
    city: meta.city,
    state: meta.state,
    postal_code: meta.zip,
  };
  const { items, loafCount } = readItems(session);
  const channel: OrderChannel = session.metadata?.channel === "wholesale" ? "wholesale" : "retail";

  try {
    const input: NewOrderInput = {
      channel,
      stripeSessionId: session.id,
      stripePaymentIntentId: String(session.payment_intent || ""),
      customerName: String(
        session.shipping_details?.name || meta.businessName || session.customer_details?.name || "",
      ),
      email: String(session.customer_details?.email || ""),
      phone: String(session.customer_details?.phone || meta.phone || ""),
      street: String(address.line1 || ""),
      street2: String(address.line2 || ""),
      city: String(address.city || ""),
      state: String(address.state || ""),
      zip: String(address.postal_code || ""),
      items,
      loafCount,
      subtotalCents: Number(session.amount_subtotal || 0),
      shippingCents: Number(session.total_details?.amount_shipping || 0),
      totalCents: Number(session.amount_total || 0),
    };
    const result = await recordOrder(input);
    await announceOrder(input, result, Number(session.metadata?.caseCount || 0));
    return Response.json({ received: true, created: result.created });
  } catch (caught) {
    // Returning 500 makes Stripe retry, which is what we want for a transient
    // database error — the unique session id keeps the retry from duplicating.
    console.error("Order intake failed:", caught instanceof Error ? caught.message : caught);
    return Response.json({ error: "Order could not be recorded." }, { status: 500 });
  }
}
