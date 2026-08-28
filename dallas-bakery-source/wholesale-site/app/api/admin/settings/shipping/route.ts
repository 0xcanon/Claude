import {
  getAdminAccount,
  getAuthorizedAdmin,
} from "../../../../admin-auth";
import {
  getWholesaleShippingSettings,
  updateWholesaleShippingSettings,
} from "../../../../shipping-settings";

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && !["same-origin", "same-site", "none"].includes(fetchSite)) return false;
  return !origin || origin === new URL(request.url).origin;
}

async function authorize() {
  const admin = await getAuthorizedAdmin();
  if (!admin) return { error: Response.json({ error: "Unauthorized" }, { status: 401 }) };
  const account = await getAdminAccount(admin.email);
  if (!account || account.mustChangePassword) {
    return { error: Response.json({ error: "Password change required" }, { status: 403 }) };
  }
  return { admin };
}

export async function GET() {
  const authorization = await authorize();
  if (authorization.error) return authorization.error;
  return Response.json(
    { shipping: await getWholesaleShippingSettings() },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function PATCH(request: Request) {
  const authorization = await authorize();
  if (authorization.error || !authorization.admin) return authorization.error;
  if (!sameOrigin(request)) {
    return Response.json({ error: "Invalid request origin" }, { status: 403 });
  }
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return Response.json({ error: "Content-Type must be application/json" }, { status: 415 });
  }

  let payload: { rateCents?: unknown; unitsPerBox?: unknown; boxWeightOz?: unknown };
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }

  try {
    const shipping = await updateWholesaleShippingSettings({
      rateCents: Number(payload.rateCents),
      unitsPerBox: Number(payload.unitsPerBox),
      // Optional: only sent when the owner edits it, so old clients that
      // never send it can't quietly reset the weight.
      ...(payload.boxWeightOz !== undefined ? { boxWeightOz: Number(payload.boxWeightOz) } : {}),
      updatedBy: authorization.admin.email,
    });
    return Response.json({ shipping }, { headers: { "Cache-Control": "no-store" } });
  } catch (caught) {
    return Response.json(
      { error: caught instanceof Error ? caught.message : "Shipping could not be updated." },
      { status: 400 },
    );
  }
}
