/**
 * One Stripe Customer per approved business, created lazily on first payment.
 *
 * The customer id is what lets a card saved at checkout be shown again next
 * time — and charged off-session for standing orders. It is stored on the
 * application row, so the same business always maps to the same customer.
 */

import { eq, sql } from "drizzle-orm";

import { getDb } from "../db";
import { wholesaleApplications } from "../db/schema";
import type { ApprovedBuyer } from "./buyer-auth.ts";
import { createCustomer } from "./stripe.ts";

export async function getOrCreateStripeCustomer(buyer: ApprovedBuyer): Promise<string> {
  const db = getDb();
  const [row] = await db
    .select({ stripeCustomerId: wholesaleApplications.stripeCustomerId })
    .from(wholesaleApplications)
    .where(eq(wholesaleApplications.id, buyer.applicationId))
    .limit(1);
  if (row?.stripeCustomerId) return row.stripeCustomerId;

  const created = await createCustomer({
    email: buyer.email,
    name: buyer.businessName,
    metadata: { applicationId: buyer.applicationId, channel: "wholesale" },
  });
  // No customer is not a failure to pay — checkout still works, the card just
  // is not remembered. The next payment tries again.
  if (!created.ok) return "";

  await db
    .update(wholesaleApplications)
    .set({ stripeCustomerId: created.data.id, updatedAt: sql`CURRENT_TIMESTAMP` })
    .where(eq(wholesaleApplications.id, buyer.applicationId));
  return created.data.id;
}
