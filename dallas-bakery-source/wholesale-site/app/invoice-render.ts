/**
 * Invoices and account statements, rendered as printable documents.
 *
 * A wholesale buyer's bookkeeper needs a piece of paper: an invoice number,
 * a PO reference, terms, a due date, and a balance. This module produces
 * that document as a self-contained HTML page with a print stylesheet — the
 * buyer opens it and prints to PDF, which is what they were going to do with
 * a PDF anyway. No PDF library ships to the Worker, and nothing here can
 * fail at runtime the way a binary generator can.
 *
 * No database import, so the layout and the money arithmetic stay unit-
 * testable, and the same renderer serves the buyer portal and the admin.
 */

import { SHELF_LIFE_DAYS } from "./order-rules.ts";

export const REMIT_TO = {
  name: "Dallas Bakery",
  street: "2643 Manana Dr",
  city: "Dallas",
  state: "TX",
  zip: "75220",
  phone: "(469) 729-4706",
  email: "sales@dallasbakery.com",
};

export type InvoiceParty = {
  businessName: string;
  contactName: string;
  email: string;
  phone: string;
  street: string;
  street2: string;
  city: string;
  state: string;
  zip: string;
};

export type InvoiceLine = {
  sku: string;
  name: string;
  /** Cases on this line. */
  quantity: number;
  /** Price of one case, in cents. */
  unitAmountCents: number;
};

export type InvoiceOrder = {
  id: string;
  orderNumber: number;
  placedAt: string;
  items: InvoiceLine[];
  caseCount: number;
  loafCount: number;
  subtotalCents: number;
  shippingCents: number;
  totalCents: number;
  paymentTerms: string;
  invoiceDueAt: string | null;
  invoicePaidAt: string | null;
  poNumber: string;
  requestedDeliveryDate: string | null;
  trackingNumber: string;
  status: string;
  shipTo: {
    name: string;
    street: string;
    street2: string;
    city: string;
    state: string;
    zip: string;
  };
};

/** Escapes text for HTML. Every value below goes through it. */
export function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function money(cents: number) {
  const value = Math.round(Number(cents) || 0);
  const sign = value < 0 ? "-" : "";
  return `${sign}$${(Math.abs(value) / 100).toFixed(2)}`;
}

