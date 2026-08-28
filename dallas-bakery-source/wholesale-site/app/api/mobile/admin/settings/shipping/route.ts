import {
  getAdminAccount,
  getAuthorizedMobileAdmin,
} from "../../../../../admin-auth";
import {
  getWholesaleShippingSettings,
  updateWholesaleShippingSettings,
} from "../../../../../shipping-settings";

function json(body: Record<string, unknown>, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

async function authorize(request: Request) {
  const admin = await getAuthorizedMobileAdmin(request);
  if (!admin) return { error: json({ error: "Unauthorized" }, 401) };
  const account = await getAdminAccount(admin.email);
  if (!account || account.mustChangePassword) {
    return { error: json({ error: "Password change required" }, 403) };
  }
  return { admin };
}

export async function GET(request: Request) {
  const authorization = await authorize(request);
  if (authorization.error) return authorization.error;
  return json({ shipping: await getWholesaleShippingSettings() });
}

export async function PATCH(request: Request) {
  const authorization = await authorize(request);
  if (authorization.error || !authorization.admin) return authorization.error;

  let payload: { rateCents?: unknown; unitsPerBox?: unknown };
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return json({ error: "Invalid request" }, 400);
  }

  try {
    const shipping = await updateWholesaleShippingSettings({
      rateCents: Number(payload.rateCents),
      unitsPerBox: Number(payload.unitsPerBox),
      updatedBy: authorization.admin.email,
    });
    return json({ shipping });
  } catch (caught) {
    return json({ error: caught instanceof Error ? caught.message : "Shipping could not be updated." }, 400);
  }
}
