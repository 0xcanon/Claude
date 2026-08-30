/**
 * Loading side of invoices and statements: pull the order and the business
 * it belongs to, hand them to the pure renderer.
 *
 * Every read here is scoped to an application id when one is supplied, which
 * is how a buyer is prevented from fetching another business's invoice by
 * guessing an order id — the query simply will not match.
 */

import { and, desc, eq } from "drizzle-orm";

import { getDb } from "../db";
import { orders, wholesaleApplications } from "../db/schema";
import { netTermsLabel } from "./credit-terms.ts";
import type { InvoiceLine, InvoiceOrder, InvoiceParty } from "./invoice-render.ts";

type OrderRow = typeof orders.$inferSelect;
type ApplicationRow = typeof wholesaleApplications.$inferSelect;

function toInvoiceOrder(row: OrderRow): InvoiceOrder {
  let items: InvoiceLine[] = [];
  try {
    const parsed = JSON.parse(row.itemsJson || "[]");
    if (Array.isArray(parsed)) {
      items = parsed.map((item) => ({
        sku: String(item?.sku || ""),
        name: String(item?.name || item?.sku || "Item"),
        quantity: Number(item?.quantity) || 0,
        unitAmountCents: Number(item?.unitAmountCents) || 0,
      }));
    }
  } catch {
    items = [];
  }
  return {
    id: row.id,
    orderNumber: row.orderNumber,
    placedAt: row.createdAt,
    items,
    // Wholesale ships one box per case, so the case count is the box count.
    caseCount: row.boxCount,
    loafCount: row.loafCount,
    subtotalCents: row.subtotalCents,
    shippingCents: row.shippingCents,
    totalCents: row.totalCents,
    paymentTerms: row.paymentTerms,
    invoiceDueAt: row.invoiceDueAt,
    invoicePaidAt: row.invoicePaidAt,
    poNumber: row.poNumber,
    requestedDeliveryDate: row.requestedDeliveryDate,
    trackingNumber: row.trackingNumber,
    status: row.status,
    shipTo: {
      name: row.customerName,
      street: row.street,
      street2: row.street2,
      city: row.city,
      state: row.state,
      zip: row.zip,
    },
  };
}

function toParty(application: ApplicationRow): InvoiceParty {
  return {
    businessName: application.businessName,
    contactName: application.contactName,
    email: application.email,
    phone: application.phone,
    street: application.street,
    street2: application.street2,
    city: application.city,
    state: application.state,
    zip: application.zip,
  };
}

/** The billing party for an order that has no application (retail, legacy). */
function partyFromOrder(row: OrderRow): InvoiceParty {
  return {
    businessName: row.customerName || "Customer",
    contactName: "",
    email: row.email,
    phone: row.phone,
    street: row.street,
    street2: row.street2,
    city: row.city,
    state: row.state,
    zip: row.zip,
  };
}

/**
 * One order's invoice data. Pass an application id to scope the lookup to
 * that business — a buyer route always does; the admin passes nothing.
 */
export async function invoiceForOrder(orderId: string, applicationId?: string) {
  const id = String(orderId || "").trim();
  if (!id) return null;
  const where = applicationId
    ? and(eq(orders.id, id), eq(orders.applicationId, applicationId))
    : eq(orders.id, id);
  const [row] = await getDb().select().from(orders).where(where).limit(1);
  if (!row) return null;

  let party = partyFromOrder(row);
  if (row.applicationId) {
    const [application] = await getDb()
      .select()
      .from(wholesaleApplications)
      .where(eq(wholesaleApplications.id, row.applicationId))
      .limit(1);
    if (application) party = toParty(application);
  }
  return { order: toInvoiceOrder(row), party };
}

/**
 * Everything a statement needs for one business: its open account orders,
 * newest first, plus the terms line that explains the account.
 */
export async function statementFor(applicationId: string) {
  const id = String(applicationId || "").trim();
  if (!id) return null;
  const db = getDb();
  const [application] = await db
    .select()
    .from(wholesaleApplications)
    .where(eq(wholesaleApplications.id, id))
    .limit(1);
  if (!application) return null;

  const rows = await db
    .select()
    .from(orders)
    .where(and(eq(orders.applicationId, id), eq(orders.paymentTerms, "account")))
    .orderBy(desc(orders.orderNumber))
    .limit(500);

  return {
    party: toParty(application),
    orders: rows.filter((row) => row.status !== "refunded").map(toInvoiceOrder),
    creditLimitCents: application.creditLimitCents,
    termsLabel: netTermsLabel(application.creditTermsDays),
  };
}

/** The invoice list a buyer sees in their portal, newest first. */
export async function invoiceListFor(applicationId: string) {
  const id = String(applicationId || "").trim();
  if (!id) return [];
  const rows = await getDb()
    .select()
    .from(orders)
    .where(eq(orders.applicationId, id))
    .orderBy(desc(orders.orderNumber))
    .limit(200);
  return rows.filter((row) => row.status !== "refunded").map(toInvoiceOrder);
}
