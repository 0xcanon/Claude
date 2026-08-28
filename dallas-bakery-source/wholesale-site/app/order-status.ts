/**
 * One vocabulary for where an order is, shared by the buyer app, the website's
 * order history, and the admin queue.
 *
 * The database stores three states — paid, labeled, shipped. "Labeled" is an
 * internal bakery step (a label has been bought), so buyers are shown "packed"
 * rather than a word that only means something on the shipping bench.
 */

export type OrderStage = "paid" | "labeled" | "shipped" | "refunded";

export type BuyerStage = {
  key: OrderStage;
  /** Short label for a status pill. */
  label: string;
  /** One line explaining what is happening now. */
  detail: string;
  /** Position in the three-step tracker shown to buyers. */
  step: 1 | 2 | 3;
};

const STAGES: Record<OrderStage, BuyerStage> = {
  refunded: {
    key: "refunded",
    label: "Refunded",
    detail: "This order was refunded to your card. Nothing ships.",
    step: 1,
  },
  paid: {
    key: "paid",
    label: "Baking",
    detail: "Your cases are in the bake schedule.",
    step: 1,
  },
  labeled: {
    key: "labeled",
    label: "Packed",
    detail: "Boxed and waiting for the UPS pickup.",
    step: 2,
  },
  shipped: {
    key: "shipped",
    label: "Shipped",
    detail: "On its way. Track it with the number below.",
    step: 3,
  },
};

export function buyerStage(status: string): BuyerStage {
  return STAGES[status as OrderStage] || STAGES.paid;
}

/** UPS public tracking page for a tracking number. */
export function trackingUrl(trackingNumber: string) {
  const trimmed = String(trackingNumber || "").trim();
  return trimmed ? `https://www.ups.com/track?loc=en_US&tracknum=${encodeURIComponent(trimmed)}` : "";
}

/**
 * Whether a buyer can track this order yet. A tracking number exists from the
 * moment a label is bought, but UPS has nothing to show until the parcel is
 * scanned, so tracking is offered only once the order is actually shipped.
 */
export function isTrackable(status: string, trackingNumber: string) {
  return status === "shipped" && Boolean(String(trackingNumber || "").trim());
}
