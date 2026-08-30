/**
 * The rules of closing an account, without the database.
 *
 * account-closure.ts does the work and imports the schema; these two pieces
 * are the parts worth pinning with a test — the placeholder address has to
 * stay unique and unroutable, and the reason has to be bounded before it is
 * stored.
 */

/** Longest reason a buyer may leave on the way out. */
export const MAX_CLOSE_REASON_LENGTH = 500;

/**
 * The address a closed account keeps.
 *
 * It has to stay unique, because the column is looked up by email and two
 * closed accounts must not collide. It must never route anywhere, which is
 * what RFC 2606 reserves `.invalid` for.
 */
export function closedEmailFor(applicationId: string) {
  return `closed-${applicationId}@removed.invalid`;
}
