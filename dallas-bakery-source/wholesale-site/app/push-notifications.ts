/**
 * Push notifications to the buyer app and the owner app.
 *
 * Delivery goes through Expo's push service, which fans out to APNs and FCM
 * and needs no credentials of its own for a standard Expo build — the device
 * token IS the address. Set EXPO_ACCESS_TOKEN to require a signed sender
 * (recommended once the apps are in the stores), and enhanced security in the
 * Expo dashboard will then reject unsigned sends.
 *
 * Best-effort, exactly like email: a push failure never fails the order that
 * triggered it. Tokens Expo reports as dead are deleted, so the table does
 * not fill up with uninstalled apps.
 */

import { and, eq, inArray, sql } from "drizzle-orm";

import { getDb } from "../db";
import { pushDevices } from "../db/schema";
import { isExpoPushToken, type PushMessage } from "./push-messages.ts";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const SEND_TIMEOUT_MS = 10_000;
/** Expo accepts up to 100 messages per request. */
const CHUNK_SIZE = 100;

export type PushAudience = "buyer" | "owner";

function accessToken() {
  return String(process.env.EXPO_ACCESS_TOKEN || "").trim();
}

/**
 * Records a device. Re-registering the same token updates who it belongs to
 * and refreshes last_seen_at, which is how a phone that changes hands stops
 * receiving the previous account's notifications.
 */
export async function registerDevice(input: {
  token: string;
  audience: PushAudience;
  applicationId?: string;
  email?: string;
  platform?: string;
}) {
  const token = String(input.token || "").trim();
  if (!isExpoPushToken(token)) return false;
  const values = {
    token,
    audience: input.audience,
    applicationId: String(input.applicationId || ""),
    email: String(input.email || "").trim().toLowerCase(),
    platform: String(input.platform || "").slice(0, 20),
  };
  await getDb()
    .insert(pushDevices)
    .values(values)
    .onConflictDoUpdate({
      target: pushDevices.token,
      set: { ...values, lastSeenAt: sql`CURRENT_TIMESTAMP` },
    });
  return true;
}

/** Forgets a device — sign-out, or the app asking to stop notifications. */
export async function unregisterDevice(token: string) {
  const value = String(token || "").trim();
  if (!value) return;
  await getDb().delete(pushDevices).where(eq(pushDevices.token, value));
}

async function tokensForBusiness(applicationId: string) {
  const id = String(applicationId || "").trim();
  if (!id) return [];
  const rows = await getDb()
    .select({ token: pushDevices.token })
    .from(pushDevices)
    .where(and(eq(pushDevices.audience, "buyer"), eq(pushDevices.applicationId, id)));
  return rows.map((row) => row.token);
}

async function ownerTokens() {
  const rows = await getDb()
    .select({ token: pushDevices.token })
    .from(pushDevices)
    .where(eq(pushDevices.audience, "owner"));
  return rows.map((row) => row.token);
}

type ExpoTicket = {
  status?: string;
  message?: string;
  details?: { error?: string };
};

/**
 * Posts one chunk to Expo and returns the tokens Expo says are dead, so the
 * caller can delete them.
 */
async function postChunk(tokens: string[], message: PushMessage): Promise<string[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);
  try {
    const response = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(accessToken() ? { Authorization: `Bearer ${accessToken()}` } : {}),
      },
      body: JSON.stringify(
        tokens.map((to) => ({
          to,
          title: message.title,
          body: message.body,
          data: message.data,
          sound: "default",
          priority: "high",
          channelId: "default",
        })),
      ),
      signal: controller.signal,
    });
    if (!response.ok) {
      console.error(`Expo push failed with HTTP ${response.status}.`);
      return [];
    }
    const payload = (await response.json()) as { data?: ExpoTicket[] };
    const tickets = Array.isArray(payload?.data) ? payload.data : [];
    const dead: string[] = [];
    tickets.forEach((ticket, index) => {
      if (ticket?.status !== "error") return;
      // The app was uninstalled or the token was revoked; anything else is
      // transient and the token stays.
      if (ticket.details?.error === "DeviceNotRegistered") {
        const token = tokens[index];
        if (token) dead.push(token);
      } else {
        console.error(`Expo push ticket error: ${ticket.details?.error || ticket.message || "unknown"}`);
      }
    });
    return dead;
  } catch (caught) {
    console.error("Expo push failed:", caught instanceof Error ? caught.message : caught);
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Sends one message to a set of device tokens. Returns how many devices it
 * went to. Never throws.
 */
export async function sendPush(tokens: string[], message: PushMessage) {
  const valid = Array.from(new Set(tokens.filter(isExpoPushToken)));
  if (!valid.length) return 0;

  const dead: string[] = [];
  for (let index = 0; index < valid.length; index += CHUNK_SIZE) {
    dead.push(...(await postChunk(valid.slice(index, index + CHUNK_SIZE), message)));
  }
  if (dead.length) {
    try {
      await getDb().delete(pushDevices).where(inArray(pushDevices.token, dead));
    } catch (caught) {
      console.error("Could not prune dead push tokens:", caught);
    }
  }
  return valid.length - dead.length;
}

/** Everyone signed in to the buyer app for this business. */
export async function pushToBuyer(applicationId: string, message: PushMessage) {
  try {
    return await sendPush(await tokensForBusiness(applicationId), message);
  } catch (caught) {
    console.error("Buyer push failed:", caught);
    return 0;
  }
}

/** Every device running the owner app. */
export async function pushToOwner(message: PushMessage) {
  try {
    return await sendPush(await ownerTokens(), message);
  } catch (caught) {
    console.error("Owner push failed:", caught);
    return 0;
  }
}

/** Device counts for the admin dashboard, so the owner knows it is live. */
export async function pushDeviceCounts() {
  const rows = await getDb()
    .select({ audience: pushDevices.audience, count: sql<number>`COUNT(*)` })
    .from(pushDevices)
    .groupBy(pushDevices.audience);
  const counts = { buyer: 0, owner: 0 };
  for (const row of rows) {
    if (row.audience === "owner") counts.owner = Number(row.count || 0);
    else counts.buyer = Number(row.count || 0);
  }
  return counts;
}
