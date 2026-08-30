/**
 * The decisions the Stripe webhook makes before it touches the database.
 *
 * Stripe delivers at least once, not exactly once, and it retries for days.
 * That means every one of these events will arrive twice at some point, some
 * of them will arrive late, and one of them will arrive after the order it
 * describes has already been refunded. What the site does in each of those
 * cases is a matter of money, so it is decided here — with no database
 * import, so every branch is covered by a test rather than by hope.
 *
 * The rule underneath all of it: a duplicate must be a no-op, never a second
 * box on the bench or a second charge on a card.
 */

/** Stripe's own tolerance: a signature older than this is a replay. */
export const SIGNATURE_TOLERANCE_SECONDS = 300;

export type WebhookPlan =
  /** A wholesale PaymentIntent this site created. Record it. */
  | { kind: "record-intent"; dedupeKey: string }
  /** A retail Checkout Session. Record it. */
  | { kind: "record-session"; dedupeKey: string }
  /** Nothing to do, but tell Stripe we have it so the retries stop. */
  | { kind: "acknowledge"; why: string };

type IntentLike = { id?: string; metadata?: Record<string, string> };
type SessionLike = { id?: string; metadata?: Record<string, string> };

/**
 * What to do with an event.
 *
 * The one case worth staring at: a retail Checkout Session ALSO emits
 * `payment_intent.succeeded`. Recording both would put the same box on the
 * bench twice, so an intent is only recorded when this site's own metadata
 * says it created it for a wholesale order.
 */
export function planForEvent(event: {
  type?: string;
  data?: { object?: IntentLike & SessionLike };
}): WebhookPlan {
  const object = event.data?.object || {};
  const meta = object.metadata || {};

  if (event.type === "payment_intent.succeeded") {
    if (!object.id) return { kind: "acknowledge", why: "The event carried no payment id." };
    if (meta.source !== "wholesale-order" || meta.channel !== "wholesale") {
      return {
        kind: "acknowledge",
        why: "Not a wholesale intent — a retail checkout reports itself through its session.",
      };
    }
    // The intent id doubles as the dedupe key. The unique index on it is what
    // makes the second delivery a no-op.
    return { kind: "record-intent", dedupeKey: object.id };
  }

  if (event.type === "checkout.session.completed") {
    if (!object.id) return { kind: "acknowledge", why: "The event carried no session id." };
    return { kind: "record-session", dedupeKey: object.id };
  }

  return { kind: "acknowledge", why: `Nothing here handles ${event.type || "an unnamed event"}.` };
}

/**
 * Whether a signature header is inside Stripe's replay window.
 *
 * Split out from the HMAC check because this is the half that can be tested
 * without a key: an attacker who captures a valid webhook body and replays it
 * an hour later is stopped here, not by the signature, which still matches.
 */
export function signatureIsFresh(header: string, nowSeconds: number) {
  const stamp = String(header || "")
    .split(",")
    .map((piece) => piece.split("="))
    .find(([key]) => key?.trim() === "t")?.[1];
  const at = Number(String(stamp || "").trim());
  if (!Number.isFinite(at) || at <= 0) return false;
  return Math.abs(nowSeconds - at) <= SIGNATURE_TOLERANCE_SECONDS;
}

export type CaptureReconciliation = {
  /** The amount to write on the order. Always what Stripe actually took. */
  totalCents: number;
  /** True when the captured amount and the re-priced total disagree. */
  mismatch: boolean;
  /** Set when the owner needs to look at it. */
  alert?: string;
};

/**
 * Reconciles what Stripe captured against what the cart re-prices to now.
 *
 * The captured amount always wins on the order, because that is the money
 * that actually moved and the invoice has to match the bank. A disagreement
 * means a price changed between the buyer opening their cart and paying, so
 * it is flagged rather than quietly absorbed — under-charging by a dollar on
 * every order for a month is exactly the kind of thing nobody notices.
 */
export function reconcileCapture(capturedCents: number, repricedCents: number): CaptureReconciliation {
  const captured = Math.max(0, Math.round(capturedCents || 0));
  const repriced = Math.max(0, Math.round(repricedCents || 0));
  if (captured === repriced) return { totalCents: captured, mismatch: false };

  const difference = captured - repriced;
  const direction = difference > 0 ? "more than" : "less than";
  return {
    totalCents: captured,
    mismatch: true,
    alert:
      `An order was charged $${(captured / 100).toFixed(2)}, which is $${(Math.abs(difference) / 100).toFixed(2)} `
      + `${direction} today's price for the same cases ($${(repriced / 100).toFixed(2)}). `
      + "The charged amount is on the order and the invoice. Check whether a price changed mid-checkout.",
  };
}

/**
 * Whether a late webhook should still be acted on.
 *
 * Stripe retries for up to three days, so an event can land after the owner
 * has already cancelled or refunded the order by hand. Re-running the intake
 * then would resurrect a cancelled order, so it is acknowledged instead.
 */
export function shouldActOnExistingOrder(order: { status: string } | null) {
  if (!order) return true;
  return !["cancelled", "refunded"].includes(order.status);
}
