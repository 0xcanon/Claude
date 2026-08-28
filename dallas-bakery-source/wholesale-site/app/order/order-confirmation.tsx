"use client";

/**
 * The page a buyer sees after the card clears.
 *
 * The order row is written by the Stripe webhook, which can land a second or
 * two after the browser gets its "succeeded". So this polls briefly and, until
 * the row exists, says the payment is confirmed and the order is being
 * recorded — never "failed", which would be false and would tempt a second
 * payment.
 */

import { useCallback, useEffect, useState } from "react";

export type ConfirmedOrder = {
  name: string;
  placedAt: string;
  caseCount: number;
  boxCount: number;
  loafCount: number;
  subtotal: string;
  shipping: string;
  total: string;
  items: { sku: string; name: string; quantity: number; unitAmountCents: number }[];
  trackingNumber: string;
  statusPageUrl: string;
  /** "account" was placed on credit — invoiced, no card charged. */
  paymentTerms?: "card" | "account";
  deliverTo: { name: string; street: string; street2: string; city: string; state: string; zip: string };
};

const POLL_INTERVAL_MS = 1500;
const MAX_POLLS = 12;

export function OrderConfirmation({
  paymentIntentId,
  token,
  cutoffLabel,
  onDone,
  initialOrder = null,
}: {
  paymentIntentId: string;
  token: string;
  cutoffLabel: string;
  onDone: () => void;
  /**
   * An order that is already recorded — account orders come back from their
   * own endpoint fully formed, so there is no webhook to poll for.
   */
  initialOrder?: ConfirmedOrder | null;
}) {
  const [order, setOrder] = useState<ConfirmedOrder | null>(initialOrder);
  const [settled, setSettled] = useState(Boolean(initialOrder));

  const poll = useCallback(async () => {
    if (initialOrder || !paymentIntentId) return;
    for (let attempt = 0; attempt < MAX_POLLS; attempt += 1) {
      try {
        const response = await fetch(
          `/api/buyer/order-status?paymentIntent=${encodeURIComponent(paymentIntentId)}`,
          { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" },
        );
        const data = await response.json();
        if (response.ok && data.status === "recorded" && data.order) {
          setOrder(data.order as ConfirmedOrder);
          setSettled(true);
          return;
        }
      } catch {
        // Network hiccup while polling is not a failed payment; keep trying.
      }
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }
    // Still not recorded. The payment is captured either way; the shipping
    // queue picks it up from the webhook when it arrives.
    setSettled(true);
  }, [paymentIntentId, token, initialOrder]);
  const onAccount = order?.paymentTerms === "account";

  // poll awaits the order-status request before it sets anything, so the
  // first state change is already off the render path.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void poll(); }, [poll]);

  return (
    <section className="buyer-confirmation">
      <div className="buyer-confirmation-mark" aria-hidden="true">✓</div>
      <p className="buyer-eyebrow">Dallas Bakery Wholesale</p>
      <h2>{order ? `Order ${order.name} is in.` : "Payment received."}</h2>
      <p>
        {order
          ? onAccount
            ? `Placed on your credit account — nothing was charged to a card; we'll invoice you. We emailed a confirmation. ${cutoffLabel}`
            : `We emailed a receipt. ${cutoffLabel}`
          : settled
            ? "Your card was charged and the order is being recorded. It will appear in your order history shortly, and we have already been notified."
            : "Your card was charged. Recording your order…"}
      </p>

      {order && (
        <>
          <div className="buyer-confirmation-lines">
            {order.items.map((item) => (
              <div className="buyer-confirmation-line" key={item.sku}>
                <span>{item.name}</span>
                <span>{item.quantity} {item.quantity === 1 ? "case" : "cases"}</span>
              </div>
            ))}
            <div className="buyer-confirmation-line">
              <span>Subtotal</span><span>${order.subtotal}</span>
            </div>
            <div className="buyer-confirmation-line">
              <span>Shipping · {order.boxCount} {order.boxCount === 1 ? "box" : "boxes"}</span>
              <span>${order.shipping}</span>
            </div>
            <div className="buyer-confirmation-line buyer-confirmation-total">
              <strong>{onAccount ? "Total on account" : "Total charged"}</strong><strong>${order.total}</strong>
            </div>
          </div>

          <div className="buyer-confirmation-deliver">
            <span>SHIPPING TO</span>
            <strong>{order.deliverTo.name}</strong>
            <small>
              {[order.deliverTo.street, order.deliverTo.street2].filter(Boolean).join(", ")}
              {" · "}
              {[order.deliverTo.city, order.deliverTo.state, order.deliverTo.zip].filter(Boolean).join(" ")}
            </small>
          </div>

          <ol className="buyer-confirmation-next">
            <li>We bake and pack {order.caseCount} {order.caseCount === 1 ? "case" : "cases"} into {order.boxCount} {order.boxCount === 1 ? "box" : "boxes"}.</li>
            <li>UPS Ground collects them and we email your tracking number.</li>
            <li>Delivery is 1–4 business days; the bread keeps 14 days.</li>
          </ol>
        </>
      )}

      <button className="buyer-primary" type="button" onClick={onDone}>
        Back to the catalog
      </button>
      <p className="buyer-pay-note">
        Questions about this order? Email sales@dallasbakery.com or call (469) 729-4706.
        Tracking appears under <strong>My orders</strong> as soon as UPS collects your boxes.
      </p>
    </section>
  );
}
