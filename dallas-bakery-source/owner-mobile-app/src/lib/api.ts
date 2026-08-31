import type {
  ApplicationStatus,
  LabelOutcome,
  MobileSession,
  OrderEvent,
  OrderStatus,
  OwnerOrder,
  OwnerProduct,
  OwnerSummary,
  ShippingSettings,
  SupportCase,
  WholesaleApplication,
} from "../types";

const DEFAULT_API_URL = "https://dallasbakery.net";
const API_URL = (process.env.EXPO_PUBLIC_API_URL || DEFAULT_API_URL).replace(/\/+$/, "");
const REQUEST_TIMEOUT_MS = 15_000;

type RequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  token?: string;
  body?: Record<string, unknown>;
};

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (options.body) headers["Content-Type"] = "application/json";
  if (options.token) headers.Authorization = `Bearer ${options.token}`;

  let response: Response;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    response = await fetch(`${API_URL}${path}`, {
      method: options.method || "GET",
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });
  } catch (caught) {
    const timedOut = caught instanceof Error && caught.name === "AbortError";
    throw new ApiError(
      timedOut
        ? "Dallas Bakery took too long to respond. Please try again."
        : "Unable to reach Dallas Bakery. Check your connection and try again.",
      0,
    );
  } finally {
    clearTimeout(timeout);
  }

  let data: Record<string, unknown> = {};
  try {
    data = (await response.json()) as Record<string, unknown>;
  } catch {
    // The status still provides a useful fallback error below.
  }

  if (!response.ok) {
    const message = typeof data.error === "string"
      ? data.error
      : "Dallas Bakery could not complete that request.";
    throw new ApiError(message, response.status);
  }
  return data as T;
}

export async function signIn(email: string, password: string) {
  return request<MobileSession & { ok: true }>("/api/mobile/admin/login", {
    method: "POST",
    body: { email, password },
  });
}

export async function changePassword(token: string, password: string) {
  return request<{ ok: true }>("/api/mobile/admin/change-password", {
    method: "POST",
    token,
    body: { password },
  });
}

export async function getApplications(token: string) {
  const result = await request<{ applications: WholesaleApplication[] }>(
    "/api/mobile/admin/applications",
    { token },
  );
  return result.applications;
}

export async function getShippingSettings(token: string) {
  const result = await request<{ shipping: ShippingSettings }>(
    "/api/mobile/admin/settings/shipping",
    { token },
  );
  return result.shipping;
}

export async function updateShippingSettings(
  token: string,
  rateCents: number,
  unitsPerBox: number,
) {
  const result = await request<{ shipping: ShippingSettings }>(
    "/api/mobile/admin/settings/shipping",
    {
      method: "PATCH",
      token,
      body: { rateCents, unitsPerBox },
    },
  );
  return result.shipping;
}

export async function updateApplication(
  token: string,
  id: string,
  status: ApplicationStatus,
  ownerNotes: string,
) {
  const result = await request<{ application: WholesaleApplication }>(
    "/api/mobile/admin/applications",
    {
      method: "PATCH",
      token,
      body: { id, status, ownerNotes },
    },
  );
  return result.application;
}

/**
 * Registers this phone for new-order alerts. Best-effort: a failure here must
 * never keep the owner out of the dashboard, so callers ignore the result.
 */
export async function registerPushToken(token: string, deviceToken: string, platform: string) {
  try {
    await request<{ registered: boolean }>("/api/push/register", {
      method: "POST",
      token,
      body: { token: deviceToken, audience: "owner", platform },
    });
    return true;
  } catch {
    return false;
  }
}

/** Sign-out: this phone stops buzzing for the bakery's orders. */
export async function unregisterPushToken(deviceToken: string) {
  if (!deviceToken) return;
  try {
    await request<{ registered: boolean }>("/api/push/register", {
      method: "DELETE",
      body: { token: deviceToken },
    });
  } catch {
    // A phone that cannot reach the server on sign-out keeps its row until
    // the next sign-in replaces it.
  }
}

/* -------------------------------------------------- running the bakery -- */

export async function getOwnerSummary(token: string) {
  return request<OwnerSummary>("/api/mobile/admin/summary", { token });
}

export async function getOrders(token: string, scope: "unshipped" | "today" | "all") {
  const result = await request<{ orders: OwnerOrder[] }>(
    `/api/mobile/admin/orders?scope=${scope}`,
    { token },
  );
  return result.orders;
}

/** Buys UPS labels. Failures come back per order, not as one thrown error. */
export async function createLabels(token: string, ids: string[]) {
  const result = await request<{ results: LabelOutcome[]; message?: string }>(
    "/api/mobile/admin/orders",
    { method: "POST", token, body: { action: "create-labels", ids } },
  );
  return result;
}

export async function markShipped(token: string, ids: string[]) {
  const result = await request<{ shipped: number }>("/api/mobile/admin/orders", {
    method: "POST",
    token,
    body: { action: "mark-shipped", ids },
  });
  return result.shipped;
}

export async function markInvoicePaid(token: string, id: string) {
  return request<{ invoicePaid: boolean; orderNumber: number }>("/api/mobile/admin/orders", {
    method: "POST",
    token,
    body: { action: "mark-invoice-paid", ids: [id] },
  });
}

export async function getOrderHistory(token: string, id: string) {
  return request<{ reasons: string[]; events: OrderEvent[] }>(
    `/api/mobile/admin/order-actions?id=${encodeURIComponent(id)}`,
    { token },
  );
}

/**
 * One order, one change. The server decides what is legal, so the app can
 * offer a button and let the refusal come back as a sentence to show.
 */
export async function orderAction(
  token: string,
  body: {
    action: "hold" | "release" | "correct" | "cancel" | "refund" | "mark-delivered";
    id: string;
    reason?: string;
    amountCents?: number;
    correction?: Record<string, string>;
  },
) {
  return request<{ ok: true; order: { id: string; orderNumber: number; status: OrderStatus; refundedCents: number } }>(
    "/api/mobile/admin/order-actions",
    { method: "POST", token, body },
  );
}

export async function getSupportCases(token: string) {
  return request<{ cases: SupportCase[]; openCount: number }>("/api/mobile/admin/support", { token });
}

export async function respondToCase(
  token: string,
  body: { id: string; reply?: string; ownerNotes?: string; status?: "open" | "answered" | "resolved" },
) {
  return request<{ ok: true; case: { id: string; status: string } }>("/api/mobile/admin/support", {
    method: "POST",
    token,
    body,
  });
}

export async function getOwnerProducts(token: string) {
  const result = await request<{ products: OwnerProduct[] }>("/api/mobile/admin/products", { token });
  return result.products;
}

export async function updateProductStock(
  token: string,
  body: { sku: string; inStock?: boolean; dailyCapacityCases?: number },
) {
  return request<{ ok: true; product: OwnerProduct }>("/api/mobile/admin/products", {
    method: "PATCH",
    token,
    body,
  });
}
