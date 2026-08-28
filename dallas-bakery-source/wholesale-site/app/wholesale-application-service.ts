import { eq, sql } from "drizzle-orm";

import { getDb } from "../db";
import { wholesaleApplications } from "../db/schema";
import {
  applicantDecisionEmail,
  orderingReadyEmail,
  sendMail,
} from "./email-notifications";
import { buyerPortalUrl } from "./buyer-portal.ts";

export type WholesaleApplicationStatus = "pending" | "approved" | "declined";

type UpdateInput = {
  id: string;
  status: WholesaleApplicationStatus;
  ownerNotes: string;
  adminEmail: string;
  /**
   * Owner-granted credit line in cents; omitted leaves it unchanged. Zero
   * revokes ordering on account (existing invoices stay owed).
   */
  creditLimitCents?: number;
  /** Net terms in days (15 or 30, 0 for none); omitted leaves it unchanged. */
  creditTermsDays?: number;
};

/**
 * Ordering runs on Stripe against this database, so there is no external store
 * to provision: an approved application can order the moment it is approved.
 */
export function isOrderingReady(status: string) {
  return status === "approved";
}

export async function updateWholesaleApplication(input: UpdateInput) {
  const [current] = await getDb()
    .select()
    .from(wholesaleApplications)
    .where(eq(wholesaleApplications.id, input.id))
    .limit(1);
  if (!current) return null;

  const statusChanged = current.status !== input.status;

  // Net terms are the account and the net limit attaches to them, so the
  // stored pair is always coherent: card-only is (no terms, no limit), and
  // Net 15/30 always carries a limit. Explicitly choosing card-only clears
  // the limit; a limit granted without a terms choice starts on Net 15; and
  // terms can never stand without a limit.
  let creditPair: { creditLimitCents: number; creditTermsDays: number } | undefined;
  if (input.creditLimitCents !== undefined || input.creditTermsDays !== undefined) {
    let limit = input.creditLimitCents ?? current.creditLimitCents;
    let days = input.creditTermsDays ?? current.creditTermsDays;
    if (input.creditTermsDays === 0) limit = 0;
    if (limit > 0 && days === 0) days = 15;
    if (limit === 0) days = 0;
    creditPair = { creditLimitCents: limit, creditTermsDays: days };
  }

  const [application] = await getDb()
    .update(wholesaleApplications)
    .set({
      status: input.status,
      ownerNotes: input.ownerNotes,
      ...(creditPair || {}),
      decidedBy: input.status === "pending" ? "" : input.adminEmail,
      decidedAt: input.status === "pending" ? null : new Date().toISOString(),
      updatedAt: sql`CURRENT_TIMESTAMP`,
    })
    .where(eq(wholesaleApplications.id, input.id))
    .returning();

  if (!application) return null;

  await notifyApplicant(application, { statusChanged, decision: input.status });

  return application;
}

/**
 * Emails the applicant about their own application. Owner notes are owner-only
 * and are intentionally never part of any applicant email. Failures are
 * swallowed inside sendMail so a mail outage can never block a decision.
 */
async function notifyApplicant(
  application: {
    id: string;
    businessName: string;
    businessType: string;
    contactName: string;
    email: string;
    phone: string;
    city: string;
    state: string;
    status: string;
  },
  context: {
    statusChanged: boolean;
    decision: WholesaleApplicationStatus;
  },
) {
  if (!context.statusChanged) return;
  const portalUrl = buyerPortalUrl();

  if (context.decision === "approved") {
    // Approval and ordering access are the same event now, so the applicant
    // gets the decision and then the "you can order" mail with the portal
    // link, rather than waiting on a sync that used to follow later.
    await sendMail(applicantDecisionEmail(application, "approved", {
      orderingReady: true,
      portalUrl,
    }));
    await sendMail(orderingReadyEmail(application, portalUrl));
    return;
  }
  if (context.decision === "declined") {
    await sendMail(applicantDecisionEmail(application, "declined", {
      orderingReady: false,
      portalUrl,
    }));
  }
}
