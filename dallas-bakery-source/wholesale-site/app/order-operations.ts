/**
 * The things that happen to an order after it is placed: holding it,
 * correcting it, cancelling it, and sending money back.
 *
 * Every one of these writes to the order's history with who did it and why,
 * and every one refuses a move the state machine in order-status.ts says is
 * illegal — so "can this still be cancelled?" has exactly one answer no
 * matter which screen is asking.
 *
 * Money is the reason this file is careful. A refund is checked against what
 * is left on the order before Stripe is called, Stripe's own amount is what
 * gets recorded, and an account order is never "refunded" at all — nothing
 * was charged, so cancelling it releases the credit instead.
 */

import { eq, sql } from "drizzle-orm";

import { getDb } from "../db";
import { orders } from "../db/schema";
import { isDeliverableState, OUT_OF_AREA_MESSAGE } from "./order-rules.ts";
import { recordEvent, type Actor } from "./order-events.ts";
import {
  assessRefund,
  canCorrectOrder,
  canRequestCancellation,
  canTransition,
  isKnownReason,
} from "./order-status.ts";
import { createRefund } from "./stripe.ts";

export type OrderRow = typeof orders.$inferSelect;

type Outcome<T> = { ok: true; order: OrderRow } & T | { ok: false; error: string };

async function loadOrder(id: string): Promise<OrderRow | null> {
  const [row] = await getDb().select().from(orders).where(eq(orders.id, id)).limit(1);
  return row || null;
}

async function reload(id: string) {
  const row = await loadOrder(id);
  if (!row) throw new Error(`Order ${id} vanished mid-operation`);
  return row;
}

/* ------------------------------------------------------------------ hold -- */

/**
 * Pauses an order. Nothing is baked, no label is bought, and the buyer is
 * told it is paused — an order that silently stops is worse than a late one.
 */
export async function holdOrder(id: string, reason: string, actor: Actor): Promise<Outcome<object>> {
  const order = await loadOrder(id);
  if (!order) return { ok: false, error: "That order no longer exists." };
  if (order.status === "held") return { ok: true, order };
  if (!canTransition(order.status, "held")) {
    return { ok: false, error: `An order that is ${order.status} can't be put on hold.` };
  }
  const why = String(reason || "").trim();
  if (!why) return { ok: false, error: "Say why it is on hold — the buyer sees this." };

  await getDb()
    .update(orders)
    .set({ status: "held", holdReason: why.slice(0, 300), updatedAt: sql`CURRENT_TIMESTAMP` })
    .where(eq(orders.id, id));
  await recordEvent({
    orderId: id,
    kind: "held",
    summary: `Put on hold: ${why}`,
    actor,
  });
  return { ok: true, order: await reload(id) };
}

/** Puts a held order back in the bake schedule. */
export async function releaseOrder(id: string, actor: Actor): Promise<Outcome<object>> {
  const order = await loadOrder(id);
  if (!order) return { ok: false, error: "That order no longer exists." };
  if (order.status !== "held") return { ok: false, error: "That order is not on hold." };

  await getDb()
    .update(orders)
    .set({ status: "paid", holdReason: "", updatedAt: sql`CURRENT_TIMESTAMP` })
    .where(eq(orders.id, id));
  await recordEvent({
    orderId: id,
    kind: "released",
    summary: "Taken off hold and back in the bake schedule.",
    actor,
  });
  return { ok: true, order: await reload(id) };
}

/* ------------------------------------------------------------- correction -- */

export type OrderCorrection = {
  customerName?: string;
  street?: string;
  street2?: string;
  city?: string;
  state?: string;
  zip?: string;
  phone?: string;
  requestedDeliveryDate?: string;
  poNumber?: string;
};

/**
 * Fixes the delivery details on an order that has not been labeled yet.
 *
 * Only these fields: what was ordered and what it cost are not editable here,
 * because changing the money after the fact is a refund-and-reorder, not a
 * correction, and conflating the two is how books stop balancing.
 */
