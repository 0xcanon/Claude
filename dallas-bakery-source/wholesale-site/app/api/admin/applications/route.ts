import { and, desc, eq, isNull, ne, sql } from "drizzle-orm";
import { getAdminAccount, getAuthorizedAdmin } from "../../../admin-auth";
import { validateCreditLimitCents, validateNetTermsDays } from "../../../credit-terms.ts";
import { updateWholesaleApplication } from "../../../wholesale-application-service";
import { getDb } from "../../../../db";
import { orders, wholesaleApplications } from "../../../../db/schema";

const validStatuses = new Set(["pending", "approved", "declined"]);

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && !["same-origin", "same-site", "none"].includes(fetchSite)) {
    return false;
  }
  return !origin || origin === new URL(request.url).origin;
}

export async function GET() {
  const admin = await getAuthorizedAdmin();
  if (!admin) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const account = await getAdminAccount(admin.email);
  if (!account || account.mustChangePassword) {
    return Response.json({ error: "Password change required" }, { status: 403 });
  }

  const applications = await getDb()
    .select()
    .from(wholesaleApplications)
    .orderBy(desc(wholesaleApplications.createdAt))
    .limit(250);

  // Unpaid account orders per business, so the dashboard can show each
  // credit line as "used / limit" without a query per application.
  const balances = await getDb()
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
    .groupBy(orders.applicationId);

  return Response.json({
    applications,
    outstanding: Object.fromEntries(
      balances.map((row) => [row.applicationId, Number(row.outstandingCents || 0)]),
    ),
  });
}

export async function PATCH(request: Request) {
  const admin = await getAuthorizedAdmin();
  if (!admin) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const account = await getAdminAccount(admin.email);
  if (!account || account.mustChangePassword) {
    return Response.json({ error: "Password change required" }, { status: 403 });
  }
  if (!sameOrigin(request)) {
    return Response.json({ error: "Invalid request origin" }, { status: 403 });
  }

  let payload: {
    id?: string;
    status?: string;
    ownerNotes?: string;
    creditLimitCents?: number;
    creditTermsDays?: number;
  };
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }

  const id = String(payload.id || "").trim().slice(0, 80);
  const status = String(payload.status || "").trim();
  const ownerNotes = String(payload.ownerNotes || "").trim().slice(0, 2000);
  if (!id || !validStatuses.has(status)) {
    return Response.json({ error: "Invalid application update" }, { status: 400 });
  }

  // Optional credit line and net terms. Absent means "leave as is" so a
  // plain approval never touches what the owner already granted.
  let creditLimitCents: number | undefined;
  if (payload.creditLimitCents !== undefined) {
    const cents = Number(payload.creditLimitCents);
    const problem = validateCreditLimitCents(cents);
    if (problem) return Response.json({ error: problem }, { status: 400 });
    creditLimitCents = cents;
  }
  let creditTermsDays: number | undefined;
  if (payload.creditTermsDays !== undefined) {
    const days = Number(payload.creditTermsDays);
    const problem = validateNetTermsDays(days);
    if (problem) return Response.json({ error: problem }, { status: 400 });
    creditTermsDays = days;
  }
  const application = await updateWholesaleApplication({
    id,
    status: status as "pending" | "approved" | "declined",
    ownerNotes,
    adminEmail: admin.email,
    creditLimitCents,
    creditTermsDays,
  });

  if (!application) {
    return Response.json({ error: "Application not found" }, { status: 404 });
  }

  return Response.json({ application });
}
