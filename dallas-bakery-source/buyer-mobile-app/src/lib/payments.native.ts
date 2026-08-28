import { initPaymentSheet, presentPaymentSheet } from "@stripe/stripe-react-native";

import type { PaymentOutcome, PaymentRequest, PaymentSheet } from "./payments";

export type { PaymentOutcome, PaymentRequest } from "./payments";

/**
 * Stripe's native PaymentSheet. `initPaymentSheet` is given the publishable
 * key and client secret the server issued; the sheet then talks to Stripe
 * directly, so a card number never passes through this app.
 */
async function present(request: PaymentRequest): Promise<PaymentOutcome> {
  // The sheet is dressed as Dallas Bakery: the bakery's own palette, its
  // serif for headings, square corners to match the rest of the app, and the
  // bakery's name at the top. A buyer should recognise this as the same
  // checkout they started, not a generic payment box.
  const init = await initPaymentSheet({
    merchantDisplayName: request.merchantName,
    paymentIntentClientSecret: request.clientSecret,
    defaultBillingDetails: { email: request.email },
    // The buyer's delivery address is fixed to the approved storefront, so the
    // sheet must not offer to change it.
    allowsDelayedPaymentMethods: false,
    returnURL: "dallasbakerywholesale://stripe-redirect",
    primaryButtonLabel: request.payButtonLabel,
    // With a customer + ephemeral key the sheet shows this buyer's saved
    // cards and offers to save a new one; without them it degrades to a
    // one-off card entry.
    ...(request.customerId && request.customerEphemeralKeySecret
      ? { customerId: request.customerId, customerEphemeralKeySecret: request.customerEphemeralKeySecret }
      : {}),
    appearance: {
      font: { scale: 1.0 },
      colors: {
        primary: "#C84A2A",
        background: "#F5EDDF",
        componentBackground: "#FFF9EF",
        componentBorder: "#D8CCBC",
        componentDivider: "#D8CCBC",
        componentText: "#2D211C",
        primaryText: "#2B1A13",
        secondaryText: "#756A63",
        placeholderText: "#A99B90",
        icon: "#C84A2A",
        error: "#A33A2C",
      },
      shapes: { borderRadius: 0, borderWidth: 1 },
      primaryButton: {
        colors: { background: "#C84A2A", text: "#FFF9EF", border: "#C84A2A" },
        shapes: { borderRadius: 0, borderWidth: 0 },
      },
    },
  });
  if (init.error) {
    return { status: "failed", message: init.error.message || "The card form could not be opened." };
  }

  const result = await presentPaymentSheet();
  if (!result.error) return { status: "paid" };
  // Stripe reports a dismissed sheet as an error; it is not one, and it must
  // not be shown to the buyer as a failure.
  if (result.error.code === "Canceled") return { status: "cancelled" };
  return { status: "failed", message: result.error.message || "That payment did not go through." };
}

export const paymentSheet: PaymentSheet = { available: true, present };
