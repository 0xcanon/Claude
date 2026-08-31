/**
 * The shipping queue on a phone: what is in the day's orders, and the two
 * batch actions that move them along — buy labels, and mark them shipped.
 *
 * Single-order operations (hold, correct, cancel, refund) live in
 * order-actions, because each of those needs a reason and writes a line into
 * the order's permanent history.
 */

import { mobileJson, requireMobileAdmin } from "../../../../mobile-admin-auth.ts";
import { sendMail, trackingEmail } from "../../../../email-notifications.ts";
import {
  createLabelsForOrders,
  listOrders,
  listTodaysUnlabeled,
  markInvoicePaid,
  markShipped,
  markTrackingEmailed,
} from "../../../../orders-service.ts";
import { orderShippedPush } from "../../../../push-messages.ts";
import { pushToBuyer } from "../../../../push-notifications.ts";
import { trackingUrl } from "../../../../order-status.ts";

export const dynamic = "force-dynamic";

type StoredItem = { sku?: string; name?: string; quantity?: number; unitAmountCents?: number };

export async function GET(request: Request) {
  const auth = await requireMobileAdmin(request);
  if (!auth.ok) return auth.response;

  const scope = new URL(request.url).searchParams.get("scope");
  const rows = await listOrders({
    status: scope === "today" ? "today" : scope === "all" ? "all" : "unshipped",
  });

  return mobileJson({
    orders: rows.map((order) => {
      const items = JSON.parse(order.itemsJson || "[]") as StoredItem[];
      return {
        id: order.id,
        orderNumber: order.orderNumber,
        customerName: order.customerName,
        email: order.email,
        phone: order.phone,
        city: order.city,
        state: order.state,
        zip: order.zip,
        street: order.street,
        street2: order.street2,
        items,
        caseCount: items.reduce((total, item) => total + Number(item.quantity || 0), 0),
        loafCount: order.loafCount,
        boxCount: order.boxCount,
        subtotalCents: order.subtotalCents,
        shippingCents: order.shippingCents,
        totalCents: order.totalCents,
        refundedCents: order.refundedCents,
        status: order.status,
        holdReason: order.holdReason,
        cancelRequestedAt: order.cancelRequestedAt,
        cancelReason: order.cancelReason,
        paymentTerms: order.paymentTerms === "account" ? "account" : "card",
        invoicePaidAt: order.invoicePaidAt,
        invoiceDueAt: order.invoiceDueAt,
        poNumber: order.poNumber,
        requestedDeliveryDate: order.requestedDeliveryDate,
        trackingNumber: order.trackingNumber,
        trackingUrl: trackingUrl(order.trackingNumber),
        hasLabel: Boolean(order.labelData),
        labelError: order.labelError,
        createdAt: order.createdAt,
        shippedAt: order.shippedAt,
      };
    }),
  });
}

export async function POST(request: Request) {
  const auth = await requireMobileAdmin(request);
  if (!auth.ok) return auth.response;

  let body: { action?: string; ids?: unknown };
  try {
    body = await request.json();
  } catch {
    return mobileJson({ error: "Invalid request." }, 400);
  }

  const ids = Array.isArray(body.ids)
    ? body.ids.filter((value): value is string => typeof value === "string").slice(0, 200)
    : [];
  const actor = { kind: "owner" as const, email: auth.admin.email };

  if (body.action === "label-all") {
    const pending = await listTodaysUnlabeled();
    if (!pending.length) {
      return mobileJson({ results: [], message: "Every order placed today already has a label." });
    }
    return mobileJson({ results: await createLabelsForOrders(pending.map((o) => o.id), actor) });
  }

  if (body.action === "create-labels") {
    if (!ids.length) return mobileJson({ error: "Pick at least one order." }, 400);
    return mobileJson({ results: await createLabelsForOrders(ids, actor) });
  }

  if (body.action === "mark-shipped") {
    if (!ids.length) return mobileJson({ error: "Pick at least one order." }, 400);
    const shipped = await markShipped(ids, actor);
    for (const order of shipped) {
      if (order.applicationId) {
        await pushToBuyer(
          order.applicationId,
          orderShippedPush({ orderNumber: order.orderNumber, trackingNumber: order.trackingNumber }),
        );
      }
      if (!order.email || !order.trackingNumber || order.trackingEmailSentAt) continue;
      if (await sendMail(trackingEmail(order))) await markTrackingEmailed(order.id);
    }
    return mobileJson({ shipped: shipped.length });
  }

  if (body.action === "mark-invoice-paid") {
    const [id] = ids;
    if (!id || ids.length !== 1) return mobileJson({ error: "Mark one invoice at a time." }, 400);
    const order = await markInvoicePaid(id, actor);
    if (!order) return mobileJson({ error: "Order not found." }, 404);
    if (order.paymentTerms !== "account") {
      return mobileJson({ error: `#${order.orderNumber} was paid by card — there is no invoice.` }, 400);
    }
    return mobileJson({ invoicePaid: true, orderNumber: order.orderNumber });
  }

  return mobileJson({ error: "Unknown action." }, 400);
}
