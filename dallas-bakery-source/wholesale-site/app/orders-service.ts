import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";

import { getDb } from "../db";
import { orders } from "../db/schema";
import { alertOwner } from "./observability.ts";
import { recordEvent, type Actor } from "./order-events.ts";
import { bakeryDayStartIso } from "./order-rules.ts";
import { packagesForOrder, type PackableItem } from "./parcel-packing.ts";
import { listAllProducts } from "./wholesale-catalog.ts";
import { shippingBoxesForQuantity } from "./shipping-calculation.ts";
import { getWholesaleShippingSettings } from "./shipping-settings.ts";
import { createUpsLabel, type LabelRecipient } from "./ups-shipping.ts";

export type OrderChannel = "retail" | "wholesale";

export type OrderItem = {
  sku: string;
  name: string;
  quantity: number;
  unitAmountCents: number;
};

export type NewOrderInput = {
  channel: OrderChannel;
  stripeSessionId: string;
  stripePaymentIntentId: string;
  customerName: string;
  email: string;
  phone: string;
  street: string;
  street2: string;
  city: string;
  state: string;
  zip: string;
  items: OrderItem[];
  loafCount: number;
  /** Wholesale only: cases ordered. One case is one box. */
  caseCount?: number;
  subtotalCents: number;
  shippingCents: number;
  totalCents: number;
  /** The wholesale application that placed the order. Empty for retail. */
  applicationId?: string;
  /** "card" (default) was charged at checkout; "account" is invoiced. */
  paymentTerms?: "card" | "account";
  /** Account orders: when the invoice is due (from the buyer's net terms). */
  invoiceDueAt?: string;
  /** The buyer's own purchase-order reference, for their accounts payable. */
  poNumber?: string;
  /** Delivery day the buyer asked for (YYYY-MM-DD). A request, not a promise. */
  requestedDeliveryDate?: string;
};

// Central time is the bakery's day boundary; orders are grouped the way the
// person standing at the printer thinks about them.
function todayStartIso() {
  return bakeryDayStartIso();
}

/**
 * Records a paid Stripe Checkout session. Idempotent: Stripe retries webhooks,
 * and the unique index on the session id makes a repeat delivery a no-op
 * rather than a duplicate box on the shipping bench.
 */
export async function recordOrder(input: NewOrderInput) {
  const db = getDb();
  const [existing] = await db
    // The status comes back too: a retry arriving after the owner has already
    // cancelled or refunded the order is still a no-op, but it is worth
    // saying out loud rather than swallowing.
    .select({ id: orders.id, orderNumber: orders.orderNumber, status: orders.status })
    .from(orders)
    .where(eq(orders.stripeSessionId, input.stripeSessionId))
    .limit(1);
  if (existing) {
    return {
      created: false,
      id: existing.id,
      orderNumber: existing.orderNumber,
      existingStatus: existing.status,
    };
  }

  // Wholesale ships one box per case, so the case count is the box count.
  // Retail has no cases and still divides loaves into boxes.
  const boxCount = input.channel === "wholesale" && input.caseCount
    ? input.caseCount
    : Math.max(1, shippingBoxesForQuantity(
        input.loafCount,
        (await getWholesaleShippingSettings()).unitsPerBox,
      ));
  const [{ nextNumber }] = await db
    .select({ nextNumber: sql<number>`COALESCE(MAX(${orders.orderNumber}), 1000) + 1` })
    .from(orders);

  const id = crypto.randomUUID();
  await db.insert(orders).values({
    id,
    channel: input.channel,
    stripeSessionId: input.stripeSessionId,
    stripePaymentIntentId: input.stripePaymentIntentId,
    orderNumber: nextNumber,
    customerName: input.customerName,
    email: input.email.toLowerCase(),
    phone: input.phone,
    street: input.street,
    street2: input.street2,
    city: input.city,
    state: input.state,
    zip: input.zip,
    itemsJson: JSON.stringify(input.items),
    loafCount: input.loafCount,
    boxCount,
    subtotalCents: input.subtotalCents,
    shippingCents: input.shippingCents,
    totalCents: input.totalCents,
    applicationId: input.applicationId || "",
    paymentTerms: input.paymentTerms || "card",
    invoiceDueAt: input.paymentTerms === "account" ? input.invoiceDueAt || null : null,
    poNumber: (input.poNumber || "").trim(),
    requestedDeliveryDate: input.requestedDeliveryDate || null,
    status: "paid",
  });

  // The first line of the order's history. Without it, a normal order's
  // history is blank until something goes wrong — which is exactly when you
  // want to know what it looked like before.
  await recordEvent({
    orderId: id,
    kind: "placed",
    summary: input.paymentTerms === "account"
      ? `Ordered on account${input.invoiceDueAt ? `, invoice due ${input.invoiceDueAt}` : ""}.`
      : "Ordered and paid by card.",
    detail: [
      ...input.items.map((item) => `${item.quantity} × ${item.name}`),
      `Total $${(input.totalCents / 100).toFixed(2)}`,
      input.poNumber ? `Their PO ${input.poNumber}` : "",
      input.requestedDeliveryDate ? `Asked for delivery ${input.requestedDeliveryDate}` : "",
    ].filter(Boolean).join("\n"),
    actor: input.email ? { kind: "buyer", email: input.email } : { kind: "system" },
  });

  return { created: true, id, orderNumber: nextNumber, existingStatus: "" };
}

