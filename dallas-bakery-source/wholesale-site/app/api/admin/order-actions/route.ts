/**
 * Everything the owner can do to an order after it is placed.
 *
 * Kept apart from /api/admin/orders, which is the shipping queue: that route
 * is about printing labels for a batch, this one is about a single order that
 * has gone wrong. Each action names one order and gives a reason, because
 * every one of them writes a line into that order's permanent history.
 *
 * GET returns that history so the owner can read what happened before
 * deciding what to do next.
 */

import { getAdminAccount, getAuthorizedAdmin } from "../../../admin-auth";
import { eventsForOrder, readableActor } from "../../../order-events.ts";
import {
  cancelOrder,
  correctOrder,
  holdOrder,
  markDelivered,
  refundOrder,
  releaseOrder,
} from "../../../order-operations.ts";
import { RESOLUTION_REASONS } from "../../../order-status.ts";

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

/** GET /api/admin/order-actions?id=… — one order's history, oldest first. */
export async function GET(request: Request) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  const id = new URL(request.url).searchParams.get("id") || "";
  if (!id) return Response.json({ error: "Which order?" }, { status: 400 });

  const events = await eventsForOrder(id);
  return Response.json(
    {
      reasons: RESOLUTION_REASONS,
      events: events.map((event) => ({
        id: event.id,
        kind: event.kind,
        summary: event.summary,
        detail: event.detail,
        who: readableActor(event.actor),
        amountCents: event.amountCents,
        buyerVisible: Boolean(event.buyerVisible),
        at: event.createdAt,
      })),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

type ActionBody = {
  action?: string;
  id?: string;
  reason?: string;
  amountCents?: unknown;
  correction?: Record<string, unknown>;
};

export async function POST(request: Request) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  if (!sameOrigin(request)) return Response.json({ error: "Invalid request." }, { status: 403 });

  let body: ActionBody;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  const id = String(body.id || "").trim();
  if (!id) return Response.json({ error: "Which order?" }, { status: 400 });

  // Every action here is signed with the admin who pressed it. Six months
  // from now "who refunded this" has an answer.
  const actor = { kind: "owner" as const, email: guard.admin!.email };
  const reason = String(body.reason || "").trim();

  switch (body.action) {
    case "hold":
      return respond(await holdOrder(id, reason, actor));

    case "release":
      return respond(await releaseOrder(id, actor));

    case "correct": {
      const source = body.correction && typeof body.correction === "object" ? body.correction : {};
      const allowed = [
        "customerName", "street", "street2", "city", "state", "zip",
        "phone", "poNumber", "requestedDeliveryDate",
      ] as const;
      const correction: Record<string, string> = {};
      for (const key of allowed) {
        if (source[key] !== undefined) correction[key] = String(source[key]).slice(0, 200);
      }
      if (!Object.keys(correction).length) {
        return Response.json({ error: "Nothing to change." }, { status: 400 });
      }
      return respond(await correctOrder(id, correction, actor));
    }

    case "cancel":
      return respond(await cancelOrder(id, reason, actor));

    case "refund": {
      const amount = Number(body.amountCents);
      if (!Number.isFinite(amount)) {
        return Response.json({ error: "Enter how much to refund." }, { status: 400 });
      }
      return respond(await refundOrder(id, amount, reason, actor));
    }

    case "mark-delivered":
      return respond(await markDelivered(id, actor));

    default:
      return Response.json({ error: "Unknown action." }, { status: 400 });
  }
}

/**
 * The operations already speak in sentences the owner can read, so a refusal
 * is passed through as-is rather than translated into a status code and lost.
 */
function respond(
  result:
    | ({ ok: true; order: { id: string; orderNumber: number; status: string; refundedCents: number } } & Record<string, unknown>)
    | { ok: false; error: string },
) {
  if (!result.ok) return Response.json({ error: result.error }, { status: 400 });
  return Response.json(
    {
      ok: true,
      order: {
        id: result.order.id,
        orderNumber: result.order.orderNumber,
        status: result.order.status,
        refundedCents: result.order.refundedCents,
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
