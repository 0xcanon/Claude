/**
 * How much of each bread the day needs, and the shape of the day's work.
 *
 * The bake sheet used to be computed inside the admin page's React component,
 * which meant the phone could not show the same numbers without repeating the
 * arithmetic — and two copies of "how many cases do we owe today" is exactly
 * the kind of thing that drifts. It lives here now: no database import, so
 * both surfaces read the same answer and it is covered by tests.
 */

export type BakeableOrder = {
  status: string;
  itemsJson: string;
  invoiceDueAt?: string | null;
  loafCount: number;
  boxCount: number;
  totalCents: number;
  paymentTerms: string;
  invoicePaidAt: string | null;
  requestedDeliveryDate: string | null;
};

export type BakeLine = {
  sku: string;
  name: string;
  cases: number;
  loaves: number;
};

type StoredItem = { sku?: string; name?: string; quantity?: number };

/** Orders that still owe the bench bread. Shipped and settled ones do not. */
export function needsBaking(status: string) {
  return status === "paid" || status === "labeled";
}

/**
 * Cases of each bread still to bake, biggest first.
 *
 * Held, cancelled, refunded and already-shipped orders are excluded: baking
 * for an order nobody is going to send is how a morning gets wasted.
 */
export function bakeSheet(orders: BakeableOrder[]): BakeLine[] {
  const bySku = new Map<string, BakeLine>();
  for (const order of orders) {
    if (!needsBaking(order.status)) continue;
    let items: StoredItem[];
    try {
      items = JSON.parse(order.itemsJson || "[]") as StoredItem[];
    } catch {
      continue;
    }
    const cases = items.reduce((total, item) => total + Number(item.quantity || 0), 0);
    // Loaves per case is derived from the order itself, so a product with a
    // different case size still counts correctly.
    const perCase = cases > 0 ? Math.round(order.loafCount / cases) : 25;
    for (const item of items) {
      const sku = String(item.sku || "");
      if (!sku) continue;
      const quantity = Number(item.quantity || 0);
      if (quantity <= 0) continue;
      const line = bySku.get(sku) || { sku, name: String(item.name || sku), cases: 0, loaves: 0 };
      line.cases += quantity;
      line.loaves += quantity * perCase;
      bySku.set(sku, line);
    }
  }
  return [...bySku.values()].sort((a, b) => b.cases - a.cases || a.name.localeCompare(b.name));
}

export type DaySummary = {
  /** Orders that still need bread baked for them. */
  toBake: number;
  /** Boxes those orders will need. */
  boxes: number;
  /** Total cases across them. */
  cases: number;
  /** Orders already labeled and waiting to be marked shipped. */
  readyToShip: number;
  /** Orders on hold, which are baking for nobody until released. */
  onHold: number;
  /** Money on unpaid invoices, in cents. */
  owedCents: number;
  /** How many of those invoices are past their due date. */
  overdueInvoices: number;
};

/**
 * The one-glance version, for the top of the owner's phone: what is waiting,
 * what is ready, and what is owed.
 */
export function daySummary(
  /** The open queue — what still has to be baked and shipped. */
  open: BakeableOrder[],
  /** Every order, because an invoice is owed long after the bread has gone. */
  all: BakeableOrder[],
  today: string,
): DaySummary {
  let toBake = 0, boxes = 0, cases = 0, readyToShip = 0, onHold = 0;
  let owedCents = 0, overdueInvoices = 0;

  for (const order of open) {
    if (order.status === "held") onHold += 1;
    if (order.status === "labeled") readyToShip += 1;
    if (needsBaking(order.status)) {
      toBake += 1;
      boxes += Number(order.boxCount || 0);
      let items: StoredItem[] = [];
      try {
        items = JSON.parse(order.itemsJson || "[]") as StoredItem[];
      } catch {
        items = [];
      }
      cases += items.reduce((total, item) => total + Number(item.quantity || 0), 0);
    }
  }

  // An invoice is owed until it is settled, whatever the order's stage. Read
  // from every order rather than the open queue: a delivered order with an
  // unpaid invoice is money outstanding, and it has long since left the queue.
  for (const order of all) {
    if (order.paymentTerms !== "account" || order.invoicePaidAt) continue;
    if (order.status === "cancelled") continue;
    owedCents += Number(order.totalCents || 0);
    // Past due is what decides whether to chase someone this morning, so it
    // is counted separately from what is merely owed.
    if (order.invoiceDueAt && order.invoiceDueAt < today) overdueInvoices += 1;
  }
  return { toBake, boxes, cases, readyToShip, onHold, owedCents, overdueInvoices };
}
