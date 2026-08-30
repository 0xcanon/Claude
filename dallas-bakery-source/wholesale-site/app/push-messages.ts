/**
 * What a push notification says.
 *
 * Kept apart from the sending machinery so the wording is unit-testable and
 * so nobody has to read HTTP code to change a sentence a customer sees on
 * their lock screen.
 *
 * House rules for this surface: one sentence, no price, no marketing. A
 * lock-screen preview can be read by anyone holding the phone, and this
 * bakery's prices are set per customer — so an amount never goes in a push.
 */

export type PushMessage = {
  title: string;
  body: string;
  /** Where tapping it should land in the app. */
  data: Record<string, string>;
};

function cases(count: number) {
  return `${count} case${count === 1 ? "" : "s"}`;
}

/** Sent to the buyer the moment their order is recorded. */
export function orderPlacedPush(order: {
  orderNumber: number;
  caseCount: number;
  shipsToday: boolean;
}): PushMessage {
  return {
    title: `Order #${order.orderNumber} received`,
    body: order.shipsToday
      ? `${cases(order.caseCount)} — baking today and shipping this afternoon.`
      : `${cases(order.caseCount)} — baking on the next business day.`,
    data: { screen: "orders", orderNumber: String(order.orderNumber) },
  };
}

/** Sent when the label is scanned and the box is on the truck. */
export function orderShippedPush(order: {
  orderNumber: number;
  trackingNumber: string;
}): PushMessage {
  return {
    title: `Order #${order.orderNumber} is on the way`,
    body: order.trackingNumber
      ? `UPS tracking ${order.trackingNumber}. Tap to follow it.`
      : "It left the bakery today.",
    data: {
      screen: "orders",
      orderNumber: String(order.orderNumber),
      trackingNumber: order.trackingNumber || "",
    },
  };
}

/** Three days out, then on the day. Never mentions the amount. */
export function invoiceDuePush(invoice: {
  orderNumber: number;
  daysUntilDue: number;
}): PushMessage {
  if (invoice.daysUntilDue <= 0) {
    return {
      title: `Invoice DB-${invoice.orderNumber} is due today`,
      body: "Open your account to pay it or see the statement.",
      data: { screen: "invoices", orderNumber: String(invoice.orderNumber) },
    };
  }
  return {
    title: `Invoice DB-${invoice.orderNumber} is due soon`,
    body: `Due in ${invoice.daysUntilDue} day${invoice.daysUntilDue === 1 ? "" : "s"}. Tap to view it.`,
    data: { screen: "invoices", orderNumber: String(invoice.orderNumber) },
  };
}

/** Past due: the account is locked to card until it clears. */
export function invoiceOverduePush(invoice: { orderNumber: number }): PushMessage {
  return {
    title: `Invoice DB-${invoice.orderNumber} is past due`,
    body: "New orders need a card until this is paid. Tap to settle it.",
    data: { screen: "invoices", orderNumber: String(invoice.orderNumber) },
  };
}

/** The owner's alert. This one carries the total — it is the owner's phone. */
export function ownerNewOrderPush(order: {
  orderNumber: number;
  businessName: string;
  caseCount: number;
  totalCents: number;
  paymentTerms: string;
}): PushMessage {
  const amount = `$${(Math.round(order.totalCents) / 100).toFixed(2)}`;
  return {
    title: `New order #${order.orderNumber} — ${cases(order.caseCount)}`,
    body: `${order.businessName || "A wholesale account"} · ${amount}${
      order.paymentTerms === "account" ? " on account" : ""
    }`,
    data: { screen: "orders", orderNumber: String(order.orderNumber) },
  };
}

/** The owner's alert when a bread sells out its capacity for the day. */
export function ownerSoldOutPush(product: { title: string }): PushMessage {
  return {
    title: `${product.title} is fully booked`,
    body: "Today's capacity is committed. Raise it in the admin if you can bake more.",
    data: { screen: "products" },
  };
}

/** An Expo push token, shaped ExponentPushToken[xxxxxxxx]. */
export function isExpoPushToken(token: unknown) {
  return /^Expo(nent)?PushToken\[[^\]]+\]$/.test(String(token || "").trim());
}
