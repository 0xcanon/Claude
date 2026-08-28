import { eq, sql } from "drizzle-orm";
import { getAdminSession, hashAdminPassword } from "../../../admin-auth";
import { getDb } from "../../../../db";
import { adminAccounts } from "../../../../db/schema";

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && !["same-origin", "same-site", "none"].includes(fetchSite)) return false;
  return !origin || origin === new URL(request.url).origin;
}

export async function POST(request: Request) {
  const session = await getAdminSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!sameOrigin(request)) {
    return Response.json({ error: "Invalid request" }, { status: 403 });
  }

  let payload: { password?: string };
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }

  const password = String(payload.password || "");
  if (
    password.length < 14 ||
    password.length > 128 ||
    !/[A-Za-z]/.test(password) ||
    !/\d/.test(password)
  ) {
    return Response.json(
      { error: "Use at least 14 characters with a letter and a number." },
      { status: 400 },
    );
  }

  const passwordHash = await hashAdminPassword(password);
  const [account] = await getDb()
    .update(adminAccounts)
    .set({
      passwordHash,
      mustChangePassword: false,
      updatedAt: sql`CURRENT_TIMESTAMP`,
    })
    .where(eq(adminAccounts.email, session.email))
    .returning();
  if (!account) return Response.json({ error: "Account not found" }, { status: 404 });

  return Response.json({ ok: true });
}
