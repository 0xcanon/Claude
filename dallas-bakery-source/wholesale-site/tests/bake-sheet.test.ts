import assert from "node:assert/strict";
import test from "node:test";

import { bakeSheet, daySummary, needsBaking, type BakeableOrder } from "../app/bake-sheet.ts";

function order(over: Partial<BakeableOrder> = {}): BakeableOrder {
  return {
    status: "paid",
    itemsJson: JSON.stringify([{ sku: "WS-BARBARI-25", name: "Barbari", quantity: 2 }]),
    loafCount: 50,
    boxCount: 2,
    totalCents: 12_500,
    paymentTerms: "card",
    invoicePaidAt: null,
    invoiceDueAt: null,
    requestedDeliveryDate: null,
    ...over,
  };
}

/* ------------------------------------------------------- what to bake -- */

test("only orders that still owe bread are baked for", () => {
  for (const status of ["paid", "labeled"]) {
    assert.equal(needsBaking(status), true, status);
  }
  for (const status of ["held", "shipped", "delivered", "cancelled", "refunded"]) {
    assert.equal(needsBaking(status), false, status);
  }
});

test("a held order is not baked for", () => {
  // Baking for an order nobody is going to send is how a morning is wasted.
  const sheet = bakeSheet([order({ status: "held" })]);
  assert.deepEqual(sheet, []);
});

test("cases are totalled per bread, biggest first", () => {
  const sheet = bakeSheet([
    order({ itemsJson: JSON.stringify([{ sku: "A", name: "Barbari", quantity: 2 }]) }),
    order({ itemsJson: JSON.stringify([{ sku: "B", name: "Sesame", quantity: 5 }]) }),
    order({ itemsJson: JSON.stringify([{ sku: "A", name: "Barbari", quantity: 3 }]) }),
  ]);
  assert.deepEqual(sheet.map((l) => [l.sku, l.cases]), [["B", 5], ["A", 5]].sort((a, b) =>
    (b[1] as number) - (a[1] as number) || String(a[0]).localeCompare(String(b[0]))));
  assert.equal(sheet.reduce((n, l) => n + l.cases, 0), 10);
});

test("loaves come from the order's own case size, not a guess", () => {
  // 60 loaves across 4 cases is a 15-loaf case, not the usual 25.
  const [line] = bakeSheet([order({
    itemsJson: JSON.stringify([{ sku: "A", name: "Small case", quantity: 4 }]),
    loafCount: 60,
  })]);
  assert.equal(line?.loaves, 60);
});

test("a corrupt items payload is skipped rather than crashing the morning", () => {
  const sheet = bakeSheet([order({ itemsJson: "{not json" }), order()]);
  assert.equal(sheet.length, 1, "the good order still counts");
});

/* ---------------------------------------------------------- the day -- */

test("the queue drives what to bake and ship", () => {
  const open = [
    order(),
    order({ status: "labeled", boxCount: 3 }),
    order({ status: "held" }),
  ];
  const s = daySummary(open, open, "2026-08-31");
  assert.equal(s.toBake, 2, "paid and labeled owe bread");
  assert.equal(s.readyToShip, 1);
  assert.equal(s.onHold, 1);
  assert.equal(s.boxes, 5);
});

test("money owed is read from every order, not just the open queue", () => {
  // The bug this catches: an invoice on a delivered order is still owed, but
  // that order left the queue days ago.
  const open: BakeableOrder[] = [];
  const all = [order({ status: "delivered", paymentTerms: "account", totalCents: 19_500 })];
  const s = daySummary(open, all, "2026-08-31");
  assert.equal(s.owedCents, 19_500);
  assert.equal(s.toBake, 0);
});

test("a settled invoice is not owed, and a cancelled order is never owed", () => {
  const all = [
    order({ paymentTerms: "account", invoicePaidAt: "2026-08-30", totalCents: 5_000 }),
    order({ paymentTerms: "account", status: "cancelled", totalCents: 7_000 }),
    order({ paymentTerms: "card", totalCents: 9_000 }),
  ];
  assert.equal(daySummary([], all, "2026-08-31").owedCents, 0);
});

test("an invoice past its due date is counted as overdue", () => {
  const all = [
    order({ paymentTerms: "account", invoiceDueAt: "2026-08-01", totalCents: 5_000 }),
    order({ paymentTerms: "account", invoiceDueAt: "2026-09-29", totalCents: 5_000 }),
  ];
  const s = daySummary([], all, "2026-08-31");
  assert.equal(s.overdueInvoices, 1);
  assert.equal(s.owedCents, 10_000, "both are still owed");
});
