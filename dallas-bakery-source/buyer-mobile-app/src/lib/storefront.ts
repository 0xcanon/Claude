/**
 * Private catalog and payment against the Dallas Bakery API.
 *
 * Cases and prices come from the server; the app sends SKUs and case counts,
 * never money. Payment returns a Stripe client secret, which can only confirm
 * the one payment the server priced — a patched app cannot change the amount.
 */

import { apiUrl } from "./api";
import type {
  BuyerInvoice,
  BuyerSession,
  BuyerSupportCase,
  OrderTimeline,
  SupportReasonOption,
  CartQuantityMap,
  CatalogProduct,
  ClosurePreview,
  DeliveryWindow,
  NotificationPreferences,
  ShippingSettings,
} from "../types";

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
  /** 15 or 30 for Net terms; 0 when the account has none. */
  termsDays: number;
  /** The slice of the balance past its due date — locks on-account ordering. */
  overdueCents: number;
};

export type CatalogPayload = {
  products: CatalogProduct[];
  shipping: ShippingSettings;
  orderRules: OrderRulesSummary;
  cutoff: { shipsToday: boolean; label: string };
  /** The buyer's credit position — drives the "order on account" option. */
  credit?: CreditState;
  /** Delivery days this buyer may request, given today's cutoff. */
  deliveryWindow?: DeliveryWindow;
  poNumberMaxLength?: number;
};

/** The paperwork a buyer can attach to an order. Both optional. */
export type OrderPaperwork = {
  poNumber?: string;
  requestedDeliveryDate?: string;
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
  paperwork: OrderPaperwork = {},
) {
  const lines = Object.entries(cart)
    .filter(([, cases]) => cases > 0)
    .map(([sku, cases]) => ({ sku, cases }));
  return authorized<PaymentStart>("/api/buyer/payment-intent", session, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // The server resolves the id against owner-approved addresses; anything
    // unknown falls back to the screened primary storefront.
    body: JSON.stringify({
      lines,
      locationId,
      poNumber: paperwork.poNumber || "",
      requestedDeliveryDate: paperwork.requestedDeliveryDate || "",
    }),
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
  /** "Net 15" / "Net 30" and the invoice due date, for account orders. */
  termsLabel?: string;
  invoiceDueAt?: string;
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
  paperwork: OrderPaperwork = {},
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
      body: JSON.stringify({
        lines,
        locationId,
        poNumber: paperwork.poNumber || "",
        requestedDeliveryDate: paperwork.requestedDeliveryDate || "",
      }),
    },
  );
}

export type InvoiceListPayload = {
  invoices: BuyerInvoice[];
  openBalanceCents: number;
  overdueCents: number;
  termsLabel: string;
};

/** Everything billable on this account, newest first. */
export async function getInvoices(session: BuyerSession) {
  return authorized<InvoiceListPayload>("/api/buyer/documents", session);
}

/**
 * Trades the buyer's session for a short-lived link to one printable
 * document. The app opens that link in the phone's browser, where printing
 * and "save as PDF" already exist — an in-app viewer would only reimplement
 * them worse.
 */
export async function getDocumentLink(
  session: BuyerSession,
  kind: "invoice" | "statement",
  orderId = "",
) {
  const result = await authorized<{ url: string; expiresAt: number }>(
    "/api/buyer/documents",
    session,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, orderId }),
    },
  );
  return result.url;
}

/**
 * Tells the server which device to notify for this business. Best-effort: a
 * buyer who declines notifications, or whose registration fails, still uses
 * the app normally.
 */
export async function registerPushToken(session: BuyerSession, token: string, platform: string) {
  try {
    await authorized<{ registered: boolean }>("/api/push/register", session, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, audience: "buyer", platform }),
    });
    return true;
  } catch {
    return false;
  }
}

/** Sign-out: this phone stops receiving this business's notifications. */
export async function unregisterPushToken(token: string) {
  if (!token) return;
  try {
    await fetch(apiUrl("/api/push/register"), {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
  } catch {
    // A phone that cannot reach the server on sign-out simply keeps its row
    // until the next sign-in replaces it.
  }
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


/* ------------------------------------------------------ account closure -- */

/**
 * What closing the account would erase and what the bakery has to keep.
 * Loaded before anything is destroyed so the screen can say it plainly.
 */
export async function getClosurePreview(session: BuyerSession) {
  const result = await authorized<{ preview: ClosurePreview; confirmPhrase: string }>(
    "/api/buyer/close-account",
    session,
  );
  return result.preview;
}

/**
 * Closes the account. Irreversible, and the session dies with it — the server
 * excludes closed accounts from every buyer lookup, so the token this call
 * was made with stops working the moment it returns.
 */
export async function closeAccount(session: BuyerSession, confirm: string, reason: string) {
  return authorized<{
    closed: true;
    businessName: string;
    ordersRetained: number;
    outstandingCents: number;
  }>("/api/buyer/close-account", session, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ confirm, reason }),
  });
}

/* ------------------------------------------------ notification settings -- */

/**
 * This device's notification choices. Keyed by the push token rather than the
 * session: a person turning their own alerts off should never be stopped by
 * an expired sign-in.
 */
export async function getNotificationPreferences(deviceToken: string) {
  if (!deviceToken) return null;
  try {
    const response = await fetch(
      apiUrl(`/api/push/register?token=${encodeURIComponent(deviceToken)}`),
      { headers: { Accept: "application/json" } },
    );
    if (!response.ok) return null;
    const data = (await response.json()) as {
      registered: boolean;
      preferences: NotificationPreferences;
    };
    return data.preferences || null;
  } catch {
    return null;
  }
}

export async function setNotificationPreferences(
  deviceToken: string,
  preferences: NotificationPreferences,
) {
  const response = await fetch(apiUrl("/api/push/register"), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: deviceToken, ...preferences }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new CatalogError(
      typeof data?.error === "string" ? data.error : "That could not be saved.",
      response.status,
    );
  }
  return (data as { preferences: NotificationPreferences }).preferences;
}

/* ----------------------------------------------------- telling us a problem -- */

/**
 * The reasons a buyer can pick from, and the cases they have already raised.
 *
 * The list comes from the server so the app and the website offer the same
 * words — a shop that reports "the order was short" in the app and sees
 * something different on the site would reasonably wonder which one we read.
 */
export async function getSupportCases(session: BuyerSession) {
  return authorized<{
    reasons: SupportReasonOption[];
    maxMessageLength: number;
    cases: BuyerSupportCase[];
  }>("/api/buyer/support", session);
}

/** Files a problem. `orderId` is required for the order-specific reasons. */
export async function reportProblem(
  session: BuyerSession,
  input: { reason: string; message: string; orderId?: string },
) {
  return authorized<{ ok: true; case: { id: string; status: string }; message: string }>(
    "/api/buyer/support",
    session,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "report", ...input }),
    },
  );
}

/**
 * Asks for an order to be cancelled. It is a request: by now the bread may
 * already be baked, so the bakery answers rather than the app deciding.
 */
export async function askToCancelOrder(
  session: BuyerSession,
  orderId: string,
  message: string,
) {
  return authorized<{ ok: true; requested: true; message: string }>(
    "/api/buyer/support",
    session,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "cancel", orderId, message }),
    },
  );
}

/** One order's story: what happened to it, when, and who did it. */
export async function getOrderTimeline(session: BuyerSession, orderId: string) {
  return authorized<OrderTimeline>(
    `/api/buyer/orders?id=${encodeURIComponent(orderId)}`,
    session,
  );
}
