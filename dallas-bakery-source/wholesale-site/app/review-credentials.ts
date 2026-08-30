/**
 * The credential App Review signs in with — the pure half.
 *
 * Split out from review-access.ts, which touches the database, so the check
 * that decides whether a pair of secrets opens an account is unit-testable.
 * This is a credential; it deserves a test that runs.
 */

/** Shortest code that is a credential rather than a guess. */
export const MIN_REVIEW_CODE_LENGTH = 6;

export function normalizeReviewEmail(email: string) {
  return String(email || "").trim().toLowerCase();
}

/** The configured demo address, or "" when the mechanism is switched off. */
/**
 * Just the two values this needs. An index signature rather than named keys,
 * so `process.env` satisfies it directly and a test can pass a plain object.
 */
export type ReviewSecrets = Record<string, string | undefined>;

export function reviewDemoEmailFrom(env: ReviewSecrets) {
  return normalizeReviewEmail(env.REVIEW_DEMO_EMAIL || "");
}

function reviewDemoCodeFrom(env: ReviewSecrets) {
  return String(env.REVIEW_DEMO_CODE || "").replace(/\D/g, "");
}

/**
 * True only when both secrets are set, the code is long enough to be a
 * credential, and the submitted pair matches exactly.
 *
 * Compared in constant time: six digits is a small enough space that a timing
 * oracle on it would be a real one.
 */
export function matchesReviewLogin(env: ReviewSecrets, email: string, code: string) {
  const demoEmail = reviewDemoEmailFrom(env);
  const demoCode = reviewDemoCodeFrom(env);
  if (!demoEmail || demoCode.length < MIN_REVIEW_CODE_LENGTH) return false;
  if (normalizeReviewEmail(email) !== demoEmail) return false;

  const submitted = String(code || "").replace(/\D/g, "");
  if (submitted.length !== demoCode.length) return false;
  let mismatch = 0;
  for (let index = 0; index < demoCode.length; index += 1) {
    mismatch |= submitted.charCodeAt(index) ^ demoCode.charCodeAt(index);
  }
  return mismatch === 0;
}
