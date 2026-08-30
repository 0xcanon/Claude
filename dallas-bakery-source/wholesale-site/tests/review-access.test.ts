import assert from "node:assert/strict";
import test from "node:test";

import { closedEmailFor, MAX_CLOSE_REASON_LENGTH } from "../app/account-closure-rules.ts";

import {
  MIN_REVIEW_CODE_LENGTH,
  matchesReviewLogin,
  reviewDemoEmailFrom,
} from "../app/review-credentials.ts";

/** The two secrets, as the Worker environment would carry them. */
function env(email?: string, code?: string) {
  return { REVIEW_DEMO_EMAIL: email, REVIEW_DEMO_CODE: code };
}
const isReviewDemoLogin = (e: string, c: string) =>
  matchesReviewLogin(env("review@dallasbakery.com", "314159"), e, c);

test("a closed account keeps a unique address that cannot route anywhere", () => {
  const address = closedEmailFor("app_abc123");
  assert.match(address, /^closed-app_abc123@removed\.invalid$/);
  // RFC 2606 reserves .invalid precisely so it can never resolve.
  assert.ok(address.endsWith(".invalid"));
  // Two accounts never collide, which matters because the column is looked
  // up by email.
  assert.notEqual(closedEmailFor("a"), closedEmailFor("b"));
});

test("a leaving reason is bounded", () => {
  assert.equal(MAX_CLOSE_REASON_LENGTH, 500);
});

test("the review sign-in is inert unless both secrets are set", () => {
  assert.equal(reviewDemoEmailFrom(env()), "");
  assert.equal(matchesReviewLogin(env(), "anyone@example.com", "123456"), false);
  assert.equal(matchesReviewLogin(env(), "", ""), false);

  // Email alone is not enough.
  assert.equal(
    matchesReviewLogin(env("review@dallasbakery.com"), "review@dallasbakery.com", "123456"),
    false,
  );
  // Nor is a code too short to be a credential.
  assert.equal(
    matchesReviewLogin(env("review@dallasbakery.com", "123"), "review@dallasbakery.com", "123"),
    false,
  );
  assert.equal(MIN_REVIEW_CODE_LENGTH, 6);
});

test("the review sign-in accepts exactly one email and code pair", () => {
  assert.equal(isReviewDemoLogin("review@dallasbakery.com", "314159"), true);
  // Case and whitespace on the address are normalised, the way sign-in does.
  assert.equal(isReviewDemoLogin("  Review@DallasBakery.com  ", "314159"), true);
  // Non-digits are stripped from the code, as the sign-in route does.
  assert.equal(isReviewDemoLogin("review@dallasbakery.com", "314-159"), true);

  assert.equal(isReviewDemoLogin("review@dallasbakery.com", "314158"), false);
  assert.equal(isReviewDemoLogin("someone@else.com", "314159"), false);
  assert.equal(isReviewDemoLogin("review@dallasbakery.com", ""), false);
  assert.equal(isReviewDemoLogin("review@dallasbakery.com", "31415"), false);
  assert.equal(isReviewDemoLogin("review@dallasbakery.com", "3141590"), false);
});
