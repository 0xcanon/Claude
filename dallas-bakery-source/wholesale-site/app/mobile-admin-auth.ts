/**
 * The guard every owner-app endpoint sits behind.
 *
 * Two checks, both of which have to pass. The session token is signed and
 * carries the admin's email, and `verifyAdminSessionToken` refuses it unless
 * that email matches the one configured for this deployment — so a token
 * minted for anyone else is not a weaker session, it is not a session at all.
 * Then the account itself is loaded, which is what makes a forced password
 * change actually block work rather than merely suggest it.
 *
 * It lives outside the route folders so all of them share one copy: a guard
 * that is written five times is a guard that is eventually written wrong once.
 */

import { getAdminAccount, getAuthorizedMobileAdmin } from "./admin-auth";

export function mobileJson(body: Record<string, unknown>, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export type MobileAdmin = { displayName: string; email: string };

export type MobileAuthResult =
  | { ok: true; admin: MobileAdmin }
  | { ok: false; response: Response };

export async function requireMobileAdmin(request: Request): Promise<MobileAuthResult> {
  const admin = await getAuthorizedMobileAdmin(request);
  if (!admin) return { ok: false, response: mobileJson({ error: "Unauthorized" }, 401) };

  const account = await getAdminAccount(admin.email);
  if (!account) return { ok: false, response: mobileJson({ error: "Unauthorized" }, 401) };
  if (account.mustChangePassword) {
    // The app watches for this exact status and sends the owner to the
    // change-password screen rather than showing a dead end.
    return { ok: false, response: mobileJson({ error: "Password change required" }, 403) };
  }
  return { ok: true, admin };
}
