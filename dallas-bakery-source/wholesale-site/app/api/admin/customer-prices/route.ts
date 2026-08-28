/**
 * Exclusive per-customer pricing for the owner.
 *
 * GET ?applicationId=…      -> that business's overrides (SKU -> cents/loaf)
 * POST { action: "set" }    -> set or replace one override
 * POST { action: "clear" }  -> remove one; the buyer returns to list price
 *
 * Overrides apply server-side wherever that buyer's cart is priced, so a
 * price set here holds at checkout, on standing orders, and at intake.
 */

import { getAdminAccount, getAuthorizedAdmin } from "../../../admin-auth";
import {
  clearCustomerPrice,
  priceOverridesFor,
  setCustomerPrice,
} from "../../../customer-pricing.ts";

export const dynamic = "force-dynamic";

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && !["same-origin", "same-site", "none"].includes(fetchSite)) return false;
  return !origin || origin === new URL(request.url).origin;
}

async function requireAdmin() {
  const admin = await getAuthorizedAdmin();
  if (!admin) return { error: Response.json({ error: "Unauthorized" }, { status: 401 }) };
  const account = await getAdminAccount(admin.email);
  if (!account || account.mustChangePassword) {
    return { error: Response.json({ error: "Password change required" }, { status: 403 }) };
  }
  return { admin };
}

export async function GET(request: Request) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  const applicationId = String(new URL(request.url).searchParams.get("applicationId") || "").trim().slice(0, 80);
  if (!applicationId) return Response.json({ error: "Missing applicationId." }, { status: 400 });
  return Response.json(
    { overrides: await priceOverridesFor(applicationId) },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  if (!sameOrigin(request)) {
    return Response.json({ error: "Invalid request origin" }, { status: 403 });
  }

  let body: { action?: string; applicationId?: string; sku?: string; loafPriceCents?: number };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }

  const applicationId = String(body.applicationId || "").trim().slice(0, 80);
  const sku = String(body.sku || "").trim().toUpperCase().slice(0, 40);
  if (!applicationId || !sku) {
    return Response.json({ error: "Missing applicationId or SKU." }, { status: 400 });
  }

  if (body.action === "set") {
    const problem = await setCustomerPrice(applicationId, sku, Math.round(Number(body.loafPriceCents)));
    if (problem) return Response.json({ error: problem }, { status: 400 });
  } else if (body.action === "clear") {
    await clearCustomerPrice(applicationId, sku);
  } else {
    return Response.json({ error: "Unknown action." }, { status: 400 });
  }

  return Response.json(
    { overrides: await priceOverridesFor(applicationId) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
