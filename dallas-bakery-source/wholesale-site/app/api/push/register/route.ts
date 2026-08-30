/**
 * Registers a phone for push notifications, and forgets it on sign-out.
 *
 * A token is only ever stored against an identity the request proves: a
 * buyer's bearer session for the buyer app, an admin session for the owner
 * app. Nothing is registered anonymously, because a token registered without
 * an owner would receive another business's order notifications.
 */

import { getAdminAccount, getAuthorizedMobileAdmin } from "../../../admin-auth";
import { BuyerAuthError, requireBuyer } from "../../../buyer-auth.ts";
import { isExpoPushToken } from "../../../push-messages.ts";
import { registerDevice, unregisterDevice } from "../../../push-notifications.ts";

export const dynamic = "force-dynamic";

type Body = { token?: string; audience?: string; platform?: string };

async function readBody(request: Request): Promise<Body | null> {
  try {
    return (await request.json()) as Body;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const body = await readBody(request);
  if (!body) return Response.json({ error: "Invalid request." }, { status: 400 });

  const token = String(body.token || "").trim();
  if (!isExpoPushToken(token)) {
    return Response.json({ error: "That is not a valid device token." }, { status: 400 });
  }
  const platform = String(body.platform || "").slice(0, 20);

  // The owner app: an admin session, and a password that is not still the
  // temporary one.
  if (body.audience === "owner") {
    const admin = await getAuthorizedMobileAdmin(request);
    if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const account = await getAdminAccount(admin.email);
    if (!account || account.mustChangePassword) {
      return Response.json({ error: "Password change required" }, { status: 403 });
    }
    await registerDevice({ token, audience: "owner", email: admin.email, platform });
    return Response.json({ registered: true }, { headers: { "Cache-Control": "no-store" } });
  }

  try {
    const buyer = await requireBuyer(request);
    await registerDevice({
      token,
      audience: "buyer",
      applicationId: buyer.applicationId,
      email: buyer.email,
      platform,
    });
    return Response.json({ registered: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (caught) {
    if (caught instanceof BuyerAuthError) {
      return Response.json({ error: caught.message }, { status: caught.status });
    }
    console.error("Push registration failed:", caught);
    return Response.json({ error: "Notifications could not be turned on." }, { status: 500 });
  }
}

/**
 * Sign-out. The token alone is enough to delete: it is a secret the device
 * holds, and letting a signed-out phone stop its own notifications matters
 * more than proving who it was.
 */
export async function DELETE(request: Request) {
  const body = await readBody(request);
  const token = String(body?.token || "").trim();
  if (!token) return Response.json({ error: "Invalid request." }, { status: 400 });
  await unregisterDevice(token);
  return Response.json({ registered: false }, { headers: { "Cache-Control": "no-store" } });
}
