/**
 * Everything that can be done to one order from the phone, and the record of
 * what already was.
 *
 * The same operations the web portal uses, so an order held from the bench and
 * an order held from the office are indistinguishable afterwards: same state
 * machine, same refusals, same line in the history with the owner's email on
 * it.
 */

import { mobileJson, requireMobileAdmin } from "../../../../mobile-admin-auth.ts";
import { eventsForOrder, readableActor } from "../../../../order-events.ts";
import {
  cancelOrder,
  correctOrder,
  holdOrder,
  markDelivered,
  refundOrder,
  releaseOrder,
} from "../../../../order-operations.ts";
import { RESOLUTION_REASONS } from "../../../../order-status.ts";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireMobileAdmin(request);
  if (!auth.ok) return auth.response;

  const id = new URL(request.url).searchParams.get("id") || "";
  if (!id) return mobileJson({ error: "Which order?" }, 400);

  const events = await eventsForOrder(id);
  return mobileJson({
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
  });
}

export async function POST(request: Request) {
  const auth = await requireMobileAdmin(request);
  if (!auth.ok) return auth.response;

  let body: {
    action?: string;
    id?: string;
    reason?: string;
    amountCents?: unknown;
    correction?: Record<string, unknown>;
  };
  try {
    body = await request.json();
  } catch {
    return mobileJson({ error: "Invalid request." }, 400);
  }

  const id = String(body.id || "").trim();
  if (!id) return mobileJson({ error: "Which order?" }, 400);

  const actor = { kind: "owner" as const, email: auth.admin.email };
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
      if (!Object.keys(correction).length) return mobileJson({ error: "Nothing to change." }, 400);
      return respond(await correctOrder(id, correction, actor));
    }
    case "cancel":
      return respond(await cancelOrder(id, reason, actor));
    case "refund": {
      const amount = Number(body.amountCents);
      if (!Number.isFinite(amount)) return mobileJson({ error: "Enter how much to refund." }, 400);
      return respond(await refundOrder(id, amount, reason, actor));
    }
    case "mark-delivered":
      return respond(await markDelivered(id, actor));
    default:
      return mobileJson({ error: "Unknown action." }, 400);
  }
}

/** The operations already speak in sentences, so a refusal passes through. */
function respond(
  result:
    | ({ ok: true; order: { id: string; orderNumber: number; status: string; refundedCents: number } } & Record<string, unknown>)
    | { ok: false; error: string },
) {
  if (!result.ok) return mobileJson({ error: result.error }, 400);
  return mobileJson({
    ok: true,
    order: {
      id: result.order.id,
      orderNumber: result.order.orderNumber,
      status: result.order.status,
      refundedCents: result.order.refundedCents,
    },
  });
}
