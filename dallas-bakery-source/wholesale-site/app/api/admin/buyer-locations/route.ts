/**
 * Owner-managed delivery addresses for an approved business.
 *
 * Adding an address here IS the screening step for it, so this lives behind
 * the same admin guard as approvals. Addresses are deactivated, never
 * deleted: past orders keep pointing at a real record of where they went.
 */

import { getAdminAccount, getAuthorizedAdmin } from "../../../admin-auth";
import {
  addBuyerLocation,
  listLocationsForApplication,
  setBuyerLocationActive,
} from "../../../buyer-locations.ts";
import { isDeliverableState } from "../../../order-rules.ts";

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
  const applicationId = new URL(request.url).searchParams.get("applicationId") || "";
  if (!applicationId) return Response.json({ error: "applicationId is required." }, { status: 400 });
  const locations = await listLocationsForApplication(applicationId);
  return Response.json({ locations }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  if (!sameOrigin(request)) return Response.json({ error: "Invalid request." }, { status: 403 });

  let body: {
    action?: string;
    id?: string;
    active?: boolean;
    applicationId?: string;
    name?: string;
    street?: string;
    street2?: string;
    city?: string;
    state?: string;
    zip?: string;
  };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  if (body.action === "set-active") {
    if (!body.id) return Response.json({ error: "Location id is required." }, { status: 400 });
    await setBuyerLocationActive(String(body.id), body.active !== false);
    return Response.json({ ok: true });
  }

  const applicationId = String(body.applicationId || "").trim();
  const address = {
    street: String(body.street || "").trim(),
    street2: String(body.street2 || "").trim(),
    city: String(body.city || "").trim(),
    state: String(body.state || "").trim().toUpperCase(),
    zip: String(body.zip || "").trim(),
  };
  if (!applicationId) return Response.json({ error: "applicationId is required." }, { status: 400 });
  if (!address.street || !address.city) {
    return Response.json({ error: "Street and city are required." }, { status: 400 });
  }
  if (!/^[A-Z]{2}$/.test(address.state) || !/^\d{5}(-\d{4})?$/.test(address.zip)) {
    return Response.json({ error: "Use a two-letter state and a 5-digit ZIP." }, { status: 400 });
  }
  // The same shipping footprint as applications: contiguous US only.
  if (!isDeliverableState(address.state)) {
    return Response.json(
      { error: "Dallas Bakery ships wholesale within the contiguous United States only." },
      { status: 400 },
    );
  }

  const id = await addBuyerLocation({
    applicationId,
    name: String(body.name || "").trim().slice(0, 120),
    ...address,
  });
  return Response.json({ id });
}
