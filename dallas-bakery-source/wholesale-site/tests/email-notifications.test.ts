import assert from "node:assert/strict";
import test from "node:test";

import {
  buyerOrderConfirmationEmail,
  ownerNewOrderEmail,
  applicantDecisionEmail,
  mailConfigured,
  newApplicationOwnerEmail,
  orderingReadyEmail,
} from "../app/email-notifications.ts";

const application = {
  id: "app-1",
  businessName: "Sadaf International Market",
  businessType: "grocery",
  contactName: "Reza Tabrizi",
  email: "reza@sadafmarkets.com",
  phone: "(972) 555-0198",
  city: "Richardson",
  state: "TX",
};

test("mail stays off until a key and sender are configured", () => {
  delete process.env.MAIL_API_KEY;
  delete process.env.MAIL_FROM;
  assert.equal(mailConfigured(), false);
});

test("owner alert names the business, screening state, and review portal", () => {
  process.env.ADMIN_LOGIN_EMAIL = "sales@dallasbakery.com";
  const email = newApplicationOwnerEmail(application, { screeningStatus: "owner_review" });
  assert.equal(email.to, "sales@dallasbakery.com");
  assert.ok(email.subject.includes(application.businessName));
  assert.ok(email.text.includes("needs your review"));
  assert.ok(email.text.includes("https://dallasbakery.net/admin"));
});

test("approval email includes the portal only once ordering is ready", () => {
  const ready = applicantDecisionEmail(application, "approved", {
    orderingReady: true,
    portalUrl: "https://account.dallasbakery.net",
  });
  assert.equal(ready.to, application.email);
  assert.ok(ready.text.includes("https://account.dallasbakery.net"));

  const notReady = applicantDecisionEmail(application, "approved", {
    orderingReady: false,
    portalUrl: "https://account.dallasbakery.net",
  });
  assert.ok(!notReady.text.includes("https://account.dallasbakery.net"));
  assert.ok(notReady.text.includes("finishing your ordering setup"));
});

test("decline email stays neutral and never carries owner notes", () => {
  const email = applicantDecisionEmail(application, "declined", {
    orderingReady: false,
    portalUrl: null,
  });
  assert.ok(email.text.includes("aren't able to open a wholesale account"));
  assert.ok(email.text.includes("sales@dallasbakery.com"));
  assert.ok(!email.text.toLowerCase().includes("note"));
  assert.ok(!email.text.toLowerCase().includes("screening"));
});

test("ordering-ready email adapts to whether a portal link exists", () => {
  const withPortal = orderingReadyEmail(application, "https://account.dallasbakery.net");
  assert.ok(withPortal.text.includes("https://account.dallasbakery.net"));
  const appOnly = orderingReadyEmail(application, null);
  assert.ok(appOnly.text.includes("Dallas Bakery Wholesale app"));
});

const paidOrder = {
  channel: "wholesale",
  orderNumber: 1043,
  customerName: "Mina Farahani",
  email: "mina@saffronkitchen.com",
  city: "Dallas",
  state: "TX",
  items: [
    { name: "Barbari — Case of 25", quantity: 2 },
    { name: "Sesame — Case of 25", quantity: 1 },
  ],
  caseCount: 3,
  boxCount: 3,
  loafCount: 75,
  subtotalCents: 17_000,
  shippingCents: 3_750,
  totalCents: 20_750,
  shipsToday: true,
};

test("the owner is told what landed and whether it ships today", () => {
  const mail = ownerNewOrderEmail(paidOrder);
  assert.match(mail.subject, /#1043/);
  assert.match(mail.subject, /3 cases/);
  assert.match(mail.subject, /ships today/);
  assert.match(mail.text, /2 x Barbari/);
  assert.match(mail.text, /Charged \$207\.50/);
  assert.match(mail.text, /dallasbakery\.net\/admin/);
});

test("the buyer confirmation names the order, the items, and the total", () => {
  const mail = buyerOrderConfirmationEmail(paidOrder);
  assert.equal(mail.to, "mina@saffronkitchen.com");
  assert.match(mail.subject, /#1043 confirmed/);
  assert.match(mail.text, /Hi Mina,/);
  assert.match(mail.text, /1 x Sesame/);
  assert.match(mail.text, /Total charged: \$207\.50/);
  assert.match(mail.text, /bakes and ships today/);
});

test("an after-cutoff order says next business day instead", () => {
  const mail = buyerOrderConfirmationEmail({ ...paidOrder, shipsToday: false });
  assert.match(mail.text, /next business day/);
  assert.doesNotMatch(mail.text, /ships today/);
});
