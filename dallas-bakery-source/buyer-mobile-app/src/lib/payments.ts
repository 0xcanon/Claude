/**
 * Card payment, shared shape.
 *
 * Card details are collected by Stripe's own PaymentSheet, which runs in
 * Stripe's process and returns only a result. The card number never reaches
 * this app's JavaScript, this app's memory, or Dallas Bakery's servers — that
 * is what keeps the app out of PCI scope.
 *
 * The real implementation is in payments.native.ts. Metro picks that file on
 * iOS and Android and payments.web.ts under react-native-web, so the web
 * bundle never pulls in a native module it cannot load.
 */

export type PaymentOutcome =
  | { status: "paid" }
  | { status: "cancelled" }
  | { status: "failed"; message: string };

export type PaymentRequest = {
  clientSecret: string;
  publishableKey: string;
  /** Shown at the top of the sheet so the buyer knows who is being paid. */
  merchantName: string;
  /** Prefilled on the receipt Stripe emails. */
  email: string;
  /** The sheet's own pay button, so it reads like the rest of the checkout. */
  payButtonLabel: string;
  /** Present when the buyer has a Stripe customer: shows their saved cards. */
  customerId?: string;
  customerEphemeralKeySecret?: string;
};

export type PaymentSheet = {
  /** True when a real card sheet can be presented on this platform. */
  available: boolean;
  present: (request: PaymentRequest) => Promise<PaymentOutcome>;
};

/**
 * Safe fallback. Metro always resolves a platform file first — payments.native.ts
 * on iOS and Android, payments.web.ts under react-native-web — so this value is
 * what TypeScript reads for types and is not what runs. It reports itself
 * unavailable rather than being undefined, so an unexpected resolution
 * degrades into a clear message instead of a crash at the pay button.
 */
export const paymentSheet: PaymentSheet = {
  available: false,
  async present() {
    return {
      status: "failed",
      message: "Card payment is unavailable on this build. Order at dallasbakery.net/order.",
    };
  },
};
