/**
 * "Something's wrong with my order."
 *
 * Two things live here because a buyer thinks of them as one thing — telling
 * the bakery there is a problem:
 *   POST { action: "report" } files a support case
 *   POST { action: "cancel" } asks for an order to be cancelled
 *
 * Neither one decides anything. A cancellation is a request the owner
 * answers, and a case is a message, not a refund — the money decisions all
 * happen on the admin side, where they are signed and recorded.
 *
 * GET returns this buyer's own cases and the list of reasons to pick from.
 */

import { desc, eq } from "drizzle-orm";

import { getDb } from "../../../../db";
import { orders } from "../../../../db/schema";
import { BuyerAuthError, requireBuyer } from "../../../buyer-auth.ts";
import { sendMail, supportCaseOwnerEmail } from "../../../email-notifications.ts";
import { requestCancellation } from "../../../order-operations.ts";
import { casesForBuyer, openCase } from "../../../support-cases.ts";
import {
  MAX_SUPPORT_MESSAGE_LENGTH,
  SUPPORT_REASONS,
  supportPriority,
  supportReason,
  waitingFor,
} from "../../../support-cases-rules.ts";

export const dynamic = "force-dynamic";

function hoursSince(iso: string) {
  const at = Date.parse(String(iso || ""));
  if (!Number.isFinite(at)) return 0;
  return Math.max(0, (Date.now() - at) / 3_600_000);
}

export async function GET(request: Request) {
  try {
    const buyer = await requireBuyer(request);
    const cases = await casesForBuyer(buyer.applicationId);
    return Response.json(
      {
        reasons: SUPPORT_REASONS,
        maxMessageLength: MAX_SUPPORT_MESSAGE_LENGTH,
        cases: cases.map((row) => ({
          id: row.id,
          reason: row.reason,
          reasonLabel: supportReason(row.reason)?.label || row.reason,
          message: row.message,
          status: row.status,
          // Only the reply — owner notes are the bakery's own margin.
          reply: row.reply,
          orderNumber: row.orderNumber,
          openedAt: row.createdAt,
          waitingFor: row.status === "resolved" ? "" : waitingFor(hoursSince(row.createdAt)),
        })),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (caught) {
    if (caught instanceof BuyerAuthError) {
      return Response.json({ error: caught.message }, { status: caught.status });
    }
    console.error("Buyer support list failed:", caught);
    return Response.json({ error: "That could not be loaded." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const buyer = await requireBuyer(request);

    let body: { action?: string; orderId?: string; reason?: string; message?: string };
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Invalid request." }, { status: 400 });
    }

    // An order id is only ever accepted after checking it belongs to this
    // buyer — otherwise a case could be attached to someone else's order.
    const orderId = String(body.orderId || "").trim();
    let order: typeof orders.$inferSelect | null = null;
    if (orderId) {
      const [row] = await getDb()
        .select()
        .from(orders)
        .where(eq(orders.id, orderId))
        .orderBy(desc(orders.orderNumber))
        .limit(1);
      if (!row || row.email !== buyer.email) {
        return Response.json({ error: "That order isn't on your account." }, { status: 404 });
      }
      order = row;
    }

    if (body.action === "cancel") {
      if (!order) return Response.json({ error: "Which order?" }, { status: 400 });
      const result = await requestCancellation(
        order.id,
        String(body.message || "").slice(0, 300),
        { kind: "buyer", email: buyer.email },
      );
      if (!result.ok) return Response.json({ error: result.error }, { status: 400 });
      return Response.json({
        ok: true,
        requested: true,
        message: "We've got it. We'll call or email you today to confirm.",
      });
    }

    if (body.action === "report") {
      const reason = String(body.reason || "").trim();
      const option = supportReason(reason);
      if (option?.needsOrder && !order) {
        return Response.json({ error: "Pick which order this is about." }, { status: 400 });
      }
      const result = await openCase({
        applicationId: buyer.applicationId,
        businessName: buyer.businessName,
        contactEmail: buyer.email,
        reason,
        message: String(body.message || ""),
        orderId: order?.id,
        orderNumber: order?.orderNumber,
      });
      if (!result.ok) return Response.json({ error: result.error }, { status: 400 });

      // Best-effort: the case is already filed, so a mail failure must not
      // tell the buyer their report was lost.
      void sendMail(supportCaseOwnerEmail({
        businessName: buyer.businessName,
        contactEmail: buyer.email,
        reasonLabel: option?.label || reason,
        message: result.supportCase.message,
        orderNumber: result.supportCase.orderNumber,
        urgency: supportPriority(reason, 0),
      }));

      return Response.json({
        ok: true,
        case: { id: result.supportCase.id, status: result.supportCase.status },
        message: "Sent. We read these ourselves and we'll come back to you.",
      });
    }

    return Response.json({ error: "Unknown action." }, { status: 400 });
  } catch (caught) {
    if (caught instanceof BuyerAuthError) {
      return Response.json({ error: caught.message }, { status: caught.status });
    }
    console.error("Buyer support failed:", caught);
    return Response.json({ error: "That could not be sent. Call us on (469) 729-4706." }, { status: 500 });
  }
}
