/**
 * Orders as a spreadsheet — what the accountant asks for within a month.
 * Pure (no database import) so it stays unit-testable under node --test.
 */

type CsvOrder = {
  orderNumber: number;
  channel: string;
  status: string;
  createdAt: string;
  shippedAt: string | null;
  customerName: string;
  email: string;
  phone: string;
  street: string;
  street2: string;
  city: string;
  state: string;
  zip: string;
  itemsJson: string;
  loafCount: number;
  boxCount: number;
  subtotalCents: number;
  shippingCents: number;
  totalCents: number;
  trackingNumber: string;
  /** Present from v21 on; older rows export as empty cells. */
  poNumber?: string;
  requestedDeliveryDate?: string | null;
  paymentTerms?: string;
  invoiceDueAt?: string | null;
  invoicePaidAt?: string | null;
};

function csvField(value: string | number) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function ordersToCsv(rows: CsvOrder[]) {
  const header = [
    "order_number", "channel", "status", "created_at", "shipped_at",
    "customer_name", "email", "phone", "street", "street2", "city", "state", "zip",
    "po_number", "requested_delivery_date",
    "items", "loaf_count", "box_count",
    "subtotal", "shipping", "total", "tracking_number",
    "payment_terms", "invoice_due", "invoice_paid",
  ];
  const lines = rows.map((order) => {
    const items = (JSON.parse(order.itemsJson || "[]") as { name?: string; quantity?: number }[])
      .map((item) => `${item.quantity} x ${item.name}`)
      .join("; ");
    return [
      order.orderNumber, order.channel, order.status, order.createdAt, order.shippedAt || "",
      order.customerName, order.email, order.phone, order.street, order.street2,
      order.city, order.state, order.zip,
      order.poNumber || "", order.requestedDeliveryDate || "",
      items, order.loafCount, order.boxCount,
      (order.subtotalCents / 100).toFixed(2),
      (order.shippingCents / 100).toFixed(2),
      (order.totalCents / 100).toFixed(2),
      order.trackingNumber,
      order.paymentTerms || "card", order.invoiceDueAt || "", order.invoicePaidAt || "",
    ].map(csvField).join(",");
  });
  return [header.join(","), ...lines].join("\n") + "\n";
}