export type OrderRow = typeof orders.$inferSelect;

export async function listOrders(options: { status?: "unshipped" | "today" | "all" } = {}) {
  const db = getDb();
  const scope = options.status || "unshipped";
  const base = db.select().from(orders);
  if (scope === "today") {
    return base.where(gte(orders.createdAt, todayStartIso())).orderBy(desc(orders.orderNumber));
  }
  if (scope === "unshipped") {
    return base.where(inArray(orders.status, ["paid", "labeled"])).orderBy(desc(orders.orderNumber));
  }
  return base.orderBy(desc(orders.orderNumber)).limit(200);
}

/** Today's orders that still need a label — the "print all" batch. */
export async function listTodaysUnlabeled() {
  return getDb()
    .select()
    .from(orders)
    .where(and(eq(orders.status, "paid"), gte(orders.createdAt, todayStartIso())))
    .orderBy(orders.orderNumber);
}

function recipientOf(order: OrderRow): LabelRecipient {
  return {
    name: order.customerName,
    phone: order.phone,
    street: order.street,
    street2: order.street2,
    city: order.city,
    state: order.state,
    zip: order.zip,
  };
}

export type LabelOutcome = {
  id: string;
  orderNumber: number;
  customerName: string;
  ok: boolean;
  trackingNumber?: string;
  error?: string;
};

/**
 * Creates UPS labels for the given orders, one call each, and stores the
 * result. Failures are recorded per order and returned alongside successes:
 * a single bad address never aborts the day's batch.
 */
export async function createLabelsForOrders(ids: string[], actor: Actor = { kind: "system" }) {
  const db = getDb();
  const settings = await getWholesaleShippingSettings();
  const fallbackParcel = {
    boxWeightOz: settings.boxWeightOz,
    boxLengthIn: settings.boxLengthIn,
    boxWidthIn: settings.boxWidthIn,
    boxHeightIn: settings.boxHeightIn,
  };
  // Each product's own parcel, retired products included, so an order placed
  // just before a bread was deactivated still packs at its real weight.
  const parcelBySku = new Map(
    (await listAllProducts()).map((product) => [product.sku, {
      boxWeightOz: product.boxWeightOz,
      boxLengthIn: product.boxLengthIn,
      boxWidthIn: product.boxWidthIn,
      boxHeightIn: product.boxHeightIn,
    }]),
  );

  const rows = ids.length
    ? await db.select().from(orders).where(inArray(orders.id, ids))
    : [];
  const outcomes: LabelOutcome[] = [];

  for (const order of rows) {
    if (order.labelData && order.trackingNumber) {
      // Already labeled — never buy a second label for the same box.
      outcomes.push({
        id: order.id,
        orderNumber: order.orderNumber,
        customerName: order.customerName,
        ok: true,
        trackingNumber: order.trackingNumber,
      });
      continue;
    }
    const items = JSON.parse(order.itemsJson || "[]") as PackableItem[];
    const packages = packagesForOrder(items, parcelBySku, fallbackParcel, order.boxCount);
    const result = await createUpsLabel(recipientOf(order), packages, `DB-${order.orderNumber}`);
    if (result.ok) {
      await db
        .update(orders)
        .set({
          status: "labeled",
          trackingNumber: result.trackingNumber,
          labelData: result.labelBase64,
          labelFormat: result.format,
          labelError: "",
          labeledAt: sql`CURRENT_TIMESTAMP`,
          updatedAt: sql`CURRENT_TIMESTAMP`,
        })
        .where(eq(orders.id, order.id));
      await recordEvent({
        orderId: order.id,
        kind: "labeled",
        summary: `Packed and labeled — UPS ${result.trackingNumber}.`,
        detail: `${packages.length} parcel${packages.length === 1 ? "" : "s"}`,
        actor,
      });
      outcomes.push({
        id: order.id,
        orderNumber: order.orderNumber,
        customerName: order.customerName,
        ok: true,
        trackingNumber: result.trackingNumber,
      });
    } else {
      await db
        .update(orders)
        .set({ labelError: result.error, updatedAt: sql`CURRENT_TIMESTAMP` })
        .where(eq(orders.id, order.id));
      // A failed label is part of this order's story too — it explains the
      // gap between "paid" and "shipped" that someone will ask about later.
      await recordEvent({
        orderId: order.id,
        kind: "note",
        summary: "UPS would not produce a label.",
        detail: result.error,
        actor,
        buyerVisible: false,
      });
      void alertOwner("ups-label", `Order #${order.orderNumber}: ${result.error}`, {
        orderNumber: order.orderNumber,
        city: order.city,
        state: order.state,
      });
      outcomes.push({
        id: order.id,
        orderNumber: order.orderNumber,
        customerName: order.customerName,
        ok: false,
        error: result.error,
      });
    }
  }
  return outcomes;
}

