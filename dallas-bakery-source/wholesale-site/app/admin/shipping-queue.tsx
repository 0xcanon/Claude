"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";

type OrderItem = { sku: string; name: string; quantity: number; unitAmountCents: number };

type ShippingOrder = {
  id: string;
  channel: string;
  orderNumber: number;
  customerName: string;
  email: string;
  phone: string;
  street: string;
  street2: string;
  city: string;
  state: string;
  zip: string;
  items: OrderItem[];
  caseCount: number;
  loafCount: number;
  boxCount: number;
  subtotalCents: number;
  shippingCents: number;
  totalCents: number;
  status: string;
  paymentTerms: "card" | "account";
  invoicePaidAt: string | null;
  invoiceDueAt: string | null;
  trackingNumber: string;
  trackingUrl: string;
  labelError: string;
  hasLabel: boolean;
  createdAt: string;
  shippedAt: string | null;
  trackingEmailSentAt: string | null;
};

type UpsState = { connected: boolean; environment: string };

function money(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

/** "ON ACCOUNT · due Sep 12", "ON ACCOUNT · OVERDUE", or "Invoice paid". */
function invoiceTag(order: { invoicePaidAt: string | null; invoiceDueAt: string | null }) {
  if (order.invoicePaidAt) return { text: "Invoice paid", overdue: false };
  if (!order.invoiceDueAt) return { text: "ON ACCOUNT", overdue: false };
  const due = new Date(`${order.invoiceDueAt}T23:59:59`);
  if (!Number.isNaN(due.getTime()) && due.getTime() < Date.now()) {
    return { text: `ON ACCOUNT · OVERDUE (was due ${order.invoiceDueAt})`, overdue: true };
  }
  return { text: `ON ACCOUNT · due ${order.invoiceDueAt}`, overdue: false };
}

/** The same words the buyer sees, so the owner and the buyer agree. */
function statusLabel(status: string) {
  if (status === "shipped") return "Shipped";
  if (status === "labeled") return "Packed · label bought";
  if (status === "refunded") return "Refunded";
  return "Baking";
}

export function ShippingQueue() {
  const [orders, setOrders] = useState<ShippingOrder[]>([]);
  const [ups, setUps] = useState<UpsState>({ connected: false, environment: "test" });
  const [weekly, setWeekly] = useState<{ week: string; orders: number; loaves: number; revenueCents: number }[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [scope, setScope] = useState<"unshipped" | "today" | "all">("unshipped");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async (which: typeof scope) => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/orders?scope=${which}`, { cache: "no-store" });
      if (!response.ok) throw new Error("Orders could not be loaded.");
      const data = await response.json();
      setOrders(data.orders || []);
      setUps(data.ups || { connected: false, environment: "test" });
      setWeekly(data.weekly || []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Orders could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  // load awaits the orders request before it sets anything.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(scope); }, [load, scope]);

  const selectable = useMemo(() => orders.filter((order) => order.status !== "shipped"), [orders]);

  /** What the bench needs at a glance: how much bread, how many boxes, what it earned. */
  const totals = useMemo(() => orders.reduce((sum, order) => ({
    orders: sum.orders + 1,
    cases: sum.cases + (order.caseCount || 0),
    boxes: sum.boxes + (order.boxCount || 0),
    revenueCents: sum.revenueCents + (order.totalCents || 0),
    unshipped: sum.unshipped + (order.status === "shipped" ? 0 : 1),
  }), { orders: 0, cases: 0, boxes: 0, revenueCents: 0, unshipped: 0 }), [orders]);

  const [openOrder, setOpenOrder] = useState("");

  /**
   * The bake sheet: how many cases of each bread the unshipped orders in view
   * need. This — not the order list — is what the person at the oven reads.
   */
  const bakeSheet = useMemo(() => {
    const bySku = new Map<string, { name: string; cases: number; loaves: number }>();
    for (const order of orders) {
      if (order.status === "shipped" || order.status === "refunded") continue;
      const perCase = order.caseCount ? Math.round(order.loafCount / order.caseCount) : 25;
      for (const item of order.items) {
        const entry = bySku.get(item.sku) || { name: item.name, cases: 0, loaves: 0 };
        entry.cases += item.quantity;
        entry.loaves += item.quantity * perCase;
        bySku.set(item.sku, entry);
      }
    }
    return [...bySku.values()].sort((a, b) => b.cases - a.cases);
  }, [orders]);
  const allSelected = selectable.length > 0 && selectable.every((order) => selected.has(order.id));

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(selectable.map((order) => order.id)));
  }

  async function refund(order: ShippingOrder) {
    const onAccount = order.paymentTerms === "account";
    const sure = window.confirm(
      onAccount
        ? `Cancel order #${order.orderNumber} — ${money(order.totalCents)} on account for ${order.customerName || order.email}?\n\nNothing was charged; cancelling releases the amount back to their credit line and the order leaves the shipping queue.`
        : `Refund order #${order.orderNumber} — ${money(order.totalCents)} back to ${order.customerName || order.email}?\n\nThis cannot be undone, and the order leaves the shipping queue.`,
    );
    if (!sure) return;
    setBusy("refund");
    setMessage("");
    setError("");
    try {
      const response = await fetch("/api/admin/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "refund", ids: [order.id] }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "The refund did not complete.");
      setMessage(data.onAccount
        ? `Order #${data.orderNumber} cancelled — the amount is back on the buyer's credit line.`
        : `Order #${data.orderNumber} refunded in full.`);
      setOpenOrder("");
      await load(scope);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The refund did not complete.");
    } finally {
      setBusy("");
    }
  }

  async function markInvoicePaid(order: ShippingOrder) {
    const sure = window.confirm(
      `Mark invoice for order #${order.orderNumber} — ${money(order.totalCents)} from ${order.customerName || order.email} — as paid?\n\nThat amount goes back to their available credit.`,
    );
    if (!sure) return;
    setBusy("invoice-paid");
    setMessage("");
    setError("");
    try {
      const response = await fetch("/api/admin/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "mark-invoice-paid", ids: [order.id] }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "The invoice could not be marked paid.");
      setMessage(`Invoice for order #${data.orderNumber} marked paid — credit released.`);
      await load(scope);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The invoice could not be marked paid.");
    } finally {
      setBusy("");
    }
  }

  async function act(action: "create-labels" | "label-all" | "mark-shipped") {
    setBusy(action);
    setMessage("");
    setError("");
    try {
      const response = await fetch("/api/admin/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ids: [...selected] }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "That action did not complete.");

      if (action === "mark-shipped") {
        setMessage(`${data.shipped} order${data.shipped === 1 ? "" : "s"} marked shipped. Tracking emails sent.`);
        setSelected(new Set());
      } else {
        const results: { ok: boolean; orderNumber: number; error?: string }[] = data.results || [];
        const failed = results.filter((result) => !result.ok);
        const made = results.length - failed.length;
        setMessage(
          data.message ||
          `${made} label${made === 1 ? "" : "s"} created.` +
          (failed.length ? ` ${failed.length} could not be created — see the rows below.` : ""),
        );
      }
      await load(scope);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "That action did not complete.");
    } finally {
      setBusy("");
    }
  }

  async function download() {
    setBusy("download");
    setError("");
    try {
      const response = await fetch("/api/admin/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "download", ids: [...selected] }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Labels could not be downloaded.");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `dallas-bakery-labels-${new Date().toISOString().slice(0, 10)}.zpl`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setMessage("Label file downloaded — send it to the thermal printer.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Labels could not be downloaded.");
    } finally {
      setBusy("");
    }
  }

  const labeledSelected = [...selected].filter(
    (id) => orders.find((order) => order.id === id)?.hasLabel,
  ).length;

  return (
    <section className="admin-panel" aria-labelledby="shipping-queue-title">
      <div className="admin-panel-head">
        <h2 id="shipping-queue-title">Shipping queue</h2>
        {!ups.connected && (
          <p className="admin-inline-warning">
            UPS is not connected — add the UPS credentials before printing labels.
          </p>
        )}
        {ups.connected && ups.environment === "test" && (
          <p className="admin-inline-warning">
            UPS is in test mode. Labels created now are not real shipments.
          </p>
        )}
      </div>

      <div className="admin-filters" aria-label="Filter orders">
        {(["unshipped", "today", "all"] as const).map((option) => (
          <button
            key={option}
            type="button"
            className={scope === option ? "active" : ""}
            onClick={() => { setScope(option); setSelected(new Set()); }}
          >
            {option === "unshipped" ? "Needs shipping" : option === "today" ? "Today" : "All"}
          </button>
        ))}
      </div>

      <div className="admin-queue-actions">
        <button type="button" disabled={!selected.size || !!busy} onClick={() => act("create-labels")}>
          {busy === "create-labels" ? "Creating…" : `Create labels (${selected.size})`}
        </button>
        <button type="button" disabled={!!busy} onClick={() => act("label-all")}>
          {busy === "label-all" ? "Creating…" : "Label everything from today"}
        </button>
        <button type="button" disabled={!labeledSelected || !!busy} onClick={download}>
          {busy === "download" ? "Preparing…" : `Print ${labeledSelected || ""} label${labeledSelected === 1 ? "" : "s"}`}
        </button>
        <button type="button" disabled={!selected.size || !!busy} onClick={() => act("mark-shipped")}>
          {busy === "mark-shipped" ? "Saving…" : "Mark shipped + email tracking"}
        </button>
        <a className="admin-csv-link" href={`/api/admin/orders?scope=${scope}&format=csv`} download>
          Download CSV
        </a>
      </div>

      {message && <p className="admin-shipping-feedback success" role="status">{message}</p>}
      {error && <p className="admin-shipping-feedback error" role="alert">{error}</p>}

      {!loading && bakeSheet.length > 0 && (
        <div className="admin-bake-sheet" id="bake-sheet">
          <div className="admin-bake-head">
            <h3>Bake sheet</h3>
            <span>Everything unshipped in this view</span>
            <button type="button" className="admin-bake-print" onClick={() => window.print()}>
              Print bake sheet
            </button>
          </div>
          <ul>
            {bakeSheet.map((entry) => (
              <li key={entry.name}>
                <strong>{entry.cases}</strong>
                <span>case{entry.cases === 1 ? "" : "s"}</span>
                <em>{entry.name.replace(/ — Case of \d+$/, "")}</em>
                <small>{entry.loaves} loaves</small>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!loading && orders.length > 0 && (
        <div className="admin-order-totals">
          <div><strong>{totals.orders}</strong><span>Orders</span></div>
          <div><strong>{totals.cases}</strong><span>Cases</span></div>
          <div><strong>{totals.boxes}</strong><span>Boxes to ship</span></div>
          <div><strong>{money(totals.revenueCents)}</strong><span>Order value</span></div>
          <div className={totals.unshipped ? "needs-action" : ""}>
            <strong>{totals.unshipped}</strong><span>Still to ship</span>
          </div>
        </div>
      )}

      {loading ? (
        <p className="admin-empty-note">Loading orders…</p>
      ) : !orders.length ? (
        <div className="admin-empty">
          <h2>Nothing to ship.</h2>
          <p>Paid orders from both stores land here automatically.</p>
        </div>
      ) : (
        <div className="admin-orders-table-wrap">
        <table className="admin-orders-table">
          <thead>
            <tr>
              <th scope="col">
                <label className="admin-check">
                  <input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Select all orders" />
                </label>
              </th>
              <th scope="col">Order</th>
              <th scope="col">Customer</th>
              <th scope="col">Destination</th>
              <th scope="col">Ordered</th>
              <th scope="col">Boxes</th>
              <th scope="col">Total</th>
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <Fragment key={order.id}>
              <tr className={order.labelError ? "has-error" : ""}>
                <td className="admin-orders-select">
                  <label className="admin-check">
                    <input
                      type="checkbox"
                      checked={selected.has(order.id)}
                      disabled={order.status === "shipped"}
                      onChange={() => toggle(order.id)}
                      aria-label={`Select order ${order.orderNumber}`}
                    />
                  </label>
                </td>
                <td data-label="Order">
                  <strong>#{order.orderNumber}</strong>
                  <small className={`admin-channel channel-${order.channel}`}>{order.channel}</small>
                </td>
                <td data-label="Customer">
                  {order.customerName || "—"}
                  <small>{order.email}</small>
                </td>
                <td data-label="Destination">{[order.city, order.state].filter(Boolean).join(", ")} {order.zip}</td>
                <td data-label="Ordered">
                  {order.caseCount ? <strong>{order.caseCount} case{order.caseCount === 1 ? "" : "s"}</strong> : "—"}
                  <button
                    type="button"
                    className="admin-row-toggle"
                    aria-expanded={openOrder === order.id}
                    onClick={() => setOpenOrder(openOrder === order.id ? "" : order.id)}
                  >
                    {openOrder === order.id ? "Hide items" : "What was ordered"}
                  </button>
                </td>
                <td data-label="Boxes">{order.boxCount}{order.loafCount ? <small>{order.loafCount} loaves</small> : null}</td>
                <td data-label="Total">
                  {money(order.totalCents)}
                  {order.paymentTerms === "account" && (() => {
                    const tag = invoiceTag(order);
                    return (
                      <small className={`admin-terms ${order.invoicePaidAt ? "settled" : tag.overdue ? "overdue" : "open"}`}>
                        {tag.text}
                      </small>
                    );
                  })()}
                </td>
                <td data-label="Status">
                  <span className={`admin-status status-${order.status}`}>{statusLabel(order.status)}</span>
                  {order.trackingNumber && (
                    order.trackingUrl
                      ? <a className="admin-tracking" href={order.trackingUrl} target="_blank" rel="noreferrer">{order.trackingNumber}</a>
                      : <small className="admin-tracking">{order.trackingNumber}</small>
                  )}
                  {order.trackingEmailSentAt && <small className="admin-emailed">Tracking emailed</small>}
                  {order.labelError && <small className="admin-label-error">{order.labelError}</small>}
                </td>
              </tr>
              {openOrder === order.id && (
                <tr className="admin-order-detail-row">
                  <td colSpan={8}>
                    <div className="admin-order-detail">
                      <div>
                        <h4>Pack this order</h4>
                        <ul>
                          {order.items.length ? order.items.map((item) => (
                            <li key={item.sku}>
                              <strong>{item.quantity} ×</strong> {item.name}
                              <small>{money(item.unitAmountCents)} a case</small>
                            </li>
                          )) : <li>No line items recorded.</li>}
                        </ul>
                      </div>
                      <div>
                        <h4>Ship to</h4>
                        <p className="admin-order-address">
                          {order.customerName}<br />
                          {[order.street, order.street2].filter(Boolean).join(", ")}<br />
                          {[order.city, order.state, order.zip].filter(Boolean).join(" ")}
                          {order.phone ? <><br />{order.phone}</> : null}
                        </p>
                      </div>
                      <div>
                        <h4>Money</h4>
                        <p className="admin-order-money">
                          <span>Subtotal</span><span>{money(order.subtotalCents)}</span>
                          <span>Shipping · {order.boxCount} box{order.boxCount === 1 ? "" : "es"}</span><span>{money(order.shippingCents)}</span>
                          <strong>{order.paymentTerms === "account" ? (order.invoicePaidAt ? "Invoiced · paid" : order.invoiceDueAt ? `To invoice · due ${order.invoiceDueAt}` : "To invoice") : "Charged"}</strong><strong>{money(order.totalCents)}</strong>
                        </p>
                        {order.paymentTerms === "account" && !order.invoicePaidAt && order.status !== "refunded" && (
                          <button
                            type="button"
                            className="admin-invoice-paid"
                            disabled={busy === "invoice-paid"}
                            onClick={() => void markInvoicePaid(order)}
                          >
                            {busy === "invoice-paid" ? "Saving…" : "Mark invoice paid"}
                          </button>
                        )}
                        {order.status !== "shipped" && order.status !== "refunded" && (
                          <button
                            type="button"
                            className="admin-refund"
                            disabled={busy === "refund"}
                            onClick={() => void refund(order)}
                          >
                            {busy === "refund"
                              ? (order.paymentTerms === "account" ? "Cancelling…" : "Refunding…")
                              : (order.paymentTerms === "account" ? "Cancel order" : `Refund ${money(order.totalCents)}`)}
                          </button>
                        )}
                      </div>
                    </div>
                  </td>
                </tr>
              )}
              </Fragment>
            ))}
          </tbody>
        </table>
        </div>
      )}

      {weekly.length > 0 && (
        <div className="admin-weekly">
          <h3>Last {weekly.length} week{weekly.length === 1 ? "" : "s"}</h3>
          <table>
            <thead>
              <tr><th scope="col">Week</th><th scope="col">Orders</th><th scope="col">Loaves</th><th scope="col">Revenue</th></tr>
            </thead>
            <tbody>
              {weekly.map((row) => (
                <tr key={row.week}>
                  <td>{row.week}</td>
                  <td>{row.orders}</td>
                  <td>{row.loaves}</td>
                  <td>{money(row.revenueCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