export async function correctOrder(
  id: string,
  correction: OrderCorrection,
  actor: Actor,
): Promise<Outcome<object>> {
  const order = await loadOrder(id);
  if (!order) return { ok: false, error: "That order no longer exists." };
  if (!canCorrectOrder(order.status)) {
    // Each of these is a different problem with a different fix, so each one
    // says what it actually is rather than guessing "already shipped".
    const WHY: Record<string, string> = {
      labeled: "A label is already printed for this order. Void it at UPS first, or refund and re-order.",
      shipped: "This order is already with UPS. Correcting the address here would not change the box.",
      delivered: "This order has been delivered. Nothing left to correct.",
      cancelled: "This order was cancelled. Take a new order instead.",
      refunded: "This order was refunded. Take a new order instead.",
    };
    return {
      ok: false,
      error: WHY[order.status] || `An order that is ${order.status} can't be corrected.`,
    };
  }

  const changes: Record<string, string> = {};
  const before: string[] = [];
  const fields: Array<[keyof OrderCorrection, string, string]> = [
    ["customerName", "Deliver to", order.customerName],
    ["street", "Street", order.street],
    ["street2", "Street 2", order.street2],
    ["city", "City", order.city],
    ["state", "State", order.state],
    ["zip", "ZIP", order.zip],
    ["phone", "Phone", order.phone],
    ["poNumber", "PO number", order.poNumber],
    ["requestedDeliveryDate", "Requested delivery", order.requestedDeliveryDate || ""],
  ];

  for (const [key, label, current] of fields) {
    const next = correction[key];
    if (next === undefined) continue;
    const value = String(next).trim();
    if (value === String(current || "")) continue;
    changes[key] = value;
    before.push(`${label}: "${current || "—"}" → "${value || "—"}"`);
  }

  if (!before.length) return { ok: true, order };

  // A corrected address still has to be somewhere we ship to.
  const state = (changes.state ?? order.state).toUpperCase();
  if (state && !isDeliverableState(state)) {
    return { ok: false, error: OUT_OF_AREA_MESSAGE };
  }
  if (changes.state) changes.state = state;

  await getDb()
    .update(orders)
    .set({ ...changes, updatedAt: sql`CURRENT_TIMESTAMP` })
    .where(eq(orders.id, id));
  await recordEvent({
    orderId: id,
    kind: "corrected",
    summary: `Order details corrected (${before.length} change${before.length === 1 ? "" : "s"}).`,
    detail: before.join("\n"),
    actor,
  });
  return { ok: true, order: await reload(id) };
}

/* ----------------------------------------------------------- cancellation -- */

/**
 * The buyer asking to cancel. It is a request, not the act: by now the bread
 * may already be baked, so the owner decides.
 */
export async function requestCancellation(
  id: string,
  reason: string,
  actor: Actor,
): Promise<Outcome<object>> {
  const order = await loadOrder(id);
  if (!order) return { ok: false, error: "That order no longer exists." };
  if (!canRequestCancellation(order.status, order.cancelRequestedAt)) {
    return {
      ok: false,
      error: order.cancelRequestedAt
        ? "You've already asked us to cancel this one — we're on it."
        : "This order is already packed. Call us on (469) 729-4706 and we'll sort it out.",
    };
  }

  await getDb()
    .update(orders)
    .set({
      cancelRequestedAt: sql`CURRENT_TIMESTAMP`,
      cancelReason: String(reason || "").trim().slice(0, 300),
      updatedAt: sql`CURRENT_TIMESTAMP`,
    })
    .where(eq(orders.id, id));
  await recordEvent({
    orderId: id,
    kind: "cancel_requested",
    summary: reason ? `Cancellation requested: ${reason}` : "Cancellation requested.",
    actor,
  });
  return { ok: true, order: await reload(id) };
}

/**
 * Cancels the order for real.
 *
 * A card order is refunded in full on the way out; an account order simply
 * releases the credit, because nothing was ever charged.
 */
