import { getAdminAccount, getAuthorizedAdmin } from "../../../admin-auth";
import { sendMail, trackingEmail } from "../../../email-notifications.ts";
import {
  createLabelsForOrders,
  getLabelPayloads,
  listOrders,
  listTodaysUnlabeled,
  markInvoicePaid,
  markRefunded,
  markShipped,
  markTrackingEmailed,
  weeklySummary,
} from "../../../orders-service.ts";
import { ordersToCsv } from "../../../orders-csv.ts";
import { createRefund } from "../../../stripe.ts";
import { trackingUrl } from "../../../order-status.ts";
import { mergeZplLabels, upsConfigured, upsIsProduction } from "../../../ups-shipping.ts";

export const dynamic = "force-dynamic";

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && !["same-origin", "same-site", "none"].includes(fetchSite)) {
    return false;
  }
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

export async function GET(request: Request) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  const url = new URL(request.url);
  const scope = url.searchParams.get("scope");
  const rows = await listOrders({
    status: scope === "today" ? "today" : scope === "all" ? "all" : "unshipped",
  });

  // ?format=csv downloads the same scope as a spreadsheet.
  if (url.searchParams.get("format") === "csv") {
    const stamp = new Date().toISOString().slice(0, 10);
    return new Response(ordersToCsv(rows), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="dallas-bakery-orders-${stamp}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  }

  return Response.json(
    {
      orders: rows.map((order) => {
        const items = JSON.parse(order.itemsJson || "[]") as {
          sku?: string; name?: string; quantity?: number; unitAmountCents?: number;
        }[];
        return {
          id: order.id,
          channel: order.channel,
          orderNumber: order.orderNumber,
          customerName: order.customerName,
          email: order.email,
          phone: order.phone,
          street: order.street,
          street2: order.street2,
          city: order.city,
          state: order.state,
          zip: order.zip,
          // What was actually ordered, so the bench can pack from this screen
          // instead of opening Stripe.
          items,
          caseCount: items.reduce((total, item) => total + Number(item.quantity || 0), 0),
          loafCount: order.loafCount,
          boxCount: order.boxCount,
          subtotalCents: order.subtotalCents,
          shippingCents: order.shippingCents,
          totalCents: order.totalCents,
          status: order.status,
          // "account" orders were placed on credit: no card was charged, and
          // the money is owed until the invoice is marked paid here.
          paymentTerms: order.paymentTerms === "account" ? "account" : "card",
          invoicePaidAt: order.invoicePaidAt,
          invoiceDueAt: order.invoiceDueAt,
          trackingNumber: order.trackingNumber,
          trackingUrl: trackingUrl(order.trackingNumber),
          labelError: order.labelError,
          hasLabel: Boolean(order.labelData),
          createdAt: order.createdAt,
          shippedAt: order.shippedAt,
          trackingEmailSentAt: order.trackingEmailSentAt,
        };
      }),
      ups: { connected: upsConfigured(), environment: upsIsProduction() ? "production" : "test" },
      weekly: await weeklySummary(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

/**
 * Actions on the shipping queue:
 *   create-labels  — buy UPS labels for the selected orders
 *   label-all      — same, for every unlabeled order placed today
 *   download       — merged .zpl for the selected orders (thermal batch print)
 *   mark-shipped   — close the orders out and email tracking to the customer
 */
export async function POST(request: Request) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  if (!sameOrigin(request)) return Response.json({ error: "Invalid request." }, { status: 403 });

  let body: { action?: string; ids?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  const ids = Array.isArray(body.ids)
    ? body.ids.filter((value): value is string => typeof value === "string").slice(0, 200)
    : [];

  if (body.action === "label-all") {
    const pending = await listTodaysUnlabeled();
    if (!pending.length) {
      return Response.json({ results: [], message: "Every order placed today already has a label." });
    }
    const results = await createLabelsForOrders(pending.map((order) => order.id));
    return Response.json({ results });
  }

  if (body.action === "create-labels") {
    if (!ids.length) return Response.json({ error: "Select at least one order." }, { status: 400 });
    const results = await createLabelsForOrders(ids);
    return Response.json({ results });
  }

  if (body.action === "download") {
    const payloads = await getLabelPayloads(ids);
    const labels = payloads.filter((row) => row.labelData).map((row) => row.labelData);
    if (!labels.length) {
      return Response.json({ error: "None of those orders have a label yet." }, { status: 400 });
    }
    const stamp = new Date().toISOString().slice(0, 10);
    return new Response(mergeZplLabels(labels), {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="dallas-bakery-labels-${stamp}.zpl"`,
        "Cache-Control": "no-store",
      },
    });
  }

  if (body.action === "mark-shipped") {
    if (!ids.length) return Response.json({ error: "Select at least one order." }, { status: 400 });
    const shipped = await markShipped(ids);
    // Tracking emails are the promise the site already makes to buyers; this
    // is the moment it is kept. A mail failure must not un-ship the order.
    for (const order of shipped) {
      if (!order.email || !order.trackingNumber || order.trackingEmailSentAt) continue;
      const sent = await sendMail(trackingEmail(order));
      if (sent) await markTrackingEmailed(order.id);
    }
    return Response.json({ shipped: shipped.length });
  }

  if (body.action === "refund") {
    // One order at a time, deliberately: a refund is money leaving the
    // account, and a batch button invites a mis-click.
    const [id] = ids;
    if (!id || ids.length !== 1) {
      return Response.json({ error: "Refund one order at a time." }, { status: 400 });
    }
    const [order] = await listOrders({ status: "all" }).then((rows) => rows.filter((row) => row.id === id));
    if (!order) return Response.json({ error: "Order not found." }, { status: 404 });
    if (order.status === "refunded") return Response.json({ refunded: true, orderNumber: order.orderNumber });
    if (order.status === "shipped") {
      return Response.json(
        { error: `#${order.orderNumber} already shipped. Refund it from Stripe if the boxes are coming back.` },
        { status: 400 },
      );
    }
    if (order.paymentTerms === "account") {
      // Nothing was charged, so there is nothing to send back through
      // Stripe — cancelling the order releases its amount to the buyer's
      // available credit. If the invoice was already paid outside the
      // system, that money is settled outside the system too.
      await markRefunded(order.id);
      return Response.json({ refunded: true, onAccount: true, orderNumber: order.orderNumber });
    }
    if (!order.stripePaymentIntentId) {
      return Response.json({ error: "This order has no payment to refund." }, { status: 400 });
    }
    const refund = await createRefund(order.stripePaymentIntentId);
    if (!refund.ok) {
      return Response.json({ error: `Stripe declined the refund: ${refund.message}` }, { status: 502 });
    }
    await markRefunded(order.id);
    return Response.json({ refunded: true, orderNumber: order.orderNumber });
  }

  if (body.action === "mark-invoice-paid") {
    // Settling an invoice releases that amount back to the buyer's credit
    // line. One at a time, same as refunds — it is a money action.
    const [id] = ids;
    if (!id || ids.length !== 1) {
      return Response.json({ error: "Mark one invoice at a time." }, { status: 400 });
    }
    const order = await markInvoicePaid(id);
    if (!order) return Response.json({ error: "Order not found." }, { status: 404 });
    if (order.paymentTerms !== "account") {
      return Response.json({ error: `#${order.orderNumber} was paid by card — there is no invoice.` }, { status: 400 });
    }
    return Response.json({ invoicePaid: true, orderNumber: order.orderNumber });
  }

  return Response.json({ error: "Unknown action." }, { status: 400 });
}
