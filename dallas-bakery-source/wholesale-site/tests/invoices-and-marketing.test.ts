import assert from "node:assert/strict";
import test from "node:test";

import {
  ageOpenInvoices,
  escapeHtml,
  invoiceNumber,
  invoiceStanding,
  longDate,
  money,
  renderInvoiceHtml,
  renderStatementHtml,
  type InvoiceOrder,
  type InvoiceParty,
} from "../app/invoice-render.ts";
import {
  campaignFooter,
  composeCampaign,
  greeting,
  previewSubject,
  validateCampaign,
  POSTAL_ADDRESS,
} from "../app/marketing-copy.ts";
import {
  MAX_PO_NUMBER_LENGTH,
  bakeryDayStartIso,
  normalizePoNumber,
  validatePoNumber,
} from "../app/order-rules.ts";

const TODAY = new Date("2026-09-20T12:00:00Z");

const PARTY: InvoiceParty = {
  businessName: "Halcyon Grocers",
  contactName: "Dana Reyes",
  email: "ap@halcyon.example",
  phone: "214-555-0117",
  street: "88 Market Row",
  street2: "Suite 4",
  city: "Fort Worth",
  state: "TX",
  zip: "76102",
};

function order(overrides: Partial<InvoiceOrder> = {}): InvoiceOrder {
  return {
    id: "order-1",
    orderNumber: 1042,
    placedAt: "2026-09-01 14:20:00",
    items: [
      { sku: "WS-BARBARI-25", name: "Barbari — Case of 25", quantity: 3, unitAmountCents: 6250 },
      { sku: "WS-SESAME-25", name: "Sesame — Case of 25", quantity: 1, unitAmountCents: 4500 },
    ],
    caseCount: 4,
    loafCount: 100,
    subtotalCents: 23_250,
    shippingCents: 5000,
    totalCents: 28_250,
    paymentTerms: "account",
    invoiceDueAt: "2026-09-16",
    invoicePaidAt: null,
    poNumber: "PO-99120",
    requestedDeliveryDate: "2026-09-04",
    trackingNumber: "1Z999AA10123456784",
    status: "shipped",
    shipTo: {
      name: "Halcyon Grocers — Camp Bowie",
      street: "88 Market Row",
      street2: "",
      city: "Fort Worth",
      state: "TX",
      zip: "76102",
    },
    ...overrides,
  };
}

test("money formats cents the way an invoice reads", () => {
  assert.equal(money(0), "$0.00");
  assert.equal(money(28_250), "$282.50");
  assert.equal(money(-500), "-$5.00");
});

test("invoice numbers are derived from the order number", () => {
  assert.equal(invoiceNumber(1042), "DB-1042");
});

test("an unpaid invoice past its due date is marked overdue with the balance", () => {
  const standing = invoiceStanding(order(), TODAY);
  assert.equal(standing.tone, "overdue");
  assert.equal(standing.balanceCents, 28_250);
  assert.match(standing.label, /4 days overdue/);
});

test("an invoice still inside its terms shows a due date, not a warning", () => {
  const standing = invoiceStanding(order({ invoiceDueAt: "2026-10-01" }), TODAY);
  assert.equal(standing.tone, "due");
  assert.match(standing.label, /Due October 1, 2026/);
});

test("a paid invoice and a card order both owe nothing", () => {
  assert.equal(invoiceStanding(order({ invoicePaidAt: "2026-09-10" }), TODAY).balanceCents, 0);
  assert.equal(invoiceStanding(order({ paymentTerms: "card" }), TODAY).balanceCents, 0);
  assert.equal(invoiceStanding(order({ paymentTerms: "card" }), TODAY).tone, "card");
});

test("aging sorts open invoices into the buckets AP departments use", () => {
  const aging = ageOpenInvoices([
    order({ id: "a", invoiceDueAt: "2026-10-05", totalCents: 10_000 }), // current
    order({ id: "b", invoiceDueAt: "2026-09-16", totalCents: 20_000 }), // 4 days late
    order({ id: "c", invoiceDueAt: "2026-08-10", totalCents: 30_000 }), // 41 days
    order({ id: "d", invoiceDueAt: "2026-06-01", totalCents: 40_000 }), // 111 days
    order({ id: "e", invoicePaidAt: "2026-09-02", totalCents: 99_999 }), // settled
    order({ id: "f", paymentTerms: "card", totalCents: 88_888 }), // never owed
  ], TODAY);
  assert.equal(aging.currentCents, 10_000);
  assert.equal(aging.days1to30Cents, 20_000);
  assert.equal(aging.days31to60Cents, 30_000);
  assert.equal(aging.days61PlusCents, 40_000);
  assert.equal(aging.totalCents, 100_000);
});

test("an invoice carries everything a bookkeeper needs to pay it", () => {
  const html = renderInvoiceHtml(order(), PARTY, TODAY);
  for (const needle of [
    "DB-1042",
    "PO-99120",
    "Halcyon Grocers",
    "Barbari — Case of 25",
    "$282.50",
    "1Z999AA10123456784",
    "2643 Manana Dr",
    "Balance due",
  ]) {
    assert.ok(html.includes(needle), `invoice is missing ${needle}`);
  }
  assert.ok(html.startsWith("<!doctype html>"));
});

