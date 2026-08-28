import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { and, desc, eq, isNull, ne, sql } from "drizzle-orm";
import { getAdminAccount, getAdminSession } from "../admin-auth";
import { getDb } from "../../db";
import { orders, wholesaleApplications } from "../../db/schema";
import AdminDashboard from "./admin-dashboard";
import { mailConfigured } from "../email-notifications";
import { upsConfigured } from "../ups-shipping.ts";
import { getWholesaleShippingSettings } from "../shipping-settings";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Wholesale Applications | Dallas Bakery",
  robots: { index: false, follow: false },
};

async function AdminPortal() {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");

  const account = await getAdminAccount(session.email);
  if (!account) redirect("/admin/login");
  if (account.mustChangePassword) redirect("/admin/change-password");

  const [applications, shipping, balances] = await Promise.all([
    getDb()
      .select()
      .from(wholesaleApplications)
      .orderBy(desc(wholesaleApplications.createdAt))
      .limit(250),
    getWholesaleShippingSettings(),
    // Unpaid account orders per business, so credit lines render as
    // "used / limit" without a query per application card.
    getDb()
      .select({
        applicationId: orders.applicationId,
        outstandingCents: sql<number>`COALESCE(SUM(${orders.totalCents}), 0)`,
      })
      .from(orders)
      .where(and(
        eq(orders.paymentTerms, "account"),
        isNull(orders.invoicePaidAt),
        ne(orders.status, "refunded"),
      ))
      .groupBy(orders.applicationId),
  ]);

  return (
    <AdminDashboard
      initialApplications={applications}
      initialOutstanding={Object.fromEntries(
        balances.map((row) => [row.applicationId, Number(row.outstandingCents || 0)]),
      )}
      initialShipping={shipping}
      user={{ displayName: "Dallas Bakery Owner", email: session.email }}
      readiness={{
        commercialAddressCheck: Boolean(process.env.SMARTY_AUTH_ID && process.env.SMARTY_AUTH_TOKEN),
        businessCategoryCheck: Boolean(process.env.GOOGLE_PLACES_API_KEY),
        buyerOrdering: Boolean(process.env.STRIPE_SECRET_KEY),
        cardPayments: Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PUBLISHABLE_KEY),
        emailNotifications: mailConfigured(),
        orderIntake: Boolean(process.env.STRIPE_WEBHOOK_SECRET),
        shippingLabels: upsConfigured(),
      }}
    />
  );
}

export default function AdminPage() {
  return <AdminPortal />;
}
