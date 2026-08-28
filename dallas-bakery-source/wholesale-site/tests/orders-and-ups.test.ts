import assert from "node:assert/strict";
import test from "node:test";

import { mergeZplLabels, upsConfigured, upsIsProduction } from "../app/ups-shipping.ts";
import { ordersToCsv } from "../app/orders-csv.ts";
import { trackingEmail } from "../app/email-notifications.ts";

test("UPS stays disconnected until all three credentials exist", () => {
  delete process.env.UPS_CLIENT_ID;
  delete process.env.UPS_CLIENT_SECRET;
  delete process.env.UPS_ACCOUNT_NUMBER;
  assert.equal(upsConfigured(), false);

  process.env.UPS_CLIENT_ID = "id";
  process.env.UPS_CLIENT_SECRET = "secret";
  assert.equal(upsConfigured(), false, "an account number is still required");

  process.env.UPS_ACCOUNT_NUMBER = "A1B2C3";
  assert.equal(upsConfigured(), true);
});

test("UPS defaults to the test environment until production is chosen", () => {
  delete process.env.UPS_ENVIRONMENT;
  assert.equal(upsIsProduction(), false);
  process.env.UPS_ENVIRONMENT = "production";
  assert.equal(upsIsProduction(), true);
  process.env.UPS_ENVIRONMENT = "test";
  assert.equal(upsIsProduction(), false);
});

test("ZPL labels concatenate into one printable batch", () => {
  const first = btoa("^XA^FO50,50^FDLabel one^FS^XZ");
  const second = btoa("^XA^FO50,50^FDLabel two^FS^XZ");
  const merged = mergeZplLabels([first, second]);
  assert.equal(merged.split("^XZ").length - 1, 2);
  assert.ok(merged.includes("Label one"));
  assert.ok(merged.includes("Label two"));
  assert.equal(mergeZplLabels([]), "");
});

test("tracking email carries the number and a working UPS link", () => {
  const email = trackingEmail({
    channel: "retail",
    orderNumber: 1042,
    customerName: "Sara Nazari",
    email: "sara@example.com",
    trackingNumber: "1Z999AA10123456784",
  });
  assert.equal(email.to, "sara@example.com");
  assert.ok(email.subject.includes("#1042"));
  assert.ok(email.text.includes("1Z999AA10123456784"));
  assert.ok(email.text.includes("ups.com/track?tracknum=1Z999AA10123456784"));
});

test("the CSV export quotes commas and reports money in dollars", () => {
  const csv = ordersToCsv([{
    channel: "wholesale",
    orderNumber: 1042, customerName: 'Saffron Kitchen, "The Original"', email: "mina@saffronkitchen.com",
    phone: "(214) 555-0173", street: "1914 Greenville Ave", street2: "Suite 120",
    city: "Dallas", state: "TX", zip: "75206",
    itemsJson: JSON.stringify([{ sku: "WS-BARBARI-25", name: "Barbari — Case of 25", quantity: 2, unitAmountCents: 6250 }]),
    loafCount: 50, boxCount: 2, subtotalCents: 12_500, shippingCents: 2_500, totalCents: 15_000,
    status: "shipped", trackingNumber: "1Z999AA10123456784",
    shippedAt: "2026-08-21 23:40:00", createdAt: "2026-08-21 16:12:00",
  }]);
  const [header, row] = csv.trim().split("\n");
  assert.match(header, /^order_number,channel,status/);
  // The comma-and-quotes name survives as one field.
  assert.match(row, /"Saffron Kitchen, ""The Original"""/);
  assert.match(row, /150\.00/);
  assert.match(row, /2 x Barbari/);
  assert.match(row, /1Z999AA10123456784/);
});
