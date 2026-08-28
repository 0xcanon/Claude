/**
 * Credit terms — the pure arithmetic behind ordering on account.
 *
 * The owner grants an approved business a credit limit in /admin. A buyer
 * with credit can place orders without a card: each unpaid account order
 * counts against the limit, and marking its invoice paid releases the
 * amount. No database import, so the rules stay unit-testable and the same
 * check runs on every surface that offers "order on account".
 */

export type CreditState = {
  /** The owner-granted limit. Zero means the account is card-only. */
  limitCents: number;
  /** Unpaid account orders, refunds excluded. */
  outstandingCents: number;
  /** What the buyer can still order on account right now. */
  availableCents: number;
  /** Whether ordering on account is offered at all. */
  enabled: boolean;
};

export function computeCreditState(limitCents: number, outstandingCents: number): CreditState {
  const limit = Number.isFinite(limitCents) ? Math.max(0, Math.trunc(limitCents)) : 0;
  const outstanding = Number.isFinite(outstandingCents) ? Math.max(0, Math.trunc(outstandingCents)) : 0;
  return {
    limitCents: limit,
    outstandingCents: outstanding,
    // A balance can exceed the limit after the owner lowers it; available
    // credit floors at zero rather than going negative.
    availableCents: Math.max(0, limit - outstanding),
    enabled: limit > 0,
  };
}

/**
 * Decides whether one more order fits the credit line. Messages are written
 * for the buyer — they show verbatim at checkout.
 */
export function assessAccountOrder(
  state: CreditState,
  orderTotalCents: number,
): { ok: true } | { ok: false; error: string } {
  if (!state.enabled) {
    return { ok: false, error: "Your account is not set up for ordering on credit. Pay by card, or call us to ask about terms." };
  }
  if (!Number.isInteger(orderTotalCents) || orderTotalCents <= 0) {
    return { ok: false, error: "That order can't be placed on account." };
  }
  if (orderTotalCents > state.availableCents) {
    const available = (state.availableCents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
    return {
      ok: false,
      error: `This order is over your available credit (${available} left). Pay by card, or settle an open invoice first.`,
    };
  }
  return { ok: true };
}

/**
 * Validates a credit limit the way the admin API stores it. Returns an error
 * message, or null when the value is sound. $250,000 is far past any real
 * bread order and exists only to catch typos like an extra zero on a cents
 * value.
 */
export function validateCreditLimitCents(value: number): string | null {
  if (!Number.isInteger(value) || value < 0) {
    return "Credit limit must be zero or a positive dollar amount.";
  }
  if (value > 25_000_000) {
    return "Credit limit can't exceed $250,000. Check the amount.";
  }
  return null;
}
