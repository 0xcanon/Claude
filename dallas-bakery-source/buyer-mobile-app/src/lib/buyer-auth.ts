/**
 * Buyer sign-in — email plus a six-digit code, issued and checked by the
 * Dallas Bakery API. Email plus a six-digit code:
 * ordering runs on Stripe now, so there is no external identity provider and
 * no browser round trip. The app never handles a password.
 *
 * The session token is a signed string from the server. It is kept in
 * SecureStore and sent as a bearer token; nothing sensitive is derived on the
 * device.
 */

import * as SecureStore from "expo-secure-store";

import { apiUrl } from "./api";
import type { BuyerAccount, BuyerSession } from "../types";

const SESSION_KEY = "dallas-bakery-buyer-session";
const REQUEST_TIMEOUT_MS = 15_000;

export class BuyerAccountError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "BuyerAccountError";
    this.status = status;
  }
}

async function post<T>(path: string, body: unknown, token?: string): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(apiUrl(path), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new BuyerAccountError(
        typeof data?.error === "string" ? data.error : "Dallas Bakery could not complete that request.",
        response.status,
      );
    }
    return data as T;
  } catch (caught) {
    if (caught instanceof BuyerAccountError) throw caught;
    throw new BuyerAccountError("Dallas Bakery could not be reached. Check your connection.", 0);
  } finally {
    clearTimeout(timeout);
  }
}

/** Asks for a code. The answer is deliberately the same for any address. */
export async function requestSignInCode(email: string) {
  return post<{ status: string; message: string }>("/api/buyer/request-code", {
    email: email.trim().toLowerCase(),
  });
}

export async function verifySignInCode(email: string, code: string) {
  const result = await post<{
    token: string;
    expiresAt: number;
    account: { id: string; displayName: string; firstName: string; lastName: string; email: string };
  }>("/api/buyer/verify-code", { email: email.trim().toLowerCase(), code });

  const session: BuyerSession = {
    accessToken: result.token,
    idToken: "",
    expiresAt: result.expiresAt,
  };
  await storeBuyerSession(session);
  return { session, account: result.account };
}

export async function storeBuyerSession(session: BuyerSession) {
  await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(session));
}

export async function loadBuyerSession(): Promise<BuyerSession | null> {
  try {
    const raw = await SecureStore.getItemAsync(SESSION_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw) as BuyerSession;
    if (!session.accessToken || session.expiresAt <= Date.now()) {
      await clearBuyerSession();
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

export async function clearBuyerSession() {
  try {
    await SecureStore.deleteItemAsync(SESSION_KEY);
  } catch {
    // Nothing to clear.
  }
}

/**
 * There is no server session to end — the token is stateless and short-lived.
 * Kept as a named export so sign-out reads the same in App.tsx.
 */
export async function signOutBuyer(_session: BuyerSession | null) {
  await clearBuyerSession();
}

export async function getBuyerAccount(session: BuyerSession): Promise<BuyerAccount> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const [catalogResponse, ordersResponse] = await Promise.all([
      fetch(apiUrl("/api/buyer/catalog"), {
        headers: { Authorization: `Bearer ${session.accessToken}` },
        signal: controller.signal,
      }),
      fetch(apiUrl("/api/buyer/orders"), {
        headers: { Authorization: `Bearer ${session.accessToken}` },
        signal: controller.signal,
      }),
    ]);
    if (catalogResponse.status === 401 || catalogResponse.status === 403) {
      throw new BuyerAccountError("Your session expired. Sign in again.", 401);
    }
    if (!catalogResponse.ok) {
      throw new BuyerAccountError("Your account could not be loaded.", catalogResponse.status);
    }
    const catalog = await catalogResponse.json();
    const orders = ordersResponse.ok ? (await ordersResponse.json()).orders || [] : [];
    const location = catalog.locations?.[0];
    return {
      id: location?.id || "buyer",
      displayName: location?.companyName || "Wholesale account",
      firstName: "",
      lastName: "",
      email: "",
      locations: catalog.locations || [],
      orders,
    };
  } catch (caught) {
    if (caught instanceof BuyerAccountError) throw caught;
    throw new BuyerAccountError("Dallas Bakery could not be reached.", 0);
  } finally {
    clearTimeout(timeout);
  }
}
