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
};

function csvField(value: string | number) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function ordersToCsv(rows: CsvOrder[]) {
  const header = [
    "order_number", "channel", "status", "created_at", "shipped_at",
    "customer_name", "email", "phone", "street", "street2", "city", "state", "zip",
    "items", "loaf_count", "box_count",
    "subtotal", "shipping", "total", "tracking_number",
  ];
  const lines = rows.map((order) => {
    const items = (JSON.parse(order.itemsJson || "[]") as { name?: string; quantity?: number }[])
      .map((item) => `${item.quantity} x ${item.name}`)
      .join("; ");
    return [
      order.orderNumber, order.channel, order.status, order.createdAt, order.shippedAt || "",
      order.customerName, order.email, order.phone, order.street, order.street2,
      order.city, order.state, order.zip,
      items, order.loafCount, order.boxCount,
      (order.subtotalCents / 100).toFixed(2),
      (order.shippingCents / 100).toFixed(2),
      (order.totalCents / 100).toFixed(2),
      order.trackingNumber,
    ].map(csvField).join(",");
  });
  return [header.join(","), ...lines].join("\n") + "\n";
}
