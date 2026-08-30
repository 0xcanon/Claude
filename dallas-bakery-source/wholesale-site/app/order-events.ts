/**
 * The record of what happened to an order.
 *
 * Rows here are only ever inserted, never changed, because the whole point is
 * to be able to answer "what happened to order 1042, who did it, and what did
 * we tell the buyer" months later — for a dispute, a chargeback, or an
 * accountant asking why a refund was issued.
 *
 * Every lifecycle move goes through `recordEvent`. Writing an event is
 * best-effort: losing the note must never be the reason a refund fails, so a
 * failure here is logged loudly and the operation continues.
 */

import { and, asc, eq } from "drizzle-orm";

import { getDb } from "../db";
import { orderEvents } from "../db/schema";

export type OrderEventKind =
  | "placed"
  | "held"
  | "released"
  | "corrected"
  | "labeled"
  | "shipped"
  | "delivered"
  | "cancel_requested"
  | "cancelled"
  | "refunded"
  | "invoice_paid"
  | "note";

/** Who did it. Never blank — "system" when nobody pressed anything. */
export type Actor =
  | { kind: "owner"; email: string }
  | { kind: "buyer"; email: string }
  | { kind: "system" }
  | { kind: "stripe" };

export function actorLabel(actor: Actor) {
  if (actor.kind === "owner") return `owner:${actor.email}`;
  if (actor.kind === "buyer") return `buyer:${actor.email}`;
  return actor.kind;
}

/** How an actor string reads back to a person looking at the history. */
export function readableActor(actor: string) {
  const value = String(actor || "");
  if (value === "system") return "Automatically";
  if (value === "stripe") return "Stripe";
  if (value.startsWith("owner:")) return `Dallas Bakery (${value.slice(6)})`;
  if (value.startsWith("buyer:")) return value.slice(6);
  return value;
}

export async function recordEvent(input: {
  orderId: string;
  kind: OrderEventKind;
  summary: string;
  detail?: string;
  actor: Actor;
  amountCents?: number;
  /** Default true. Set false for anything only the bakery should read. */
  buyerVisible?: boolean;
}) {
  try {
    await getDb().insert(orderEvents).values({
      id: crypto.randomUUID(),
      orderId: input.orderId,
      kind: input.kind,
      summary: input.summary.slice(0, 300),
      detail: String(input.detail || "").slice(0, 2000),
      actor: actorLabel(input.actor),
      amountCents: Math.round(input.amountCents || 0),
      buyerVisible: input.buyerVisible !== false,
    });
  } catch (caught) {
    // The order history is the audit trail, not the operation. Never let a
    // failed note undo a refund that already went through.
    console.error(`Could not record ${input.kind} on order ${input.orderId}:`, caught);
  }
}

export type OrderEvent = typeof orderEvents.$inferSelect;

/** The whole history, oldest first — the owner's view. */
export async function eventsForOrder(orderId: string): Promise<OrderEvent[]> {
  if (!orderId) return [];
  return getDb()
    .select()
    .from(orderEvents)
    .where(eq(orderEvents.orderId, orderId))
    .orderBy(asc(orderEvents.createdAt))
    .limit(200);
}

/** Only what the buyer is meant to see, oldest first. */
export async function buyerEventsForOrder(orderId: string): Promise<OrderEvent[]> {
  if (!orderId) return [];
  return getDb()
    .select()
    .from(orderEvents)
    .where(and(eq(orderEvents.orderId, orderId), eq(orderEvents.buyerVisible, true)))
    .orderBy(asc(orderEvents.createdAt))
    .limit(100);
}
