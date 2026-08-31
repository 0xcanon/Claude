/**
 * The problem queue on the phone. Same ordering as the portal: what is
 * costing the buyer money right now comes first, not what arrived first.
 *
 * Answering emails the buyer immediately, which is the whole point of having
 * this on a phone — a shop short of bread at 7am should not wait for someone
 * to reach a desk.
 */

import { mobileJson, requireMobileAdmin } from "../../../../mobile-admin-auth.ts";
import { sendMail, supportCaseReplyEmail } from "../../../../email-notifications.ts";
import { allCases, getCase, respondToCase } from "../../../../support-cases.ts";
import {
  supportPriority,
  supportReason,
  waitingFor,
  type SupportCaseStatus,
} from "../../../../support-cases-rules.ts";

export const dynamic = "force-dynamic";

const URGENCY_ORDER = { now: 0, today: 1, soon: 2 } as const;

function hoursSince(iso: string) {
  const at = Date.parse(String(iso || ""));
  if (!Number.isFinite(at)) return 0;
  return Math.max(0, (Date.now() - at) / 3_600_000);
}

export async function GET(request: Request) {
  const auth = await requireMobileAdmin(request);
  if (!auth.ok) return auth.response;

  const cases = (await allCases()).map((row) => {
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

  cases.sort((a, b) => {
    const openness = Number(a.status === "resolved") - Number(b.status === "resolved");
    if (openness) return openness;
    const urgency = URGENCY_ORDER[a.urgency] - URGENCY_ORDER[b.urgency];
    if (urgency) return urgency;
    return String(a.openedAt).localeCompare(String(b.openedAt));
  });

  return mobileJson({
    cases,
    openCount: cases.filter((row) => row.status !== "resolved").length,
  });
}

export async function POST(request: Request) {
  const auth = await requireMobileAdmin(request);
  if (!auth.ok) return auth.response;

  let body: { id?: string; reply?: string; ownerNotes?: string; status?: string };
  try {
    body = await request.json();
  } catch {
    return mobileJson({ error: "Invalid request." }, 400);
  }

  const id = String(body.id || "").trim();
  if (!id) return mobileJson({ error: "Which case?" }, 400);

  const before = await getCase(id);
  if (!before) return mobileJson({ error: "That case no longer exists." }, 404);

  const status = ["open", "answered", "resolved"].includes(String(body.status))
    ? (body.status as SupportCaseStatus)
    : undefined;

  const result = await respondToCase({
    id,
    reply: body.reply === undefined ? undefined : String(body.reply),
    ownerNotes: body.ownerNotes === undefined ? undefined : String(body.ownerNotes),
    status,
  });
  if (!result.ok) return mobileJson({ error: result.error }, 400);

  // Mail only when the buyer has something new to read.
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

  return mobileJson({ ok: true, case: { id: result.supportCase.id, status: result.supportCase.status } });
}
