import { desc } from "drizzle-orm";
import {
  getAdminAccount,
  getAuthorizedMobileAdmin,
} from "../../../../admin-auth";
import { updateWholesaleApplication } from "../../../../wholesale-application-service";
import { getDb } from "../../../../../db";
import { wholesaleApplications } from "../../../../../db/schema";

const validStatuses = new Set(["pending", "approved", "declined"]);

function json(body: Record<string, unknown>, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
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

  const applications = await getDb()
    .select()
    .from(wholesaleApplications)
    .orderBy(desc(wholesaleApplications.createdAt))
    .limit(250);

  return json({ applications });
}

export async function PATCH(request: Request) {
  const authorization = await authorize(request);
  if (authorization.error || !authorization.admin) return authorization.error;

  let payload: { id?: string; status?: string; ownerNotes?: string };
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return json({ error: "Invalid request" }, 400);
  }

  const id = String(payload.id || "").trim().slice(0, 80);
  const status = String(payload.status || "").trim();
  const ownerNotes = String(payload.ownerNotes || "").trim().slice(0, 2000);
  if (!id || !validStatuses.has(status)) {
    return json({ error: "Invalid application update" }, 400);
  }

  const application = await updateWholesaleApplication({
    id,
    status: status as "pending" | "approved" | "declined",
    ownerNotes,
    adminEmail: authorization.admin.email,
  });

  if (!application) return json({ error: "Application not found" }, 404);
  return json({ application });
}
