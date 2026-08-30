/**
 * The owner's marketing list: who is on it, and sending to them.
 *
 * A send goes to everyone opted in, at once, and cannot be recalled — so the
 * only way to reach it is an explicit "send" action, and a "test" action
 * sends the identical message to the owner first.
 */

import { getAdminAccount, getAuthorizedAdmin } from "../../../admin-auth";
import { ownerNotificationAddress } from "../../../email-notifications.ts";
import { validateCampaign } from "../../../marketing-copy.ts";
import {
  listSubscribers,
  sendCampaign,
  sendCampaignTest,
  subscribe,
  unsubscribeByEmail,
} from "../../../marketing-list.ts";
import { pushDeviceCounts } from "../../../push-notifications.ts";

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

async function listPayload() {
  const [subscribers, devices] = await Promise.all([listSubscribers(), pushDeviceCounts()]);
  return {
    subscribers: subscribers.map((row) => ({
      email: row.email,
      businessName: row.businessName,
      source: row.source,
      subscribedAt: row.subscribedAt,
      unsubscribedAt: row.unsubscribedAt,
      active: !row.unsubscribedAt,
    })),
    activeCount: subscribers.filter((row) => !row.unsubscribedAt).length,
    pushDevices: devices,
  };
}

export async function GET() {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  return Response.json(await listPayload(), { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  if (!sameOrigin(request)) return Response.json({ error: "Invalid request." }, { status: 403 });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  const action = String(body.action || "");
  const origin = new URL(request.url).origin;

  if (action === "add") {
    const added = await subscribe(String(body.email || ""), String(body.businessName || ""), "admin");
    if (!added) return Response.json({ error: "That doesn't look like an email address." }, { status: 400 });
    return Response.json(await listPayload());
  }

  if (action === "remove") {
    await unsubscribeByEmail(String(body.email || ""));
    return Response.json(await listPayload());
  }

  const draft = {
    subject: String(body.subject || ""),
    body: String(body.body || ""),
  };

  if (action === "test") {
    const to = ownerNotificationAddress();
    if (!to) {
      return Response.json(
        { error: "No owner address is configured to send the test to." },
        { status: 400 },
      );
    }
    const result = await sendCampaignTest(draft, to, origin);
    if (!result.ok) return Response.json({ error: result.error }, { status: 400 });
    return Response.json({ ...(await listPayload()), sentTestTo: to });
  }

  if (action === "send") {
    const problem = validateCampaign(draft);
    if (problem) return Response.json({ error: problem }, { status: 400 });
    const result = await sendCampaign(draft, origin);
    if (!result.ok) return Response.json({ error: result.error }, { status: 400 });
    return Response.json({
      ...(await listPayload()),
      campaign: { sent: result.sent, failed: result.failed, recipients: result.recipients },
    });
  }

  return Response.json({ error: "Unknown action." }, { status: 400 });
}
