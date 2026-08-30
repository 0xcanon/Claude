/**
 * The marketing list: who opted in, and how a campaign reaches them.
 *
 * Deliberately separate from the transactional mail in email-notifications:
 * a buyer who unsubscribes here still gets order confirmations and tracking,
 * because those are not marketing and turning them off would break the
 * business relationship they are still in.
 *
 * Nobody is added without asking. The application form carries an unchecked
 * opt-in box, and the owner can add an address by hand for someone who asked
 * in person — both record which it was in `source`.
 */

import { desc, eq, isNull, sql } from "drizzle-orm";

import { getDb } from "../db";
import { marketingSubscribers } from "../db/schema";
import { sendMail } from "./email-notifications.ts";
import {
  composeCampaign,
  previewSubject,
  validateCampaign,
  type CampaignDraft,
} from "./marketing-copy.ts";

/** Sends are spaced so a burst never trips the provider's rate limit. */
const SEND_BATCH_SIZE = 20;

function normalize(email: string) {
  return String(email || "").trim().toLowerCase();
}

function newToken() {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function unsubscribeUrlFor(origin: string, token: string) {
  return `${origin.replace(/\/$/, "")}/api/marketing/unsubscribe?token=${encodeURIComponent(token)}`;
}

/**
 * Adds an address, or brings a previously unsubscribed one back. Re-running
 * it is safe: an already-subscribed address keeps its token, so links in
 * emails already sent go on working.
 */
export async function subscribe(
  email: string,
  businessName = "",
  source: "application" | "admin" | "site" = "application",
) {
  const address = normalize(email);
  if (!address || !address.includes("@")) return null;
  const db = getDb();
  const token = newToken();
  await db
    .insert(marketingSubscribers)
    .values({
      email: address,
      businessName: String(businessName || "").slice(0, 200),
      source,
      unsubscribeToken: token,
      unsubscribedAt: null,
    })
    .onConflictDoUpdate({
      target: marketingSubscribers.email,
      set: {
        // Re-subscribing clears the opt-out; the existing token is kept.
        unsubscribedAt: null,
        businessName: String(businessName || "").slice(0, 200),
      },
    });
  const [row] = await db
    .select()
    .from(marketingSubscribers)
    .where(eq(marketingSubscribers.email, address))
    .limit(1);
  return row || null;
}

/**
 * Honours an unsubscribe. Returns the address removed, or null when the
 * token is unknown — the route says the same thing either way, so a stale
 * link never leaves someone thinking they are still subscribed.
 */
export async function unsubscribeByToken(token: string) {
  const value = String(token || "").trim();
  if (!value) return null;
  const db = getDb();
  const [row] = await db
    .select()
    .from(marketingSubscribers)
    .where(eq(marketingSubscribers.unsubscribeToken, value))
    .limit(1);
  if (!row) return null;
  if (!row.unsubscribedAt) {
    await db
      .update(marketingSubscribers)
      .set({ unsubscribedAt: sql`CURRENT_TIMESTAMP` })
      .where(eq(marketingSubscribers.email, row.email));
  }
  return row;
}

/** Removes an address by hand, for someone who asked over the phone. */
export async function unsubscribeByEmail(email: string) {
  const address = normalize(email);
  if (!address) return;
  await getDb()
    .update(marketingSubscribers)
    .set({ unsubscribedAt: sql`CURRENT_TIMESTAMP` })
    .where(eq(marketingSubscribers.email, address));
}

export async function activeSubscribers() {
  return getDb()
    .select()
    .from(marketingSubscribers)
    .where(isNull(marketingSubscribers.unsubscribedAt))
    .orderBy(desc(marketingSubscribers.subscribedAt));
}

/** The admin list, opted-out addresses included so the record is honest. */
export async function listSubscribers() {
  return getDb()
    .select()
    .from(marketingSubscribers)
    .orderBy(desc(marketingSubscribers.subscribedAt))
    .limit(1000);
}

export type CampaignResult = {
  ok: boolean;
  error?: string;
  sent: number;
  failed: number;
  recipients: number;
};

/**
 * Sends a campaign to everyone currently opted in. Every message carries its
 * own unsubscribe link and the postal address, and a failed send is counted
 * rather than aborting the run — one bad address must not stop the list.
 */
export async function sendCampaign(draft: CampaignDraft, origin: string): Promise<CampaignResult> {
  const problem = validateCampaign(draft);
  if (problem) return { ok: false, error: problem, sent: 0, failed: 0, recipients: 0 };

  const subscribers = await activeSubscribers();
  if (!subscribers.length) {
    return { ok: false, error: "Nobody is on the list yet.", sent: 0, failed: 0, recipients: 0 };
  }

  let sent = 0;
  let failed = 0;
  for (let index = 0; index < subscribers.length; index += SEND_BATCH_SIZE) {
    const batch = subscribers.slice(index, index + SEND_BATCH_SIZE);
    const results = await Promise.all(
      batch.map((subscriber) =>
        sendMail({
          to: subscriber.email,
          subject: draft.subject.trim(),
          text: composeCampaign(
            draft,
            subscriber,
            unsubscribeUrlFor(origin, subscriber.unsubscribeToken),
          ),
        }),
      ),
    );
    for (const ok of results) {
      if (ok) sent += 1;
      else failed += 1;
    }
  }

  return { ok: true, sent, failed, recipients: subscribers.length };
}

/** Sends the owner a copy of exactly what the list would receive. */
export async function sendCampaignTest(draft: CampaignDraft, to: string, origin: string) {
  const problem = validateCampaign(draft);
  if (problem) return { ok: false, error: problem };
  const address = normalize(to);
  if (!address) return { ok: false, error: "No address to send the test to." };
  const delivered = await sendMail({
    to: address,
    subject: previewSubject(draft.subject.trim()),
    text: composeCampaign(
      draft,
      { businessName: "Sample Bakery Customer" },
      unsubscribeUrlFor(origin, "sample-token"),
    ),
  });
  return delivered
    ? { ok: true }
    : { ok: false, error: "The test could not be sent. Check the mail settings." };
}
