import type {
  ApplicationStatus,
  MobileSession,
  ShippingSettings,
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
