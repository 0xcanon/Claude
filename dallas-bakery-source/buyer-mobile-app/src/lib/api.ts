import type {
  ApplicationInput,
  ShippingSettings,
  TrackedApplication,
} from "../types";

const API_URL = (process.env.EXPO_PUBLIC_API_URL || "https://dallasbakery.net").replace(/\/+$/, "");

/** Absolute URL for an API path — shared with the buyer auth and catalog. */
export function apiUrl(path: string) {
  return `${API_URL}${path}`;
}
const REQUEST_TIMEOUT_MS = 15_000;

export class BuyerApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "BuyerApiError";
  }
}

async function request<T>(
  path: string,
  options: { method?: "GET" | "POST"; token?: string; body?: Record<string, unknown> } = {},
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method: options.method || "GET",
      headers: {
        Accept: "application/json",
        "X-Dallas-Bakery-Client": "buyer-app",
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });
  } catch (caught) {
    throw new BuyerApiError(
      caught instanceof Error && caught.name === "AbortError"
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
    // Status-based fallback below.
  }
  if (!response.ok) {
    const message = typeof data.message === "string"
      ? data.message
      : typeof data.error === "string"
        ? data.error
        : "Dallas Bakery could not complete that request.";
    throw new BuyerApiError(message, response.status);
  }
  return data as T;
}

export async function getShippingSettings() {
  const result = await request<{ shipping: ShippingSettings }>("/api/wholesale-settings");
  return result.shipping;
}

export async function submitWholesaleApplication(input: ApplicationInput, elapsedMs: number) {
  return request<{
    status: "submitted";
    message: string;
    applicationId: string;
    trackingToken?: string;
    alreadySubmitted?: boolean;
  }>("/api/verify-wholesale-business", {
    method: "POST",
    body: {
      ...input,
      shippingAddress: input.storeAddress,
      honeypot: "",
      elapsedMs,
    },
  });
}

export async function getTrackedApplication(token: string) {
  const result = await request<{ application: TrackedApplication }>(
    "/api/mobile/buyer/application-status",
    { token },
  );
  return result.application;
}
