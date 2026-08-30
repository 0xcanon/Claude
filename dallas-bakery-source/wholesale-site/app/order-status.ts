/**
 * One vocabulary for where an order is, shared by the buyer app, the website's
 * order history, and the admin queue — plus the rules for which move is legal
 * from which state.
 *
 * "Labeled" is an internal bakery step (a label has been bought), so buyers
 * are shown "packed" rather than a word that only means something on the
 * shipping bench.
 *
 * No database import, so the whole state machine is unit-testable and the
 * same rules run on the website, both apps, and the admin queue.
 */

export type OrderStage =
  | "paid"
  | "held"
  | "labeled"
  | "shipped"
  | "delivered"
  | "cancelled"
  | "refunded";

export type BuyerStage = {
  key: OrderStage;
  /** Short label for a status pill. */
  label: string;
  /** One line explaining what is happening now. */
  detail: string;
  /** Position in the three-step tracker shown to buyers. */
  step: 1 | 2 | 3;
};

const STAGES: Record<OrderStage, BuyerStage> = {
  refunded: {
    key: "refunded",
    label: "Refunded",
    detail: "This order was refunded in full. Nothing ships.",
    step: 1,
  },
  cancelled: {
    key: "cancelled",
    label: "Cancelled",
    detail: "This order was cancelled. Anything paid has been returned.",
    step: 1,
  },
  held: {
    key: "held",
    label: "On hold",
    detail: "We have paused this order and will be in touch. Nothing is baking yet.",
    step: 1,
  },
  delivered: {
    key: "delivered",
    label: "Delivered",
    detail: "UPS says this arrived. Tell us within 7 days if anything is wrong.",
    step: 3,
  },
  paid: {
    key: "paid",
    label: "Baking",
    detail: "Your cases are in the bake schedule.",
    step: 1,
  },
  labeled: {
    key: "labeled",
    label: "Packed",
    detail: "Boxed and waiting for the UPS pickup.",
    step: 2,
  },
  shipped: {
    key: "shipped",
    label: "Shipped",
    detail: "On its way. Track it with the number below.",
    step: 3,
  },
};

export function buyerStage(status: string): BuyerStage {
  return STAGES[status as OrderStage] || STAGES.paid;
}

/** UPS public tracking page for a tracking number. */
export function trackingUrl(trackingNumber: string) {
  const trimmed = String(trackingNumber || "").trim();
  return trimmed ? `https://www.ups.com/track?loc=en_US&tracknum=${encodeURIComponent(trimmed)}` : "";
}

/**
 * Whether a buyer can track this order yet. A tracking number exists from the
 * moment a label is bought, but UPS has nothing to show until the parcel is
 * scanned, so tracking is offered only once the order is actually shipped.
 */
export function isTrackable(status: string, trackingNumber: string) {
  return status === "shipped" && Boolean(String(trackingNumber || "").trim());
}

/* ------------------------------------------------------- the state machine -- */

/** A state an order can never leave: the money and the bread are settled. */
export const TERMINAL_STAGES: OrderStage[] = ["cancelled", "refunded", "delivered"];

export function isTerminal(status: string) {
  return TERMINAL_STAGES.includes(status as OrderStage);
}

/**
 * Which moves are legal from each state.
 *
 * Written down rather than scattered through route handlers, because "can
 * this order still be cancelled?" is asked by the buyer app, the admin queue,
 * and the refund path, and three different answers would be a bug that costs
 * money.
 */
const TRANSITIONS: Record<OrderStage, OrderStage[]> = {
  paid: ["held", "labeled", "cancelled", "refunded"],
  // A held order goes back to paid when released, or straight out.
  held: ["paid", "labeled", "cancelled", "refunded"],
  // A label has been bought. Cancelling now means voiding that label, which
  // the owner does at UPS; the order can still be refunded.
  labeled: ["shipped", "cancelled", "refunded"],
  // Once it is on the truck it cannot be cancelled — only refunded, or
  // marked delivered.
  shipped: ["delivered", "refunded"],
  delivered: ["refunded"],
  cancelled: [],
  refunded: [],
};

export function canTransition(from: string, to: OrderStage) {
  return (TRANSITIONS[from as OrderStage] || []).includes(to);
}

/**
 * Whether the bread has physically left the bakery. Before this point an
 * order can be corrected or cancelled cleanly; after it, the only remedies
 * are a refund and a conversation.
 */
export function hasLeftTheBakery(status: string) {
  return status === "shipped" || status === "delivered";
}

/**
 * Whether a buyer may still ask to cancel. They can ask right up until the
 * label is bought — after that the box exists and it becomes a phone call.
 */
export function canRequestCancellation(status: string, cancelRequestedAt?: string | null) {
  if (cancelRequestedAt) return false;
  return status === "paid" || status === "held";
}

/**
 * Whether the owner may still correct the delivery address or the requested
 * date. Once a label is bought the address is printed on it.
 */
export function canCorrectOrder(status: string) {
  return status === "paid" || status === "held";
}

export type RefundKind = "full" | "partial";

export type RefundAssessment =
  | { ok: true; amountCents: number; kind: RefundKind; leavesFullyRefunded: boolean }
  | { ok: false; error: string };

/**
 * Checks a refund before any money moves.
 *
 * The rule that matters: an order can never be refunded for more than it was
 * paid, counting anything already sent back. Getting this wrong means paying
 * a customer twice, so it is decided here, in one place, with a test.
 */
export function assessRefund(order: {
  status: string;
  totalCents: number;
  refundedCents: number;
  paymentTerms: string;
}, requestedCents: number): RefundAssessment {
  const total = Math.max(0, Math.round(order.totalCents));
  const already = Math.max(0, Math.round(order.refundedCents || 0));
  const remaining = Math.max(0, total - already);

  if (remaining === 0) {
    return { ok: false, error: "This order has already been refunded in full." };
  }
  // An account order was never charged. Cancelling it releases the credit;
  // there is nothing at Stripe to send back.
  if (order.paymentTerms === "account") {
    return {
      ok: false,
      error: "This order was invoiced, not charged. Cancel it to release the credit instead.",
    };
  }

  // Checked before rounding: a fractional amount means the caller computed
  // something wrong, and rounding it away would hide that.
  if (!Number.isInteger(requestedCents) || requestedCents <= 0) {
    return { ok: false, error: "Enter how much to refund." };
  }
  const amount = requestedCents;
  if (amount > remaining) {
    return {
      ok: false,
      error: `That is more than is left on this order. At most $${(remaining / 100).toFixed(2)} can be refunded.`,
    };
  }

  const leavesFullyRefunded = already + amount >= total;
  return {
    ok: true,
    amountCents: amount,
    kind: leavesFullyRefunded && already === 0 ? "full" : "partial",
    leavesFullyRefunded,
  };
}

/** The reasons an order gets cancelled or refunded, as the owner picks them. */
export const RESOLUTION_REASONS = [
  "Damaged in transit",
  "Short shipment",
  "Wrong item sent",
  "Late delivery",
  "Quality problem",
  "Customer changed their mind",
  "Duplicate order",
  "Bakery could not fulfil",
  "Other",
] as const;

export function isKnownReason(reason: string) {
  return (RESOLUTION_REASONS as readonly string[]).includes(String(reason || "").trim());
}
