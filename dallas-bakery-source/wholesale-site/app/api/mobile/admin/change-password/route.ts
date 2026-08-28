import { eq, sql } from "drizzle-orm";
import {
  getAdminSessionFromRequest,
  hashAdminPassword,
} from "../../../../admin-auth";
import { getDb } from "../../../../../db";
import { adminAccounts } from "../../../../../db/schema";

function json(body: Record<string, unknown>, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request: Request) {
  const session = await getAdminSessionFromRequest(request);
  if (!session) return json({ error: "Unauthorized" }, 401);

  let payload: { password?: string };
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return json({ error: "Invalid request" }, 400);
  }

  const password = String(payload.password || "");
  if (
    password.length < 14 ||
    password.length > 128 ||
    !/[A-Za-z]/.test(password) ||
    !/\d/.test(password)
  ) {
    return json({ error: "Use at least 14 characters with a letter and a number." }, 400);
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
  if (!account) return json({ error: "Account not found" }, 404);

  return json({ ok: true });
}