export async function cancelOrder(
  id: string,
  reason: string,
  actor: Actor,
): Promise<Outcome<{ refundedCents: number }>> {
  const order = await loadOrder(id);
  if (!order) return { ok: false, error: "That order no longer exists." };
  if (order.status === "cancelled") {
    return { ok: true, order, refundedCents: order.refundedCents };
  }
  if (!canTransition(order.status, "cancelled")) {
    return {
      ok: false,
      error: "This order has already shipped. Refund it instead — the boxes are with UPS.",
    };
  }
  const why = String(reason || "").trim();
  if (!isKnownReason(why)) return { ok: false, error: "Pick a reason for cancelling." };

  // Card orders get their money back as part of cancelling.
  let refunded = order.refundedCents;
  if (order.paymentTerms !== "account" && order.stripePaymentIntentId) {
    const outstanding = Math.max(0, order.totalCents - order.refundedCents);
    if (outstanding > 0) {
      const result = await createRefund(order.stripePaymentIntentId, outstanding);
      if (!result.ok) {
        return { ok: false, error: `Stripe declined the refund: ${result.message}` };
      }
      refunded = order.refundedCents + Number(result.data.amount || outstanding);
      await recordEvent({
        orderId: id,
        kind: "refunded",
        summary: `Refunded $${(outstanding / 100).toFixed(2)} to the card.`,
        detail: `Stripe refund ${result.data.id}`,
        actor: { kind: "stripe" },
        amountCents: outstanding,
      });
    }
  }

  await getDb()
    .update(orders)
    .set({
      status: "cancelled",
      cancelledAt: sql`CURRENT_TIMESTAMP`,
      cancelReason: why.slice(0, 300),
      refundedCents: refunded,
      updatedAt: sql`CURRENT_TIMESTAMP`,
    })
    .where(eq(orders.id, id));
  await recordEvent({
    orderId: id,
    kind: "cancelled",
    summary: `Order cancelled — ${why}.`,
    detail: order.paymentTerms === "account"
      ? "Invoiced order: nothing was charged, and the amount is back on the account's credit."
      : "",
    actor,
  });
  return { ok: true, order: await reload(id), refundedCents: refunded };
}

/* --------------------------------------------------------------- refunds -- */

/**
 * Sends money back — all of it, or part of it for a short or damaged
 * shipment. The order keeps shipping unless the refund closes it out.
 */
export async function refundOrder(
  id: string,
  amountCents: number,
  reason: string,
  actor: Actor,
): Promise<Outcome<{ refundedCents: number; fullyRefunded: boolean }>> {
  const order = await loadOrder(id);
  if (!order) return { ok: false, error: "That order no longer exists." };

  const why = String(reason || "").trim();
  if (!isKnownReason(why)) return { ok: false, error: "Pick a reason for the refund." };

  const assessment = assessRefund(order, amountCents);
  if (!assessment.ok) return { ok: false, error: assessment.error };
  if (!order.stripePaymentIntentId) {
    return { ok: false, error: "This order has no card payment to refund." };
  }

  const result = await createRefund(order.stripePaymentIntentId, assessment.amountCents);
  if (!result.ok) return { ok: false, error: `Stripe declined the refund: ${result.message}` };

  // Stripe's number is the truth about how much actually moved.
  const moved = Number(result.data.amount || assessment.amountCents);
  const refunded = order.refundedCents + moved;
  const fully = refunded >= order.totalCents;

  await getDb()
    .update(orders)
    .set({
      refundedCents: refunded,
      // A full refund ends the order; a partial one leaves it where it was,
      // because the rest of the bread is still going out.
      ...(fully && !["shipped", "delivered"].includes(order.status) ? { status: "refunded" } : {}),
      ...(fully && ["shipped", "delivered"].includes(order.status) ? { status: "refunded" } : {}),
      updatedAt: sql`CURRENT_TIMESTAMP`,
    })
    .where(eq(orders.id, id));

  await recordEvent({
    orderId: id,
    kind: "refunded",
    summary: fully
      ? `Refunded in full — ${why}.`
      : `Refunded $${(moved / 100).toFixed(2)} of $${(order.totalCents / 100).toFixed(2)} — ${why}.`,
    detail: `Stripe refund ${result.data.id}`,
    actor,
    amountCents: moved,
  });

  return { ok: true, order: await reload(id), refundedCents: refunded, fullyRefunded: fully };
}

/** Marks an order delivered, which starts the 7-day claim window. */
export async function markDelivered(id: string, actor: Actor): Promise<Outcome<object>> {
  const order = await loadOrder(id);
  if (!order) return { ok: false, error: "That order no longer exists." };
  if (order.status === "delivered") return { ok: true, order };
  if (!canTransition(order.status, "delivered")) {
    return { ok: false, error: "Only a shipped order can be marked delivered." };
  }
  await getDb()
    .update(orders)
    .set({ status: "delivered", deliveredAt: sql`CURRENT_TIMESTAMP`, updatedAt: sql`CURRENT_TIMESTAMP` })
    .where(eq(orders.id, id));
  await recordEvent({
    orderId: id,
    kind: "delivered",
    summary: "Delivered.",
    actor,
  });
  return { ok: true, order: await reload(id) };
}
