/**
 * A buyer's invoices and statements.
 *
 * GET lists what is billable, so the portal and the app can show a paid /
 * due / overdue column without downloading anything. POST mints a short-lived
 * link to one printable document — a browser tab cannot send an
 * Authorization header, so the signed-in client trades its session for a
 * twenty-minute URL scoped to this business.
 */

import { BuyerAuthError, createDocumentToken, requireBuyer } from "../../../buyer-auth.ts";
import { creditStateFor } from "../../../buyer-credit.ts";
import { netTermsLabel } from "../../../credit-terms.ts";
import { ageOpenInvoices, invoiceNumber, invoiceStanding } from "../../../invoice-render.ts";
import { invoiceListFor } from "../../../invoices.ts";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const buyer = await requireBuyer(request);
    const [invoices, credit] = await Promise.all([
      invoiceListFor(buyer.applicationId),
      creditStateFor(buyer.applicationId),
    ]);
    const aging = ageOpenInvoices(invoices);

    return Response.json(
      {
        invoices: invoices.map((order) => {
          const standing = invoiceStanding(order);
          return {
            orderId: order.id,
            invoiceNumber: invoiceNumber(order.orderNumber),
            orderNumber: order.orderNumber,
            placedAt: order.placedAt,
            poNumber: order.poNumber,
            paymentTerms: order.paymentTerms,
            dueAt: order.invoiceDueAt || "",
            paidAt: order.invoicePaidAt || "",
            totalCents: order.totalCents,
            balanceCents: standing.balanceCents,
            status: standing.tone,
            statusLabel: standing.label,
          };
        }),
        openBalanceCents: aging.totalCents,
        overdueCents: aging.days1to30Cents + aging.days31to60Cents + aging.days61PlusCents,
        termsLabel: netTermsLabel(credit.termsDays),
        credit,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (caught) {
    if (caught instanceof BuyerAuthError) {
      return Response.json({ error: caught.message }, { status: caught.status });
    }
    console.error("Buyer document list failed:", caught);
    return Response.json({ error: "Invoices could not be loaded." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const buyer = await requireBuyer(request);

    let body: { kind?: string; orderId?: string };
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Invalid request." }, { status: 400 });
    }

    const kind = body.kind === "statement" ? "statement" : "invoice";
    const ref = kind === "invoice" ? String(body.orderId || "").trim() : "";
    if (kind === "invoice" && !ref) {
      return Response.json({ error: "Which invoice?" }, { status: 400 });
    }

    const { token, expiresAt } = await createDocumentToken({
      kind,
      ref,
      applicationId: buyer.applicationId,
    });
    const origin = new URL(request.url).origin;
    return Response.json(
      { url: `${origin}/api/documents?token=${encodeURIComponent(token)}`, expiresAt },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (caught) {
    if (caught instanceof BuyerAuthError) {
      return Response.json({ error: caught.message }, { status: caught.status });
    }
    console.error("Buyer document link failed:", caught);
    return Response.json({ error: "That document could not be prepared." }, { status: 500 });
  }
}
