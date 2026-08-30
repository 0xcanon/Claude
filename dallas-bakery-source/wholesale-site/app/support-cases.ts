/**
 * Problems buyers raise, and what the bakery did about them.
 *
 * The rules live in support-cases-rules.ts; this is the storage and the
 * notifications. A case always reaches the owner by email as well as landing
 * in the queue, because a buyer whose delivery is missing should not depend
 * on someone happening to open the admin portal.
 */

import { and, desc, eq, sql } from "drizzle-orm";

import { getDb } from "../db";
import { supportCases } from "../db/schema";
import { recordEvent } from "./order-events.ts";
import {
  MAX_SUPPORT_REPLY_LENGTH,
  supportReason,
  validateSupportCase,
  type SupportCaseStatus,
} from "./support-cases-rules.ts";

export type SupportCase = typeof supportCases.$inferSelect;

export type OpenCaseInput = {
  applicationId: string;
  businessName: string;
  contactEmail: string;
  reason: string;
  message: string;
  orderId?: string;
  orderNumber?: number;
};

export type OpenCaseResult =
  | { ok: true; supportCase: SupportCase }
  | { ok: false; error: string };

/** Files a new case. Returns the stored row so the app can show it back. */
export async function openCase(input: OpenCaseInput): Promise<OpenCaseResult> {
  const problem = validateSupportCase(input);
  if (problem) return { ok: false, error: problem };

  const id = crypto.randomUUID();
  const db = getDb();
  await db.insert(supportCases).values({
    id,
    applicationId: input.applicationId,
    businessName: input.businessName.slice(0, 200),
    contactEmail: input.contactEmail.trim().toLowerCase(),
    orderId: String(input.orderId || ""),
    orderNumber: Number(input.orderNumber || 0),
    reason: input.reason,
    message: input.message.trim(),
    status: "open",
  });

  // A case about an order belongs in that order's history too, so the owner
  // opening the order sees it without going anywhere else.
  if (input.orderId) {
    const label = supportReason(input.reason)?.label || input.reason;
    await recordEvent({
      orderId: input.orderId,
      kind: "note",
      summary: `Buyer reported a problem: ${label}`,
      detail: input.message.trim(),
      actor: { kind: "buyer", email: input.contactEmail },
    });
  }

  const [stored] = await db.select().from(supportCases).where(eq(supportCases.id, id)).limit(1);
  return stored
    ? { ok: true, supportCase: stored }
    : { ok: false, error: "That could not be sent. Call us on (469) 729-4706." };
}

/** This buyer's own cases, newest first. */
export async function casesForBuyer(applicationId: string): Promise<SupportCase[]> {
  if (!applicationId) return [];
  return getDb()
    .select()
    .from(supportCases)
    .where(eq(supportCases.applicationId, applicationId))
    .orderBy(desc(supportCases.createdAt))
    .limit(50);
}

/** The owner's queue. Open cases first, oldest of those at the top. */
export async function openCases(): Promise<SupportCase[]> {
  return getDb()
    .select()
    .from(supportCases)
    .where(sql`${supportCases.status} != 'resolved'`)
    .orderBy(supportCases.createdAt)
    .limit(200);
}

export async function allCases(): Promise<SupportCase[]> {
  return getDb().select().from(supportCases).orderBy(desc(supportCases.createdAt)).limit(200);
}

export async function getCase(id: string): Promise<SupportCase | null> {
  const [row] = await getDb().select().from(supportCases).where(eq(supportCases.id, id)).limit(1);
  return row || null;
}

/**
 * The owner answering. A reply the buyer can read moves the case to
 * "answered"; resolving it closes it.
 */
export async function respondToCase(input: {
  id: string;
  reply?: string;
  ownerNotes?: string;
  status?: SupportCaseStatus;
}): Promise<{ ok: true; supportCase: SupportCase } | { ok: false; error: string }> {
  const existing = await getCase(input.id);
  if (!existing) return { ok: false, error: "That case no longer exists." };

  const reply = input.reply === undefined
    ? existing.reply
    : String(input.reply).trim().slice(0, MAX_SUPPORT_REPLY_LENGTH);
  const notes = input.ownerNotes === undefined
    ? existing.ownerNotes
    : String(input.ownerNotes).trim().slice(0, MAX_SUPPORT_REPLY_LENGTH);

  // A case is only "answered" once there is something for the buyer to read.
  const status: SupportCaseStatus = input.status
    || (reply && existing.status === "open" ? "answered" : (existing.status as SupportCaseStatus));

  if (status === "resolved" && !reply) {
    return { ok: false, error: "Write the buyer a line before closing this — they're waiting." };
  }

  await getDb()
    .update(supportCases)
    .set({
      reply,
      ownerNotes: notes,
      status,
      resolvedAt: status === "resolved" ? sql`CURRENT_TIMESTAMP` : null,
      updatedAt: sql`CURRENT_TIMESTAMP`,
    })
    .where(eq(supportCases.id, input.id));

  if (existing.orderId && status === "resolved") {
    await recordEvent({
      orderId: existing.orderId,
      kind: "note",
      summary: "Buyer's problem resolved.",
      detail: reply,
      actor: { kind: "system" },
    });
  }

  const updated = await getCase(input.id);
  return updated ? { ok: true, supportCase: updated } : { ok: false, error: "That could not be saved." };
}

/** How many cases are waiting, for the admin dashboard's badge. */
export async function openCaseCount() {
  const [row] = await getDb()
    .select({ count: sql<number>`COUNT(*)` })
    .from(supportCases)
    .where(and(sql`${supportCases.status} != 'resolved'`));
  return Number(row?.count || 0);
}
