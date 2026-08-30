/**
 * The owner's problem queue.
 *
 * Cases arrive here from the buyer app and the website. They are sorted by
 * how much they are costing the buyer right now, not by when they were
 * filed: a shop with a short delivery this morning outranks a billing
 * question from Tuesday.
 *
 * Answering a case emails the buyer. That is the whole point — the queue is
 * the record, the email is what the buyer actually experiences.
 */

import { getAdminAccount, getAuthorizedAdmin } from "../../../admin-auth";
import { sendMail, supportCaseReplyEmail } from "../../../email-notifications.ts";
import { allCases, getCase, respondToCase } from "../../../support-cases.ts";
import {
  supportPriority,
  supportReason,
  waitingFor,
  type SupportCaseStatus,
} from "../../../support-cases-rules.ts";

export const dynamic = "force-dynamic";

const URGENCY_ORDER = { now: 0, today: 1, soon: 2 } as const;

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

function hoursSince(iso: string) {
  const at = Date.parse(String(iso || ""));
  if (!Number.isFinite(at)) return 0;
  return Math.max(0, (Date.now() - at) / 3_600_000);
}

export async function GET() {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  const rows = await allCases();
  const cases = rows.map((row) => {
    const waiting = hoursSince(row.createdAt);
    const urgency = row.status === "resolved" ? "soon" : supportPriority(row.reason, waiting);
    return {
      id: row.id,
      businessName: row.businessName,
      contactEmail: row.contactEmail,
      orderId: row.orderId,
      orderNumber: row.orderNumber,
      reason: row.reason,
      reasonLabel: supportReason(row.reason)?.label || row.reason,
      likelyRefund: Boolean(supportReason(row.reason)?.likelyRefund),
      message: row.message,
      status: row.status,
      reply: row.reply,
      ownerNotes: row.ownerNotes,
      urgency,
      waitingFor: row.status === "resolved" ? "" : waitingFor(waiting),
      openedAt: row.createdAt,
      resolvedAt: row.resolvedAt,
    };
  });

  // Unresolved first, then by urgency, then oldest — the order someone
  // working the queue would put them in themselves.
  cases.sort((a, b) => {
    const openness = Number(a.status === "resolved") - Number(b.status === "resolved");
    if (openness) return openness;
    const urgency = URGENCY_ORDER[a.urgency] - URGENCY_ORDER[b.urgency];
    if (urgency) return urgency;
    return String(a.openedAt).localeCompare(String(b.openedAt));
  });

  return Response.json(
    { cases, openCount: cases.filter((row) => row.status !== "resolved").length },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  if (!sameOrigin(request)) return Response.json({ error: "Invalid request." }, { status: 403 });

  let body: { id?: string; reply?: string; ownerNotes?: string; status?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  const id = String(body.id || "").trim();
  if (!id) return Response.json({ error: "Which case?" }, { status: 400 });

  const before = await getCase(id);
  if (!before) return Response.json({ error: "That case no longer exists." }, { status: 404 });

  const status = ["open", "answered", "resolved"].includes(String(body.status))
    ? (body.status as SupportCaseStatus)
    : undefined;

  const result = await respondToCase({
    id,
    reply: body.reply === undefined ? undefined : String(body.reply),
    ownerNotes: body.ownerNotes === undefined ? undefined : String(body.ownerNotes),
    status,
  });
  if (!result.ok) return Response.json({ error: result.error }, { status: 400 });

  // Mail only when the buyer has something new to read. Editing private
  // notes, or re-saving the same reply, should not ping them again.
  const replyChanged = Boolean(result.supportCase.reply) && result.supportCase.reply !== before.reply;
  const justResolved = result.supportCase.status === "resolved" && before.status !== "resolved";
  if (replyChanged || justResolved) {
    void sendMail(supportCaseReplyEmail({
      email: result.supportCase.contactEmail,
      reasonLabel: supportReason(result.supportCase.reason)?.label || result.supportCase.reason,
      reply: result.supportCase.reply,
      orderNumber: result.supportCase.orderNumber,
      resolved: result.supportCase.status === "resolved",
    }));
  }

  return Response.json(
    { ok: true, case: { id: result.supportCase.id, status: result.supportCase.status } },
    { headers: { "Cache-Control": "no-store" } },
  );
}