/** "August 30, 2026" from either a date or a SQLite timestamp. */
export function longDate(value: string | null | undefined) {
  const text = String(value || "").trim();
  if (!text) return "";
  const iso = text.includes("T") ? text : `${text.replace(" ", "T")}${text.length <= 10 ? "T12:00:00" : ""}Z`;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return text;
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

/** Whole days between two dates; negative when the first is earlier. */
function daysBetween(fromIso: string, toIso: string) {
  const from = new Date(`${fromIso.slice(0, 10)}T00:00:00Z`).getTime();
  const to = new Date(`${toIso.slice(0, 10)}T00:00:00Z`).getTime();
  if (Number.isNaN(from) || Number.isNaN(to)) return 0;
  return Math.round((to - from) / 86_400_000);
}

/** The document's own invoice number: order 1042 bills as DB-1042. */
export function invoiceNumber(orderNumber: number) {
  return `DB-${orderNumber}`;
}

export type InvoiceStanding = {
  label: string;
  /** "paid" | "due" | "overdue" | "card" */
  tone: "paid" | "due" | "overdue" | "card";
  balanceCents: number;
};

/**
 * What this invoice actually owes today. Card orders were paid at checkout,
 * so their balance is zero and the document reads as a receipt.
 */
export function invoiceStanding(order: InvoiceOrder, today = new Date()): InvoiceStanding {
  const asOf = today.toISOString().slice(0, 10);
  if (order.paymentTerms !== "account") {
    return { label: "Paid by card", tone: "card", balanceCents: 0 };
  }
  if (order.invoicePaidAt) {
    return { label: `Paid ${longDate(order.invoicePaidAt)}`, tone: "paid", balanceCents: 0 };
  }
  const due = order.invoiceDueAt || "";
  if (due && daysBetween(due, asOf) > 0) {
    const late = daysBetween(due, asOf);
    return {
      label: `Past due — ${late} day${late === 1 ? "" : "s"} overdue`,
      tone: "overdue",
      balanceCents: order.totalCents,
    };
  }
  return {
    label: due ? `Due ${longDate(due)}` : "Due on receipt",
    tone: "due",
    balanceCents: order.totalCents,
  };
}

const DOCUMENT_CSS = `
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 32px 28px 56px;
    background: #f4f4f2;
    color: #1a1714;
    font: 15px/1.55 "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif;
  }
  .sheet {
    max-width: 760px;
    margin: 0 auto;
    background: #fff;
    padding: 44px 46px 52px;
    border: 1px solid #e2ded6;
    border-radius: 4px;
  }
  header { display: flex; justify-content: space-between; gap: 28px; align-items: flex-start; }
  .mark { font-size: 21px; font-weight: 700; letter-spacing: 0.01em; margin: 0 0 4px; }
  .mark span { display: block; font-size: 11px; font-weight: 600; letter-spacing: 0.16em;
    text-transform: uppercase; color: #8a7f70; margin-top: 5px; }
  .from { font-size: 13px; color: #4d463d; line-height: 1.5; }
  .doc { text-align: right; }
  .doc h1 { margin: 0 0 6px; font-size: 25px; letter-spacing: 0.04em; text-transform: uppercase; }
  .doc dl { margin: 0; font-size: 13px; }
  .doc dl div { display: flex; gap: 12px; justify-content: flex-end; }
  .doc dt { color: #8a7f70; }
  .doc dd { margin: 0; font-variant-numeric: tabular-nums; font-weight: 600; }
  .status { display: inline-block; margin-top: 10px; padding: 4px 11px; border-radius: 999px;
    font-family: system-ui, sans-serif; font-size: 11px; font-weight: 700;
    letter-spacing: 0.08em; text-transform: uppercase; }
  .status.paid, .status.card { background: #e7f0e4; color: #2f5427; }
  .status.due { background: #f2eddf; color: #6b5820; }
  .status.overdue { background: #f6e2df; color: #8c2f22; }
  .rule { height: 1px; background: #e2ded6; margin: 26px 0; }
  .parties { display: flex; gap: 40px; flex-wrap: wrap; }
  .parties section { flex: 1 1 220px; }
  h2 { font-family: system-ui, sans-serif; font-size: 11px; font-weight: 700;
    letter-spacing: 0.14em; text-transform: uppercase; color: #8a7f70; margin: 0 0 7px; }
  .parties p { margin: 0; font-size: 14px; line-height: 1.5; }
  .parties strong { display: block; font-size: 15px; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 14px; }
  th { font-family: system-ui, sans-serif; font-size: 11px; font-weight: 700;
    letter-spacing: 0.1em; text-transform: uppercase; color: #8a7f70;
    text-align: left; padding: 0 0 8px; border-bottom: 1px solid #d8d2c8; }
  td { padding: 11px 0; border-bottom: 1px solid #efece6; vertical-align: top; }
  th.num, td.num { text-align: right; font-variant-numeric: tabular-nums; }
  .sku { display: block; font-family: ui-monospace, "SF Mono", Menlo, monospace;
    font-size: 11px; color: #8a7f70; letter-spacing: 0.03em; margin-top: 2px; }
  .totals { margin-left: auto; margin-top: 18px; width: 290px; font-size: 14px; }
  .totals div { display: flex; justify-content: space-between; padding: 6px 0; }
  .totals .grand { border-top: 2px solid #1a1714; margin-top: 6px; padding-top: 10px;
    font-size: 17px; font-weight: 700; }
  .totals span:last-child { font-variant-numeric: tabular-nums; }
  .note { margin-top: 30px; padding: 16px 18px; background: #faf8f4;
    border-left: 3px solid #c9bda8; font-size: 13px; line-height: 1.55; }
  .note strong { display: block; margin-bottom: 3px; }
  footer { margin-top: 26px; font-size: 12px; color: #8a7f70; line-height: 1.6; }
  .actions { max-width: 760px; margin: 0 auto 18px; text-align: right;
    font-family: system-ui, sans-serif; }
  .actions button { font: inherit; font-size: 13px; font-weight: 600; cursor: pointer;
    padding: 8px 18px; border-radius: 6px; border: 1px solid #1a1714;
    background: #1a1714; color: #fff; }
  .aging { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 8px; }
  .aging div { flex: 1 1 120px; padding: 12px 14px; background: #faf8f4;
    border: 1px solid #eae5dc; border-radius: 4px; }
  .aging dt { font-family: system-ui, sans-serif; font-size: 10px; font-weight: 700;
    letter-spacing: 0.1em; text-transform: uppercase; color: #8a7f70; }
  .aging dd { margin: 4px 0 0; font-size: 18px; font-variant-numeric: tabular-nums; font-weight: 700; }
  .aging div.hot dd { color: #8c2f22; }
  tr.overdue td { background: #fdf6f4; }
  @media print {
    body { background: #fff; padding: 0; }
    .sheet { border: 0; border-radius: 0; padding: 0; max-width: none; }
    .actions { display: none; }
  }
`;

function page(title: string, body: string) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>${DOCUMENT_CSS}</style>
</head>
<body>
<div class="actions"><button type="button" onclick="window.print()">Print or save as PDF</button></div>
<div class="sheet">
${body}
</div>
</body>
</html>`;
}

function addressBlock(lines: Array<string | undefined>) {
  return lines
    .map((line) => String(line || "").trim())
    .filter(Boolean)
    .map((line) => escapeHtml(line))
    .join("<br>");
}

function letterhead() {
  return `<div class="mark">Dallas Bakery<span>Wholesale</span></div>
    <p class="from">${addressBlock([
      REMIT_TO.street,
      `${REMIT_TO.city}, ${REMIT_TO.state} ${REMIT_TO.zip}`,
      REMIT_TO.phone,
      REMIT_TO.email,
    ])}</p>`;
}

/** The invoice for one order, ready to print. */
export function renderInvoiceHtml(
  order: InvoiceOrder,
  party: InvoiceParty,
  today = new Date(),
): string {
  const standing = invoiceStanding(order, today);
  const number = invoiceNumber(order.orderNumber);
  const termsLabel = order.paymentTerms === "account"
    ? order.invoiceDueAt ? `Net — due ${longDate(order.invoiceDueAt)}` : "Net"
    : "Paid by card at checkout";

  const rows = order.items.map((item) => {
    const lineTotal = item.unitAmountCents * item.quantity;
    return `<tr>
      <td>${escapeHtml(item.name)}<span class="sku">${escapeHtml(item.sku)}</span></td>
      <td class="num">${item.quantity}</td>
      <td class="num">${money(item.unitAmountCents)}</td>
      <td class="num">${money(lineTotal)}</td>
    </tr>`;
  }).join("\n");

  const facts: Array<[string, string]> = [
    ["Invoice", number],
    ["Date", longDate(order.placedAt)],
  ];
  if (order.poNumber) facts.push(["PO number", order.poNumber]);
  if (order.paymentTerms === "account" && order.invoiceDueAt) {
    facts.push(["Due", longDate(order.invoiceDueAt)]);
  }
  if (order.requestedDeliveryDate) {
    facts.push(["Requested delivery", longDate(order.requestedDeliveryDate)]);
  }
  if (order.trackingNumber) facts.push(["UPS tracking", order.trackingNumber]);

  const payNote = standing.balanceCents > 0
    ? `<div class="note"><strong>How to pay</strong>
        Pay by card in your account at dallasbakery.com, or send a check to ${escapeHtml(REMIT_TO.name)},
        ${escapeHtml(REMIT_TO.street)}, ${escapeHtml(REMIT_TO.city)}, ${escapeHtml(REMIT_TO.state)}
        ${escapeHtml(REMIT_TO.zip)}. Reference invoice ${escapeHtml(number)}.
        Questions: ${escapeHtml(REMIT_TO.phone)} or ${escapeHtml(REMIT_TO.email)}.</div>`
    : `<div class="note"><strong>Paid in full</strong>
        Nothing is owed on this invoice. Keep it for your records.</div>`;

  const body = `<header>
  <div>${letterhead()}</div>
  <div class="doc">
    <h1>Invoice</h1>
    <dl>${facts.map(([label, value]) =>
      `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join("")}</dl>
    <div class="status ${standing.tone}">${escapeHtml(standing.label)}</div>
  </div>
</header>

<div class="rule"></div>

<div class="parties">
  <section>
    <h2>Bill to</h2>
    <p><strong>${escapeHtml(party.businessName)}</strong>${addressBlock([
      party.contactName,
      party.street,
      party.street2,
      `${party.city}, ${party.state} ${party.zip}`,
      party.email,
    ])}</p>
  </section>
  <section>
    <h2>Ship to</h2>
    <p><strong>${escapeHtml(order.shipTo.name || party.businessName)}</strong>${addressBlock([
      order.shipTo.street,
      order.shipTo.street2,
      `${order.shipTo.city}, ${order.shipTo.state} ${order.shipTo.zip}`,
    ])}</p>
  </section>
  <section>
    <h2>Terms</h2>
    <p>${escapeHtml(termsLabel)}</p>
  </section>
</div>

<div class="rule"></div>

<table>
  <thead><tr>
    <th>Item</th><th class="num">Cases</th><th class="num">Per case</th><th class="num">Amount</th>
  </tr></thead>
  <tbody>
${rows}
  </tbody>
</table>

<div class="totals">
  <div><span>Subtotal</span><span>${money(order.subtotalCents)}</span></div>
  <div><span>Shipping (${order.caseCount} box${order.caseCount === 1 ? "" : "es"}, UPS Ground)</span><span>${money(order.shippingCents)}</span></div>
  <div class="grand"><span>${standing.balanceCents > 0 ? "Balance due" : "Total"}</span><span>${money(order.totalCents)}</span></div>
</div>

${payNote}

<footer>
  ${order.caseCount} case${order.caseCount === 1 ? "" : "s"} · ${order.loafCount} loaves ·
  Shelf life ${SHELF_LIFE_DAYS} days at room temperature.<br>
  Dallas Bakery · ${escapeHtml(REMIT_TO.phone)} · ${escapeHtml(REMIT_TO.email)}
</footer>`;

  return page(`Invoice ${number} — Dallas Bakery`, body);
}

export type AgingBuckets = {
  currentCents: number;
  days1to30Cents: number;
  days31to60Cents: number;
  days61PlusCents: number;
  totalCents: number;
};

/**
 * Sorts open invoices into the four buckets every accounts-payable department
 * recognises. Only unpaid account orders carry a balance; card orders were
 * settled at checkout.
 */
export function ageOpenInvoices(orders: InvoiceOrder[], today = new Date()): AgingBuckets {
  const asOf = today.toISOString().slice(0, 10);
  const buckets: AgingBuckets = {
    currentCents: 0,
    days1to30Cents: 0,
    days31to60Cents: 0,
    days61PlusCents: 0,
    totalCents: 0,
  };
  for (const order of orders) {
    if (order.paymentTerms !== "account" || order.invoicePaidAt) continue;
    const amount = order.totalCents;
    buckets.totalCents += amount;
    const late = order.invoiceDueAt ? daysBetween(order.invoiceDueAt, asOf) : 0;
    if (late <= 0) buckets.currentCents += amount;
    else if (late <= 30) buckets.days1to30Cents += amount;
    else if (late <= 60) buckets.days31to60Cents += amount;
    else buckets.days61PlusCents += amount;
  }
  return buckets;
}

/**
 * The account statement: every open invoice, aged, with a total owed. This is
 * the document a buyer's bookkeeper asks for at month end.
 */
export function renderStatementHtml(
  orders: InvoiceOrder[],
  party: InvoiceParty,
  options: { creditLimitCents?: number; termsLabel?: string } = {},
  today = new Date(),
): string {
  const asOf = today.toISOString().slice(0, 10);
  const open = orders
    .filter((order) => order.paymentTerms === "account" && !order.invoicePaidAt)
    .sort((a, b) => String(a.invoiceDueAt || "").localeCompare(String(b.invoiceDueAt || "")));
  const aging = ageOpenInvoices(orders, today);

  const rows = open.length
    ? open.map((order) => {
        const standing = invoiceStanding(order, today);
        return `<tr class="${standing.tone === "overdue" ? "overdue" : ""}">
          <td>${escapeHtml(invoiceNumber(order.orderNumber))}${
            order.poNumber ? `<span class="sku">PO ${escapeHtml(order.poNumber)}</span>` : ""
          }</td>
          <td>${escapeHtml(longDate(order.placedAt))}</td>
          <td>${escapeHtml(order.invoiceDueAt ? longDate(order.invoiceDueAt) : "On receipt")}</td>
          <td>${escapeHtml(standing.tone === "overdue" ? standing.label : "Open")}</td>
          <td class="num">${money(order.totalCents)}</td>
        </tr>`;
      }).join("\n")
    : `<tr><td colspan="5" style="padding:22px 0;color:#8a7f70">
        No open invoices. Your account is settled in full.</td></tr>`;

  const buckets: Array<[string, number, boolean]> = [
    ["Current", aging.currentCents, false],
    ["1–30 days", aging.days1to30Cents, aging.days1to30Cents > 0],
    ["31–60 days", aging.days31to60Cents, aging.days31to60Cents > 0],
    ["61+ days", aging.days61PlusCents, aging.days61PlusCents > 0],
  ];

  const limit = Number(options.creditLimitCents || 0);
  const creditLine = limit > 0
    ? `<div class="note"><strong>Your account</strong>
        ${escapeHtml(options.termsLabel || "Net terms")} · limit ${money(limit)} ·
        ${money(Math.max(0, limit - aging.totalCents))} available today.</div>`
    : "";

  const body = `<header>
  <div>${letterhead()}</div>
  <div class="doc">
    <h1>Statement</h1>
    <dl>
      <div><dt>As of</dt><dd>${escapeHtml(longDate(asOf))}</dd></div>
      <div><dt>Account</dt><dd>${escapeHtml(party.businessName)}</dd></div>
      <div><dt>Open invoices</dt><dd>${open.length}</dd></div>
    </dl>
  </div>
</header>

<div class="rule"></div>

<div class="parties">
  <section>
    <h2>Account</h2>
    <p><strong>${escapeHtml(party.businessName)}</strong>${addressBlock([
      party.contactName,
      party.street,
      party.street2,
      `${party.city}, ${party.state} ${party.zip}`,
      party.email,
    ])}</p>
  </section>
  <section>
    <h2>Balance owed</h2>
    <p style="font-size:26px;font-weight:700;font-variant-numeric:tabular-nums">${money(aging.totalCents)}</p>
  </section>
</div>

<div class="rule"></div>

<h2>Aging</h2>
<dl class="aging">
${buckets.map(([label, cents, hot]) =>
  `<div${hot ? ' class="hot"' : ""}><dt>${escapeHtml(label)}</dt><dd>${money(cents)}</dd></div>`).join("\n")}
</dl>

<div class="rule"></div>

<h2>Open invoices</h2>
<table>
  <thead><tr>
    <th>Invoice</th><th>Placed</th><th>Due</th><th>Status</th><th class="num">Amount</th>
  </tr></thead>
  <tbody>
${rows}
  </tbody>
</table>

<div class="totals">
  <div class="grand"><span>Total due</span><span>${money(aging.totalCents)}</span></div>
</div>

${creditLine}

<div class="note"><strong>How to pay</strong>
  Pay by card in your account at dallasbakery.com, or send a check to ${escapeHtml(REMIT_TO.name)},
  ${escapeHtml(REMIT_TO.street)}, ${escapeHtml(REMIT_TO.city)}, ${escapeHtml(REMIT_TO.state)}
  ${escapeHtml(REMIT_TO.zip)}. Questions: ${escapeHtml(REMIT_TO.phone)} or ${escapeHtml(REMIT_TO.email)}.</div>

<footer>Dallas Bakery · ${escapeHtml(REMIT_TO.phone)} · ${escapeHtml(REMIT_TO.email)}</footer>`;

  return page(`Statement — ${party.businessName}`, body);
}
