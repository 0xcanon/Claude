/**
 * Net terms — the pure arithmetic behind ordering on account.
 *
 * Net 15 / Net 30 is the account: the owner puts a chosen business on net
 * terms in /admin and sets a NET LIMIT — the maximum that business can have
 * outstanding on those terms. A buyer on terms orders without a card; each
 * unpaid invoice counts against the net limit, and marking it paid releases
 * the amount. When an invoice goes PAST DUE unpaid, on-account ordering
 * locks and the buyer pays by card until the past-due balance is settled.
 *
 * No database import, so the rules stay unit-testable and the same checks
 * run on every surface that offers "order on account".
 */

export type CreditState = {
  /** The net limit — the most this business can owe on its terms. */
  limitCents: number;
  /** Unpaid account orders, refunds excluded. */
  outstandingCents: number;
  /** What the buyer can still order on account right now. */
  availableCents: number;
  /**
   * Whether ordering on account is offered at all: the business must be on
   * Net 15 or Net 30 AND have a net limit above zero.
   */
  enabled: boolean;
  /** Net payment terms in days (15 or 30); 0 when the account has none. */
  termsDays: number;
  /** The slice of the outstanding balance that is past its due date. */
  overdueCents: number;
};

export function computeCreditState(
  limitCents: number,
  outstandingCents: number,
  termsDays = 0,
  overdueCents = 0,
): CreditState {
  const limit = Number.isFinite(limitCents) ? Math.max(0, Math.trunc(limitCents)) : 0;
  const outstanding = Number.isFinite(outstandingCents) ? Math.max(0, Math.trunc(outstandingCents)) : 0;
  const days = NET_TERMS_CHOICES.includes(termsDays as 15 | 30) ? termsDays : 0;
  return {
    limitCents: limit,
    outstandingCents: outstanding,
    // A balance can exceed the limit after the owner lowers it; available
    // credit floors at zero rather than going negative.
    availableCents: Math.max(0, limit - outstanding),
    // Net terms are the account; the limit is attached to them. Both are
    // required — terms without a limit (or a limit without terms) is
    // card-only.
    enabled: limit > 0 && days > 0,
    termsDays: days,
    overdueCents: Number.isFinite(overdueCents) ? Math.max(0, Math.trunc(overdueCents)) : 0,
  };
}

/** The net terms the owner can grant. Not every customer gets terms at all. */
export const NET_TERMS_CHOICES = [15, 30] as const;

/** Validates net terms the way the admin API stores them. */
export function validateNetTermsDays(value: number): string | null {
  if (value === 0 || NET_TERMS_CHOICES.includes(value as 15 | 30)) return null;
  return "Payment terms must be Net 15 or Net 30.";
}

/** "Net 15" / "Net 30", or empty when the account has no terms. */
export function netTermsLabel(days: number): string {
  return NET_TERMS_CHOICES.includes(days as 15 | 30) ? `Net ${days}` : "";
}

/**
 * The invoice due date for an account order placed now: the order date plus
 * the customer's net days. Stamped on the order so a later terms change
 * never moves an existing invoice.
 */
export function invoiceDueDateIso(placedAt: Date, termsDays: number): string {
  const days = NET_TERMS_CHOICES.includes(termsDays as 15 | 30) ? termsDays : 15;
  const due = new Date(placedAt.getTime() + days * 24 * 60 * 60 * 1000);
  return due.toISOString().slice(0, 10);
}

function dollars(cents: number) {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

/**
 * Decides whether one more order fits the net account. Refused when the
 * account has no terms, when the past-due balance locks it, or when the
 * order would pass the net limit — the balance can never go past the limit.
 * Messages show verbatim at checkout.
 */
export function assessAccountOrder(
  state: CreditState,
  orderTotalCents: number,
): { ok: true } | { ok: false; error: string } {
  if (!state.enabled) {
    return { ok: false, error: "Your account is not set up for net terms. Pay by card, or call us to ask about Net 15 / Net 30." };
  }
  if (state.overdueCents > 0) {
    return { ok: false, error: pastDueMessage(state) };
  }
  if (!Number.isInteger(orderTotalCents) || orderTotalCents <= 0) {
    return { ok: false, error: "That order can't be placed on account." };
  }
  if (orderTotalCents > state.availableCents) {
    return { ok: false, error: overLimitMessage(state) };
  }
  return { ok: true };
}

/**
 * A past-due balance locks the account: every new order pays by card until
 * the owner marks the overdue invoices paid.
 */
export function pastDueMessage(state: CreditState): string {
  const label = netTermsLabel(state.termsDays) || "invoice";
  return `Your ${label} balance is past due (${dollars(state.overdueCents)} overdue). ` +
    "Pay new orders by card for now — ordering on your account resumes once the past-due balance is settled.";
}

/**
 * The buyer-facing explanation when an order doesn't fit the net limit:
 * with open invoices, paying one frees credit; without any, the order is
 * simply bigger than the limit and card is the way.
 */
export function overLimitMessage(state: CreditState): string {
  if (state.outstandingCents > 0) {
    return `This order is over your available credit (${dollars(state.availableCents)} left). ` +
      `Pay your open invoice balance (${dollars(state.outstandingCents)}) to free up credit, or pay this order by card.`;
  }
  return `This order is over your ${dollars(state.limitCents)} net limit. Pay it by card, or place a smaller order on account.`;
}

/**
 * Validates a net limit the way the admin API stores it. Returns an error
 * message, or null when the value is sound. $250,000 is far past any real
 * bread order and exists only to catch typos like an extra zero on a cents
 * value.
 */
export function validateCreditLimitCents(value: number): string | null {
  if (!Number.isInteger(value) || value < 0) {
    return "The net limit must be zero or a positive dollar amount.";
  }
  if (value > 25_000_000) {
    return "The net limit can't exceed $250,000. Check the amount.";
  }
  return null;
}