export async function getLabelPayloads(ids: string[]) {
  if (!ids.length) return [];
  return getDb()
    .select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      labelData: orders.labelData,
      trackingNumber: orders.trackingNumber,
    })
    .from(orders)
    .where(inArray(orders.id, ids));
}

export async function markShipped(ids: string[], actor: Actor = { kind: "system" }) {
  if (!ids.length) return [];
  const db = getDb();
  await db
    .update(orders)
    .set({ status: "shipped", shippedAt: sql`CURRENT_TIMESTAMP`, updatedAt: sql`CURRENT_TIMESTAMP` })
    .where(inArray(orders.id, ids));
  const shipped = await db.select().from(orders).where(inArray(orders.id, ids));
  for (const order of shipped) {
    await recordEvent({
      orderId: order.id,
      kind: "shipped",
      summary: order.trackingNumber
        ? `Handed to UPS — tracking ${order.trackingNumber}.`
        : "Handed to UPS.",
      actor,
    });
  }
  return shipped;
}

export async function markTrackingEmailed(id: string) {
  await getDb()
    .update(orders)
    .set({ trackingEmailSentAt: sql`CURRENT_TIMESTAMP`, updatedAt: sql`CURRENT_TIMESTAMP` })
    .where(eq(orders.id, id));
}

/**
 * Marks an account order's invoice as settled, which releases its amount
 * back to the buyer's available credit. Idempotent, and a no-op for card
 * orders — they were paid at checkout and never held credit.
 */
export async function markInvoicePaid(id: string, actor: Actor = { kind: "system" }) {
  const db = getDb();
  const [order] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
  if (!order) return null;
  if (order.paymentTerms !== "account" || order.invoicePaidAt) return order;
  const [updated] = await db
    .update(orders)
    .set({ invoicePaidAt: sql`CURRENT_TIMESTAMP`, updatedAt: sql`CURRENT_TIMESTAMP` })
    .where(eq(orders.id, id))
    .returning();
  if (updated) {
    await recordEvent({
      orderId: id,
      kind: "invoice_paid",
      summary: `Invoice settled — $${(order.totalCents / 100).toFixed(2)} back on their credit line.`,
      actor,
      amountCents: order.totalCents,
    });
  }
  return updated || null;
}

export type WeeklySummaryRow = {
  week: string;
  orders: number;
  loaves: number;
  revenueCents: number;
};

/**
 * The last eight ISO-ish weeks of paid volume, newest first. Refunded orders
 * are excluded so the revenue line is money actually kept.
 */
export async function weeklySummary(): Promise<WeeklySummaryRow[]> {
  const db = getDb();
  const rows = await db
    .select({
      week: sql<string>`strftime('%Y-W%W', ${orders.createdAt})`,
      orders: sql<number>`COUNT(*)`,
      loaves: sql<number>`SUM(${orders.loafCount})`,
      revenueCents: sql<number>`SUM(${orders.totalCents})`,
    })
    .from(orders)
    .where(sql`${orders.status} != 'refunded'`)
    .groupBy(sql`strftime('%Y-W%W', ${orders.createdAt})`)
    .orderBy(desc(sql`strftime('%Y-W%W', ${orders.createdAt})`))
    .limit(8);
  return rows.map((row) => ({
    week: row.week,
    orders: Number(row.orders || 0),
    loaves: Number(row.loaves || 0),
    revenueCents: Number(row.revenueCents || 0),
  }));
}
