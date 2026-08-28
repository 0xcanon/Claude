/**
 * Private catalog and payment against the Dallas Bakery API.
 *
 * Cases and prices come from the server; the app sends SKUs and case counts,
 * never money. Payment returns a Stripe client secret, which can only confirm
 * the one payment the server priced — a patched app cannot change the amount.
 */

import { apiUrl } from "./api";
import type { BuyerSession, CartQuantityMap, CatalogProduct, ShippingSettings } from "../types";

const REQUEST_TIMEOUT_MS = 15_000;

export class CatalogError extends Error {
  status: number;
  constructor(message: string, status = 500) {
    super(message);
    this.name = "CatalogError";
    this.status = status;
  }
}

export type OrderRulesSummary = {
  cutoffLabel: string;
  minimumCases: number;
  minimumLabel: string;
  leadTimeLabel: string;
};

export type CreditState = {
  /** True when the owner granted this business a credit limit. */
  enabled: boolean;
  limitCents: number;
  outstandingCents: number;
  availableCents: number;
};

export type CatalogPayload = {
  products: CatalogProduct[];
  shipping: ShippingSettings;
  orderRules: OrderRulesSummary;
  cutoff: { shipsToday: boolean; label: string };
  /** The buyer's credit position — drives the "order on account" option. */
  credit?: CreditState;
};

async function authorized<T>(path: string, session: BuyerSession, init: RequestInit = {}): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(apiUrl(path), {
      ...init,
      headers: {
        ...(init.headers || {}),
        Authorization: `Bearer ${session.accessToken}`,
      },
      signal: controller.signal,
    });
    const data = await response.json().catch(() => ({}));
    if (response.status === 401 || response.status === 403) {
      throw new CatalogError("Your buyer session expired. Sign in again.", response.status);
    }
    if (!response.ok) {
      throw new CatalogError(
        typeof data?.error === "string" ? data.error : "The private catalog could not be loaded.",
        response.status,
      );
    }
    return data as T;
  } catch (caught) {
    if (caught instanceof CatalogError) throw caught;
    throw new CatalogError("Dallas Bakery could not be reached. Check your connection.", 0);
  } finally {
    clearTimeout(timeout);
  }
}

export async function getPrivateCatalog(session: BuyerSession, _locationId: string) {
  const payload = await authorized<CatalogPayload>("/api/buyer/catalog", session);
  return payload.products;
}

export type CutoffState = { shipsToday: boolean; label: string };

export async function getCatalogPayload(session: BuyerSession) {
  return authorized<CatalogPayload>("/api/buyer/catalog", session);
}

export type OrderSummary = {
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

export type PaymentStart = {
  clientSecret: string;
  publishableKey: string;
  paymentIntentId: string;
  customerId?: string;
  ephemeralKeySecret?: string;
  summary: OrderSummary;
  deliverTo: {
    businessName: string;
    street: string;
    street2: string;
    city: string;
    state: string;
    zip: string;
  };
};

/**
 * Prices the cart server-side and opens a payment for it. The client secret
 * that comes back is scoped to this one amount.
 */
export async function startBuyerPayment(
  session: BuyerSession,
  cart: CartQuantityMap,
  locationId: string,
) {
  const lines = Object.entries(cart)
    .filter(([, cases]) => cases > 0)
    .map(([sku, cases]) => ({ sku, cases }));
  return authorized<PaymentStart>("/api/buyer/payment-intent", session, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // The server resolves the id against owner-approved addresses; anything
    // unknown falls back to the screened primary storefront.
    body: JSON.stringify({ lines, locationId }),
  });
}

export type ConfirmedOrder = {
  id: string;
  name: string;
  placedAt: string;
  caseCount: number;
  boxCount: number;
  loafCount: number;
  subtotal: string;
  shipping: string;
  total: string;
  currencyCode: string;
  items: { sku: string; name: string; quantity: number; unitAmountCents: number }[];
  trackingNumber: string;
  statusPageUrl: string;
  /** "account" was placed on credit — invoiced, no card charged. */
  paymentTerms?: "card" | "account";
  deliverTo: { name: string; street: string; street2: string; city: string; state: string; zip: string };
};

export type OrderStatus =
  | { status: "recorded"; order: ConfirmedOrder }
  | { status: "pending" | "unpaid"; paymentStatus: string };

/**
 * Asks whether the paid order has been recorded yet. The order row is written
 * by Stripe's webhook, which can land a moment after the sheet closes, so the
 * confirmation screen polls this briefly rather than guessing an order number.
 */
export async function getOrderStatus(session: BuyerSession, paymentIntentId: string) {
  return authorized<OrderStatus>(
    `/api/buyer/order-status?paymentIntent=${encodeURIComponent(paymentIntentId)}`,
    session,
  );
}

/**
 * Places the cart on the buyer's credit account — no card. The server prices
 * the same cart, checks it against available credit, and returns the recorded
 * order immediately, so the success screen needs no polling.
 */
export async function orderOnAccount(
  session: BuyerSession,
  cart: CartQuantityMap,
  locationId: string,
) {
  const lines = Object.entries(cart)
    .filter(([, cases]) => cases > 0)
    .map(([sku, cases]) => ({ sku, cases }));
  return authorized<{ status: "recorded"; order: ConfirmedOrder; credit?: CreditState }>(
    "/api/buyer/order-on-account",
    session,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lines, locationId }),
    },
  );
}

export type StandingOrderInfo = {
  weekday: number;
  weekdayName: string;
  active: boolean;
  locationId: string;
  lastRunDate: string;
  lastRunStatus: string;
  lines: { sku: string; cases: number }[];
  /** Present-day pricing of the standing cart, from the server. */
  summary: { caseCount: number; totalCents: number; shippingCents: number } | null;
};

export async function getStandingOrder(session: BuyerSession) {
  const result = await authorized<{ standingOrder: StandingOrderInfo | null }>(
    "/api/buyer/standing-order",
    session,
  );
  return result.standingOrder;
}

/**
 * Turns the current cart into the weekly order. The server stores SKUs and
 * case counts only and re-prices on every run, so a price change is always
 * charged at the new price.
 */
export async function saveStandingOrder(
  session: BuyerSession,
  cart: CartQuantityMap,
  weekday: number,
  locationId: string,
) {
  const lines = Object.entries(cart)
    .filter(([, cases]) => cases > 0)
    .map(([sku, cases]) => ({ sku, cases }));
  const result = await authorized<{ standingOrder: StandingOrderInfo | null }>(
    "/api/buyer/standing-order",
    session,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ weekday, lines, locationId }),
    },
  );
  return result.standingOrder;
}

export async function pauseStandingOrder(session: BuyerSession) {
  const result = await authorized<{ standingOrder: StandingOrderInfo | null }>(
    "/api/buyer/standing-order",
    session,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "pause" }),
    },
  );
  return result.standingOrder;
}
