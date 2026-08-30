/**
 * Minimal Stripe REST client.
 *
 * The Stripe SDK is not used on purpose: this runs on a Cloudflare Worker,
 * where `fetch` and WebCrypto are already there and a Node-shaped SDK is dead
 * weight. Every call is form-encoded, timed out, and returns a typed result
 * instead of throwing raw network errors at a route handler.
 *
 * Secrets: STRIPE_SECRET_KEY (server only) and STRIPE_PUBLISHABLE_KEY (safe to
 * send to browsers and apps). STRIPE_SECRET_KEY must never leave the server.
 */

const STRIPE_API = "https://api.stripe.com/v1";
const REQUEST_TIMEOUT_MS = 15_000;

export function stripeSecretKey() {
  return String(process.env.STRIPE_SECRET_KEY || "").trim();
}

export function stripePublishableKey() {
  return String(process.env.STRIPE_PUBLISHABLE_KEY || "").trim();
}

export function stripeConfigured() {
  return Boolean(stripeSecretKey() && stripePublishableKey());
}

export type StripeResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; message: string };

/**
 * Flattens a nested object into Stripe's bracket form encoding:
 * { metadata: { sku: "X" } } becomes metadata[sku]=X.
 */
export function stripeForm(input: Record<string, unknown>, prefix = ""): URLSearchParams {
  const form = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined || value === null) continue;
    const name = prefix ? `${prefix}[${key}]` : key;
    if (Array.isArray(value)) {
      value.forEach((entry, index) => {
        if (entry && typeof entry === "object") {
          stripeForm(entry as Record<string, unknown>, `${name}[${index}]`)
            .forEach((nested, nestedKey) => form.set(nestedKey, nested));
        } else {
          form.set(`${name}[${index}]`, String(entry));
        }
      });
    } else if (typeof value === "object") {
      stripeForm(value as Record<string, unknown>, name)
        .forEach((nested, nestedKey) => form.set(nestedKey, nested));
    } else {
      form.set(name, String(value));
    }
  }
  return form;
}

async function call<T>(
  path: string,
  init: {
    method: "GET" | "POST" | "DELETE";
    body?: Record<string, unknown>;
    idempotencyKey?: string;
    /** Extra headers — the ephemeral-key endpoint requires Stripe-Version. */
    headers?: Record<string, string>;
  },
): Promise<StripeResult<T>> {
  const secret = stripeSecretKey();
  if (!secret) {
    return { ok: false, status: 503, message: "Payments are not connected yet." };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/x-www-form-urlencoded",
    };
    // Stripe replays an idempotent request's original response, so a retry
    // after a timeout cannot create a second charge.
    if (init.idempotencyKey) headers["Idempotency-Key"] = init.idempotencyKey;
    Object.assign(headers, init.headers || {});

    const response = await fetch(`${STRIPE_API}${path}`, {
      method: init.method,
      headers,
      body: init.body ? stripeForm(init.body).toString() : undefined,
      signal: controller.signal,
    });
    const data = await response.json().catch(() => null) as
      | (T & { error?: { message?: string } })
      | null;

    if (!response.ok || !data || data.error) {
      // Stripe's own message can name a card problem the buyer can act on, but
      // it can also leak configuration detail, so it is logged in full and
      // summarised for the client by the caller.
      const message = data?.error?.message || "Stripe rejected the request.";
      console.error(`Stripe ${init.method} ${path} failed:`, message);
      return { ok: false, status: response.status || 502, message };
    }
    return { ok: true, data: data as T };
  } catch (caught) {
    const aborted = caught instanceof Error && caught.name === "AbortError";
    console.error(`Stripe ${init.method} ${path} error:`, caught);
    return {
      ok: false,
      status: aborted ? 504 : 502,
      message: aborted ? "Stripe timed out." : "Stripe could not be reached.",
    };
  } finally {
    clearTimeout(timeout);
  }
}

export type StripePaymentIntent = {
  id: string;
  client_secret?: string;
  status?: string;
  amount?: number;
  amount_received?: number;
  currency?: string;
  latest_charge?: string;
  receipt_email?: string;
  metadata?: Record<string, string>;
};

export function createPaymentIntent(body: Record<string, unknown>, idempotencyKey?: string) {
  return call<StripePaymentIntent>("/payment_intents", { method: "POST", body, idempotencyKey });
}

export function retrievePaymentIntent(id: string) {
  return call<StripePaymentIntent>(`/payment_intents/${encodeURIComponent(id)}`, { method: "GET" });
}

export type StripeCustomer = { id: string; email?: string };

export function createCustomer(body: Record<string, unknown>) {
  return call<StripeCustomer>("/customers", { method: "POST", body });
}

/**
 * Deletes a Stripe customer, which takes their saved cards with it.
 *
 * Used when a buyer closes their account: a saved card is personal data we
 * put in Stripe on their behalf, so closing the account has to remove it
 * there too, not only here. Past charges and refunds survive — Stripe keeps
 * those as the payment record, and so must we.
 */
export function deleteCustomer(customerId: string) {
  return call<{ id: string; deleted?: boolean }>(
    `/customers/${encodeURIComponent(customerId)}`,
    { method: "DELETE" },
  );
}

/**
 * Short-lived key that lets the app's PaymentSheet show this one customer's
 * saved cards. Pinned to a fixed API version because the endpoint requires
 * one, and the key's shape is tied to it.
 */
export function createEphemeralKey(customerId: string) {
  return call<{ id: string; secret?: string }>("/ephemeral_keys", {
    method: "POST",
    body: { customer: customerId },
    headers: { "Stripe-Version": "2024-06-20" },
  });
}

/**
 * Web equivalent of the ephemeral key: lets the Payment Element show and save
 * this customer's cards without exposing any other customer data.
 */
export function createCustomerSession(customerId: string) {
  return call<{ client_secret?: string }>("/customer_sessions", {
    method: "POST",
    body: {
      customer: customerId,
      components: {
        payment_element: {
          enabled: true,
          features: {
            payment_method_redisplay: "enabled",
            payment_method_save: "enabled",
            payment_method_save_usage: "off_session",
            payment_method_remove: "enabled",
          },
        },
      },
    },
  });
}

export function listCardPaymentMethods(customerId: string) {
  return call<{ data?: { id: string; card?: { brand?: string; last4?: string } }[] }>(
    `/payment_methods?customer=${encodeURIComponent(customerId)}&type=card&limit=5`,
    { method: "GET" },
  );
}

export type StripeRefund = { id: string; status?: string; amount?: number };

/**
 * Refunds a payment — all of it, or part of it for a short or damaged
 * shipment.
 *
 * The idempotency key includes the amount, so pressing Refund twice on the
 * same amount can never refund twice, while a later, different partial refund
 * on the same order still goes through. Keying on the payment intent alone
 * would silently swallow the second one.
 */
export function createRefund(paymentIntentId: string, amountCents?: number) {
  const partial = Number.isInteger(amountCents) && (amountCents as number) > 0;
  return call<StripeRefund>("/refunds", {
    method: "POST",
    body: {
      payment_intent: paymentIntentId,
      // Omitted means "everything", which is what Stripe does by default.
      ...(partial ? { amount: amountCents } : {}),
    },
    idempotencyKey: `refund-${paymentIntentId}-${partial ? amountCents : "full"}`,
  });
}
