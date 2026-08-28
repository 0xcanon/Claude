import type { PaymentOutcome, PaymentSheet } from "./payments";

export type { PaymentOutcome, PaymentRequest } from "./payments";

/**
 * Web build only. Stripe's PaymentSheet is a native module, so under
 * react-native-web (used for screenshots and layout review) there is no card
 * sheet to present. It reports itself unavailable rather than pretending to
 * take a payment.
 *
 * Buyers on the web pay through the Payment Element at /order on the site.
 */
async function present(): Promise<PaymentOutcome> {
  return {
    status: "failed",
    message: "Card payment runs on the device build. On the web, order at dallasbakery.net/order.",
  };
}

export const paymentSheet: PaymentSheet = { available: false, present };
