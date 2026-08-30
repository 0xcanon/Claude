/**
 * The account App Review signs in with.
 *
 * Everything past the welcome screen is behind a code emailed to an approved
 * business — which a reviewer at Apple or Google cannot read. Without a way
 * in they see a sign-in wall and reject the app under guideline 2.1, and that
 * is the single likeliest way this submission fails.
 *
 * So the owner sets two secrets, REVIEW_DEMO_EMAIL and REVIEW_DEMO_CODE, and
 * that pair signs in. The account behind them is created on demand, fully
 * provisioned, on Net 15 terms with a credit limit — so the reviewer can
 * place a real order end to end without a card being charged.
 *
 * It heals itself. A reviewer testing "delete my account" will close this
 * account, which is exactly what we want them to be able to do; the next
 * sign-in simply builds it again. Nothing to remember before the next
 * submission.
 *
 * With either secret unset the whole thing is inert: no demo email is
 * recognised, no account is created, and sign-in behaves as it always has.
 */

import { and, eq } from "drizzle-orm";

import { getDb } from "../db";
import { buyerLocations, wholesaleApplications } from "../db/schema";
import {
  MIN_REVIEW_CODE_LENGTH,
  matchesReviewLogin,
  reviewDemoEmailFrom,
} from "./review-credentials.ts";

/** Stable id, so a rebuilt demo account keeps the same row. */
const REVIEW_APPLICATION_ID = "app-store-review-demo";

/** Net terms and limit the demo account gets, so checkout needs no card. */
const REVIEW_CREDIT_LIMIT_CENTS = 500_000;
const REVIEW_TERMS_DAYS = 15;

export function reviewDemoEmail() {
  return reviewDemoEmailFrom(process.env);
}

/** True only when both secrets are set and the pair matches exactly. */
export function isReviewDemoLogin(email: string, code: string) {
  return matchesReviewLogin(process.env, email, code);
}

function reviewCodeConfigured() {
  return String(process.env.REVIEW_DEMO_CODE || "").replace(/\D/g, "").length >= MIN_REVIEW_CODE_LENGTH;
}

/**
 * Makes sure the demo account exists, is approved, and is open — creating or
 * reopening it as needed. Safe to call on every sign-in attempt for that
 * address, and a no-op when the secrets are unset.
 *
 * Returns true when a usable demo account is in place.
 */
export async function ensureReviewDemoAccount() {
  const email = reviewDemoEmail();
  if (!email || !reviewCodeConfigured()) return false;

  const db = getDb();
  const [existing] = await db
    .select({ id: wholesaleApplications.id, closedAt: wholesaleApplications.closedAt })
    .from(wholesaleApplications)
    .where(eq(wholesaleApplications.id, REVIEW_APPLICATION_ID))
    .limit(1);

  const details = {
    businessName: "App Review Demo Kitchen",
    businessType: "restaurant",
    contactName: "App Reviewer",
    email,
    phone: "(469) 729-4706",
    website: "",
    street: "2643 Manana Dr",
    street2: "",
    city: "Dallas",
    state: "TX",
    zip: "75220",
    multipleLocations: false,
    locationCount: 1,
    additionalMarkets: "",
    screeningStatus: "auto_matched",
    addressScreening: "verified",
    categoryScreening: "verified",
    standardizedAddress: "",
    matchedBusiness: "",
    termsVersion: "2026-08-25",
    termsAcceptedAt: new Date().toISOString(),
    trackingTokenHash: "",
    trackingTokenIssuedAt: 0,
    status: "approved" as const,
    ownerNotes: "Demo account for App Store / Play Store review. Rebuilt automatically.",
    stripeCustomerId: "",
    // Net terms with room to spare: the reviewer can complete a real order on
    // account, so the checkout flow is fully reviewable without a card being
    // charged and without a test card that might be declined.
    creditLimitCents: REVIEW_CREDIT_LIMIT_CENTS,
    creditTermsDays: REVIEW_TERMS_DAYS,
    closedAt: null,
    closedReason: "",
  };

  if (!existing) {
    await db.insert(wholesaleApplications).values({ id: REVIEW_APPLICATION_ID, ...details });
  } else if (existing.closedAt) {
    // The reviewer tested account deletion. Good — that is the feature
    // working. Build it back so the next reviewer can sign in too.
    await db
      .update(wholesaleApplications)
      .set(details)
      .where(eq(wholesaleApplications.id, REVIEW_APPLICATION_ID));
  }

  // A second delivery address, so the location picker has something to pick.
  const [location] = await db
    .select({ id: buyerLocations.id })
    .from(buyerLocations)
    .where(and(
      eq(buyerLocations.applicationId, REVIEW_APPLICATION_ID),
      eq(buyerLocations.active, true),
    ))
    .limit(1);
  if (!location) {
    await db.insert(buyerLocations).values({
      id: `${REVIEW_APPLICATION_ID}-second`,
      applicationId: REVIEW_APPLICATION_ID,
      name: "Demo Kitchen — Uptown",
      street: "2001 Cedar Springs Rd",
      street2: "Suite 300",
      city: "Dallas",
      state: "TX",
      zip: "75201",
      active: true,
    }).onConflictDoNothing();
  }

  return true;
}
