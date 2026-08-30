import assert from "node:assert/strict";
import test from "node:test";

import {
  OVERDUE_REMINDER_EVERY_DAYS,
  REMINDER_LEAD_DAYS,
  reminderKindFor,
} from "../app/credit-terms.ts";
import {
  invoiceDuePush,
  invoiceOverduePush,
  isExpoPushToken,
  orderPlacedPush,
  orderShippedPush,
  ownerNewOrderPush,
  ownerSoldOutPush,
} from "../app/push-messages.ts";

test("only genuine Expo tokens are accepted", () => {
  assert.equal(isExpoPushToken("ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]"), true);
  assert.equal(isExpoPushToken("ExpoPushToken[abc123]"), true);
  assert.equal(isExpoPushToken(""), false);
  assert.equal(isExpoPushToken("not-a-token"), false);
  assert.equal(isExpoPushToken("ExponentPushToken["), false);
  assert.equal(isExpoPushToken(null), false);
  assert.equal(isExpoPushToken(12345), false);
});

test("a buyer's order notification never carries an amount", () => {
  // Prices here are set per customer, and a lock screen is read by whoever
  // is holding the phone — so no push to a buyer states money.
  const messages = [
    orderPlacedPush({ orderNumber: 1042, caseCount: 4, shipsToday: true }),
    orderPlacedPush({ orderNumber: 1042, caseCount: 1, shipsToday: false }),
    orderShippedPush({ orderNumber: 1042, trackingNumber: "1Z999AA10123456784" }),
    orderShippedPush({ orderNumber: 1042, trackingNumber: "" }),
    invoiceDuePush({ orderNumber: 1042, daysUntilDue: 3 }),
    invoiceDuePush({ orderNumber: 1042, daysUntilDue: 0 }),
    invoiceOverduePush({ orderNumber: 1042 }),
  ];
  for (const message of messages) {
    const text = `${message.title} ${message.body}`;
    assert.ok(!/\$\d/.test(text), `a buyer push stated an amount: ${text}`);
    assert.ok(message.title.length > 0 && message.body.length > 0);
  }
});

test("order notifications say whether it bakes today", () => {
  assert.match(orderPlacedPush({ orderNumber: 7, caseCount: 4, shipsToday: true }).body, /baking today/);
  assert.match(orderPlacedPush({ orderNumber: 7, caseCount: 4, shipsToday: false }).body, /next business day/);
  assert.match(orderPlacedPush({ orderNumber: 7, caseCount: 1, shipsToday: true }).body, /^1 case /);
});

test("a shipped notification carries the tracking number when there is one", () => {
  const withTracking = orderShippedPush({ orderNumber: 7, trackingNumber: "1Z9" });
  assert.match(withTracking.body, /1Z9/);
  assert.equal(withTracking.data.trackingNumber, "1Z9");
  const without = orderShippedPush({ orderNumber: 7, trackingNumber: "" });
  assert.match(without.body, /left the bakery/);
});

test("an overdue invoice tells the buyer why their account stopped", () => {
  assert.match(invoiceOverduePush({ orderNumber: 1042 }).body, /need a card until this is paid/);
  assert.match(invoiceDuePush({ orderNumber: 1042, daysUntilDue: 0 }).title, /due today/);
  assert.match(invoiceDuePush({ orderNumber: 1042, daysUntilDue: 1 }).body, /Due in 1 day\./);
});

test("every notification says where tapping it should land", () => {
  assert.equal(orderPlacedPush({ orderNumber: 7, caseCount: 1, shipsToday: true }).data.screen, "orders");
  assert.equal(invoiceOverduePush({ orderNumber: 7 }).data.screen, "invoices");
  assert.equal(ownerSoldOutPush({ title: "Rye" }).data.screen, "products");
});

test("the owner's notification does carry the amount — it is the owner's phone", () => {
  const message = ownerNewOrderPush({
    orderNumber: 1042,
    businessName: "Halcyon Grocers",
    caseCount: 4,
    totalCents: 28_250,
    paymentTerms: "account",
  });
  assert.match(message.title, /#1042 — 4 cases/);
  assert.match(message.body, /Halcyon Grocers/);
  assert.match(message.body, /\$282\.50/);
  assert.match(message.body, /on account/);

  const card = ownerNewOrderPush({
    orderNumber: 1043,
    businessName: "",
    caseCount: 1,
    totalCents: 7500,
    paymentTerms: "card",
  });
  assert.match(card.body, /A wholesale account · \$75\.00$/);
});

test("reminders fire three days out, on the day, then weekly", () => {
  assert.equal(reminderKindFor(REMINDER_LEAD_DAYS), "due-soon");
  assert.equal(reminderKindFor(0), "due-today");
  assert.equal(reminderKindFor(-OVERDUE_REMINDER_EVERY_DAYS), "overdue");
  assert.equal(reminderKindFor(-OVERDUE_REMINDER_EVERY_DAYS * 3), "overdue");
});

test("no reminder on the quiet days, so the app never nags", () => {
  for (const days of [30, 10, 5, 4, 2, 1, -1, -2, -6, -8, -13]) {
    assert.equal(reminderKindFor(days), null, `unexpected reminder at ${days} days`);
  }
});

test("a nonsense day count produces no reminder rather than a wrong one", () => {
  assert.equal(reminderKindFor(Number.NaN), null);
  assert.equal(reminderKindFor(1.5), null);
});
