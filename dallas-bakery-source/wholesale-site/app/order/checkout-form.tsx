"use client";

/**
 * The card form. Card details are entered inside Stripe's own iframe (the
 * Payment Element), so the raw number never touches this page's JavaScript or
 * Dallas Bakery's servers — that is what keeps the site out of PCI scope while
 * still looking and behaving like part of dallasbakery.net.
 */

import { useState } from "react";
import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";
import { loadStripe, type Stripe } from "@stripe/stripe-js";

export type CheckoutSummary = {
  caseCount: number;
  loafCount: number;
  boxCount: number;
  subtotalCents: number;
  shippingCents: number;
  totalCents: number;
  lines: {
    sku: string;
    title: string;
    cases: number;
    loaves: number;
    unitAmountCents: number;
    lineTotalCents: number;
  }[];
};

export type DeliverTo = {
  businessName: string;
  street: string;
  street2: string;
  city: string;
  state: string;
  zip: string;
};

function money(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

// Stripe.js is cached per publishable key: loading it twice would create two
// instances and the Element would silently fail to mount.
const stripeCache = new Map<string, Promise<Stripe | null>>();
function stripeFor(publishableKey: string) {
  const cached = stripeCache.get(publishableKey);
  if (cached) return cached;
  const created = loadStripe(publishableKey);
  stripeCache.set(publishableKey, created);
  return created;
}

function CardFields({
  onPaid,
  onCancel,
  summary,
  deliverTo,
}: {
  onPaid: (paymentIntentId: string) => void;
  onCancel: () => void;
  summary: CheckoutSummary;
  deliverTo: DeliverTo;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);

  async function pay(event: React.FormEvent) {
    event.preventDefault();
    if (!stripe || !elements || busy) return;
    setBusy(true);
    setError("");

    const { error: submitError } = await elements.submit();
    if (submitError) {
      setError(submitError.message || "Check the card details and try again.");
      setBusy(false);
      return;
    }

    // redirect: "if_required" keeps the buyer on this page for ordinary cards
    // and only leaves for a bank's 3-D Secure step when the card demands one.
    const { error: confirmError, paymentIntent } = await stripe.confirmPayment({
      elements,
      redirect: "if_required",
      confirmParams: {
        return_url: `${window.location.origin}/order?paid=1`,
      },
    });

    if (confirmError) {
      setError(confirmError.message || "That payment did not go through.");
      setBusy(false);
      return;
    }
    if (paymentIntent && (paymentIntent.status === "succeeded" || paymentIntent.status === "processing")) {
      onPaid(paymentIntent.id);
      return;
    }
    setError("That payment did not complete. No card was charged.");
    setBusy(false);
  }

  return (
    <form className="buyer-pay" onSubmit={pay}>
      <p className="buyer-eyebrow">Dallas Bakery Wholesale · Secure checkout</p>
      <h2>Complete your order</h2>
      <p className="buyer-pay-intro">
        You are paying Dallas Bakery directly. Card details are encrypted in the
        field below and never reach our servers.
      </p>

      <div className="buyer-pay-summary">
        {summary.lines.map((line) => (
          <div className="buyer-pay-line" key={line.sku}>
            <span>{line.title}</span>
            <span>{line.cases} × {money(line.unitAmountCents)}</span>
            <strong>{money(line.lineTotalCents)}</strong>
          </div>
        ))}
        <div className="buyer-pay-total-row">
          <span>Subtotal · {summary.caseCount} {summary.caseCount === 1 ? "case" : "cases"}</span>
          <strong>{money(summary.subtotalCents)}</strong>
        </div>
        <div className="buyer-pay-total-row">
          <span>Shipping · {summary.boxCount} {summary.boxCount === 1 ? "box" : "boxes"}</span>
          <strong>{money(summary.shippingCents)}</strong>
        </div>
        <div className="buyer-pay-total-row buyer-pay-grand">
          <span>Total</span>
          <strong>{money(summary.totalCents)}</strong>
        </div>
      </div>

      <div className="buyer-pay-deliver">
        <span>DELIVERING TO</span>
        <strong>{deliverTo.businessName}</strong>
        <small>
          {[deliverTo.street, deliverTo.street2].filter(Boolean).join(", ")}
          {" · "}
          {[deliverTo.city, deliverTo.state, deliverTo.zip].filter(Boolean).join(" ")}
        </small>
        <small>Wholesale ships only to your approved storefront, so the address cannot be changed here.</small>
      </div>

      <div className="buyer-card-element">
        <p className="buyer-card-label">Card details</p>
        <PaymentElement
          onReady={() => setReady(true)}
          options={{
            layout: "tabs",
            // The buyer's business name is already known and the delivery
            // address is fixed to the approved storefront, so the form asks
            // for the card and nothing else.
            fields: { billingDetails: { email: "never", address: { country: "never", postalCode: "auto" } } },
          }}
        />
      </div>

      {!!error && <p className="buyer-error" role="alert">{error}</p>}

      <button className="buyer-primary" type="submit" disabled={!stripe || !ready || busy}>
        {busy ? "Processing…" : `Pay Dallas Bakery ${money(summary.totalCents)}`}
      </button>
      <button className="buyer-secondary" type="button" onClick={onCancel} disabled={busy}>
        Back to the catalog
      </button>
      <p className="buyer-pay-note">
        <span aria-hidden="true">🔒</span> Encrypted end to end. Dallas Bakery never sees or stores your
        card number. Questions? sales@dallasbakery.com · (469) 729-4706
      </p>
    </form>
  );
}

export function CheckoutForm({
  clientSecret,
  publishableKey,
  customerSessionClientSecret,
  summary,
  deliverTo,
  onPaid,
  onCancel,
}: {
  clientSecret: string;
  publishableKey: string;
  /** Shows this buyer's saved cards and the save-for-next-time box. */
  customerSessionClientSecret?: string;
  summary: CheckoutSummary;
  deliverTo: DeliverTo;
  onPaid: (paymentIntentId: string) => void;
  onCancel: () => void;
}) {
  return (
    <Elements
      options={{
        clientSecret,
        ...(customerSessionClientSecret ? { customerSessionClientSecret } : {}),
        // Dressed as Dallas Bakery: the bakery's cream paper, rust accent,
        // square corners, and its serif for anything that reads as a heading.
        // A buyer should not be able to tell where our page stops.
        appearance: {
          theme: "flat",
          variables: {
            colorPrimary: "#AE3E26",
            colorBackground: "#FFFFFF",
            colorText: "#2A1B13",
            colorTextSecondary: "#756A63",
            colorTextPlaceholder: "#A99B90",
            colorDanger: "#9A3524",
            fontFamily: "Georgia, 'Times New Roman', serif",
            fontSizeBase: "15px",
            borderRadius: "0px",
            spacingUnit: "4px",
          },
          rules: {
            ".Input": {
              border: "1px solid rgba(42, 27, 19, 0.18)",
              boxShadow: "none",
              padding: "12px 14px",
            },
            ".Input:focus": {
              border: "1px solid #AE3E26",
              boxShadow: "0 0 0 1px #AE3E26",
            },
            ".Label": {
              fontFamily: "system-ui, -apple-system, sans-serif",
              fontSize: "11px",
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "#756A63",
            },
            ".Tab": { border: "1px solid rgba(42, 27, 19, 0.18)", borderRadius: "0px" },
            ".Tab--selected": { borderColor: "#AE3E26", color: "#AE3E26" },
          },
        },
      }}
      stripe={stripeFor(publishableKey)}
    >
      <CardFields
        deliverTo={deliverTo}
        onCancel={onCancel}
        onPaid={onPaid}
        summary={summary}
      />
    </Elements>
  );
}