test("a paid invoice reads as a receipt, not a demand", () => {
  const html = renderInvoiceHtml(order({ invoicePaidAt: "2026-09-10" }), PARTY, TODAY);
  assert.ok(html.includes("Paid in full"));
  assert.ok(!html.includes("Balance due"));
});

test("invoice text is escaped, so a business name cannot inject markup", () => {
  const html = renderInvoiceHtml(order(), { ...PARTY, businessName: '<script>alert(1)</script>' }, TODAY);
  assert.ok(!html.includes("<script>alert(1)</script>"));
  assert.ok(html.includes("&lt;script&gt;"));
});

test("escapeHtml covers every character that could break out of markup", () => {
  assert.equal(escapeHtml(`<&">'`), "&lt;&amp;&quot;&gt;&#39;");
});

test("a statement totals the open invoices and shows the aging", () => {
  const html = renderStatementHtml(
    [order({ id: "a", totalCents: 10_000 }), order({ id: "b", totalCents: 15_000, invoicePaidAt: "2026-09-05" })],
    PARTY,
    { creditLimitCents: 100_000, termsLabel: "Net 15" },
    TODAY,
  );
  assert.ok(html.includes("Total due"));
  assert.ok(html.includes("$100.00"));
  assert.ok(html.includes("Net 15"));
  // The settled invoice is not listed as open.
  assert.ok(!html.includes("$150.00"));
});

test("a statement with nothing open says so plainly", () => {
  const html = renderStatementHtml([], PARTY, {}, TODAY);
  assert.ok(html.includes("Your account is settled in full"));
});

test("dates read as words, and unparseable values pass through untouched", () => {
  assert.equal(longDate("2026-09-16"), "September 16, 2026");
  assert.equal(longDate("2026-09-01 14:20:00"), "September 1, 2026");
  assert.equal(longDate(""), "");
  assert.equal(longDate(null), "");
});

test("a PO number accepts what buyers actually paste, and refuses the rest", () => {
  assert.equal(validatePoNumber(""), null);
  assert.equal(validatePoNumber("PO-99120"), null);
  assert.equal(validatePoNumber("4500/12 #7"), null);
  assert.equal(validatePoNumber("po_2026.09"), null);
  assert.match(String(validatePoNumber("PO<script>")), /letters, numbers/);
  assert.match(String(validatePoNumber("x".repeat(MAX_PO_NUMBER_LENGTH + 1))), /up to 40 characters/);
});

test("a PO number keeps its case and loses only stray whitespace", () => {
  assert.equal(normalizePoNumber("  PO-99120  "), "PO-99120");
  assert.equal(normalizePoNumber("PO   99120"), "PO 99120");
  assert.equal(normalizePoNumber("po-abc"), "po-abc");
  assert.equal(normalizePoNumber(undefined), "");
  assert.equal(normalizePoNumber("y".repeat(80)).length, MAX_PO_NUMBER_LENGTH);
});

test("the bakery's day starts at Central midnight, written the way SQLite writes it", () => {
  // 2026-09-20 02:00 UTC is still 2026-09-19 in Dallas (CDT, UTC-5).
  assert.equal(bakeryDayStartIso(new Date("2026-09-20T02:00:00Z")), "2026-09-19 05:00:00");
  // Mid-winter the offset is UTC-6.
  assert.equal(bakeryDayStartIso(new Date("2026-01-15T18:00:00Z")), "2026-01-15 06:00:00");
  assert.match(bakeryDayStartIso(new Date("2026-09-20T18:00:00Z")), /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
});

test("a campaign must have a subject and a body, and cannot shout", () => {
  assert.equal(validateCampaign({ subject: "New rye on Monday", body: "Details inside." }), null);
  assert.match(String(validateCampaign({ subject: "", body: "x" })), /subject line/);
  assert.match(String(validateCampaign({ subject: "Hello", body: "" })), /Write the message/);
  assert.match(String(validateCampaign({ subject: "BUY NOW TODAY", body: "x" })), /all-capitals/);
  // A short acronym is not shouting.
  assert.equal(validateCampaign({ subject: "New SKU", body: "x" }), null);
});

test("every campaign carries the postal address and a working unsubscribe link", () => {
  const footer = campaignFooter("https://dallasbakery.net/api/marketing/unsubscribe?token=abc");
  assert.ok(footer.includes(POSTAL_ADDRESS));
  assert.ok(footer.includes("Unsubscribe: https://dallasbakery.net/api/marketing/unsubscribe?token=abc"));
});

test("a composed campaign greets by business name and ends with the footer", () => {
  const text = composeCampaign(
    { subject: "New rye", body: "We're baking rye from Monday." },
    { businessName: "Halcyon Grocers" },
    "https://example.com/u?token=t",
  );
  assert.ok(text.startsWith("Hi Halcyon Grocers,"));
  assert.ok(text.includes("We're baking rye from Monday."));
  assert.ok(text.trimEnd().endsWith("(469) 729-4706 · sales@dallasbakery.com"));
});

test("a subscriber with no business name still gets a natural greeting", () => {
  assert.equal(greeting(""), "Hi there,");
  assert.equal(greeting("  "), "Hi there,");
  assert.equal(greeting("Halcyon"), "Hi Halcyon,");
});

test("a test send is unmistakable in the owner's inbox", () => {
  assert.equal(previewSubject("New rye"), "[Test] New rye");
});
