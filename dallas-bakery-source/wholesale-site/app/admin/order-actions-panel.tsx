"use client";

/**
 * What the owner does when an order goes wrong.
 *
 * One panel inside the order's row, because that is where the question comes
 * up: the shop is on the phone about order #1042 and the answer is either
 * "we'll hold it", "we'll fix the address", "we'll send back half", or "we'll
 * cancel it". Making those four separate screens would guarantee that the
 * person on the phone uses none of them.
 *
 * Every button asks for a reason first. The reason is not paperwork: it is
 * what appears in the order's history and, for a cancellation, in the line
 * the buyer reads.
 */

import { useCallback, useEffect, useState } from "react";

export type LifecycleOrder = {
  id: string;
  orderNumber: number;
  customerName: string;
  email: string;
  status: string;
  totalCents: number;
  refundedCents: number;
  paymentTerms: "card" | "account";
  holdReason: string;
  cancelRequestedAt: string | null;
  cancelReason: string;
  street: string;
  street2: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
  poNumber: string;
  requestedDeliveryDate: string | null;
};

type HistoryEntry = {
  id: string;
  kind: string;
  summary: string;
  detail: string;
  who: string;
  amountCents: number;
  buyerVisible: boolean;
  at: string;
};

function money(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function when(iso: string) {
  const at = new Date(iso.includes("T") ? iso : `${iso.replace(" ", "T")}Z`);
  if (Number.isNaN(at.getTime())) return iso;
  return at.toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });
}

type Mode = "" | "hold" | "correct" | "cancel" | "refund";

export function OrderActionsPanel({
  order,
  onChanged,
}: {
  order: LifecycleOrder;
  onChanged: () => void | Promise<void>;
}) {
  const [reasons, setReasons] = useState<string[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [mode, setMode] = useState<Mode>("");
  const [reason, setReason] = useState("");
  const [holdNote, setHoldNote] = useState("");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [correction, setCorrection] = useState({
    street: order.street,
    street2: order.street2,
    city: order.city,
    state: order.state,
    zip: order.zip,
    phone: order.phone,
    poNumber: order.poNumber,
    requestedDeliveryDate: order.requestedDeliveryDate || "",
  });

  const remainingCents = Math.max(0, order.totalCents - order.refundedCents);

  const loadHistory = useCallback(async () => {
    try {
      const response = await fetch(
        `/api/admin/order-actions?id=${encodeURIComponent(order.id)}`,
        { cache: "no-store" },
      );
      if (!response.ok) return;
      const data = await response.json();
      setHistory(data.events || []);
      setReasons(data.reasons || []);
    } catch {
      // The history is context, not the job. If it cannot be fetched the
      // buttons still work.
    }
  }, [order.id]);

  // loadHistory awaits its own request before setting state.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void loadHistory(); }, [loadHistory]);

  async function send(body: Record<string, unknown>, success: string) {
    setBusy(true);
    setError("");
    setNote("");
    try {
      const response = await fetch("/api/admin/order-actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: order.id, ...body }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "That did not go through.");
      setNote(success);
      setMode("");
      setReason("");
      setHoldNote("");
      setAmount("");
      await loadHistory();
      await onChanged();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "That did not go through.");
    } finally {
      setBusy(false);
    }
  }

  function refund() {
    const dollars = Number(amount);
    if (!Number.isFinite(dollars) || dollars <= 0) {
      setError("Enter how much to send back.");
      return;
    }
    // Cents are computed here and checked again on the server; the browser
    // is never trusted with how much money moves.
    const cents = Math.round(dollars * 100);
    const sure = window.confirm(
      `Send ${money(cents)} back to ${order.customerName || order.email} for order #${order.orderNumber}?\n\n`
      + `Reason: ${reason}\n\nThis cannot be undone.`,
    );
    if (!sure) return;
    void send({ action: "refund", amountCents: cents, reason }, `${money(cents)} refunded.`);
  }

  function cancel() {
    const willRefund = order.paymentTerms !== "account" && remainingCents > 0;
    const sure = window.confirm(
      `Cancel order #${order.orderNumber}?\n\nReason: ${reason}\n\n`
      + (willRefund
        ? `${money(remainingCents)} goes back to their card.`
        : `Nothing was charged — the amount returns to their credit line.`),
    );
    if (!sure) return;
    void send({ action: "cancel", reason }, `Order #${order.orderNumber} cancelled.`);
  }

  const canHold = ["paid"].includes(order.status);
  const canCorrect = ["paid", "held"].includes(order.status);
  const canCancel = ["paid", "held", "labeled"].includes(order.status);
  const canRefund = order.paymentTerms === "card" && remainingCents > 0
    && order.status !== "cancelled";
  const canDeliver = order.status === "shipped";

  return (
    <div className="admin-lifecycle">
      <h4>If something&rsquo;s wrong</h4>

      {order.cancelRequestedAt && order.status !== "cancelled" && (
        <p className="admin-lifecycle-flag">
          <strong>{order.customerName || order.email} asked to cancel this.</strong>
          {order.cancelReason ? ` They said: “${order.cancelReason}”` : ""}
        </p>
      )}
      {order.status === "held" && (
        <p className="admin-lifecycle-flag">
          On hold{order.holdReason ? `: ${order.holdReason}` : ""}. Nothing is being baked for it.
        </p>
      )}
      {order.refundedCents > 0 && order.status !== "refunded" && (
        <p className="admin-lifecycle-flag">
          {money(order.refundedCents)} of {money(order.totalCents)} already refunded.
        </p>
      )}

      <div className="admin-lifecycle-buttons">
        {canHold && (
          <button type="button" disabled={busy} onClick={() => { setMode(mode === "hold" ? "" : "hold"); setError(""); }}>
            Put on hold
          </button>
        )}
        {order.status === "held" && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void send({ action: "release" }, "Back in the bake schedule.")}
          >
            Take off hold
          </button>
        )}
        {canCorrect && (
          <button type="button" disabled={busy} onClick={() => { setMode(mode === "correct" ? "" : "correct"); setError(""); }}>
            Fix the details
          </button>
        )}
        {canRefund && (
          <button type="button" disabled={busy} onClick={() => { setMode(mode === "refund" ? "" : "refund"); setError(""); setAmount((remainingCents / 100).toFixed(2)); }}>
            Send money back
          </button>
        )}
        {canCancel && (
          <button type="button" className="admin-danger" disabled={busy} onClick={() => { setMode(mode === "cancel" ? "" : "cancel"); setError(""); }}>
            Cancel the order
          </button>
        )}
        {canDeliver && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void send({ action: "mark-delivered" }, "Marked delivered.")}
          >
            Mark delivered
          </button>
        )}
      </div>

      {mode === "hold" && (
        <div className="admin-lifecycle-form">
          <label htmlFor={`hold-${order.id}`}>Why is it on hold? The buyer sees this.</label>
          <input
            id={`hold-${order.id}`}
            value={holdNote}
            maxLength={200}
            placeholder="Waiting on rye flour — back Thursday"
            onChange={(event) => setHoldNote(event.target.value)}
          />
          <button
            type="button"
            disabled={busy || !holdNote.trim()}
            onClick={() => void send({ action: "hold", reason: holdNote }, "Order held.")}
          >
            {busy ? "Holding…" : "Hold it"}
          </button>
        </div>
      )}

      {mode === "correct" && (
        <div className="admin-lifecycle-form admin-lifecycle-correct">
          <p className="admin-lifecycle-hint">
            Delivery details only. To change what was ordered, refund it and take the order again —
            that keeps the money and the bread telling the same story.
          </p>
          {([
            ["street", "Street"],
            ["street2", "Street 2"],
            ["city", "City"],
            ["state", "State"],
            ["zip", "ZIP"],
            ["phone", "Phone"],
            ["poNumber", "Their PO number"],
            ["requestedDeliveryDate", "Delivery day they want"],
          ] as const).map(([key, label]) => (
            <label key={key}>
              <span>{label}</span>
              <input
                value={correction[key]}
                maxLength={200}
                onChange={(event) => setCorrection((current) => ({ ...current, [key]: event.target.value }))}
              />
            </label>
          ))}
          <button
            type="button"
            disabled={busy}
            onClick={() => void send({ action: "correct", correction }, "Details corrected.")}
          >
            {busy ? "Saving…" : "Save the corrections"}
          </button>
        </div>
      )}

      {(mode === "refund" || mode === "cancel") && (
        <div className="admin-lifecycle-form">
          <label htmlFor={`reason-${order.id}`}>Why?</label>
          <select
            id={`reason-${order.id}`}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          >
            <option value="">Pick a reason…</option>
            {reasons.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>

          {mode === "refund" && (
            <>
              <label htmlFor={`amount-${order.id}`}>
                How much? At most {money(remainingCents)} is left on this order.
              </label>
              <input
                id={`amount-${order.id}`}
                inputMode="decimal"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
              />
              <button type="button" disabled={busy || !reason} onClick={refund}>
                {busy ? "Sending…" : `Send back ${amount ? `$${amount}` : "it"}`}
              </button>
            </>
          )}

          {mode === "cancel" && (
            <button type="button" className="admin-danger" disabled={busy || !reason} onClick={cancel}>
              {busy ? "Cancelling…" : "Cancel this order"}
            </button>
          )}
        </div>
      )}

      {error && <p className="admin-lifecycle-error">{error}</p>}
      {note && <p className="admin-lifecycle-note">{note}</p>}

      <div className="admin-lifecycle-history-head">
        <h4 id={`history-${order.id}`}>
          Full history{history.length > 0 && <span className="admin-history-count">{history.length}</span>}
        </h4>
        {history.length > 0 && (
          <button type="button" className="admin-history-print" onClick={() => window.print()}>
            Print this history
          </button>
        )}
      </div>
      <p className="admin-lifecycle-hint">
        Every change to this order, in order, with who made it. Nothing here is ever
        edited or removed — this is what you send a card processor in a dispute.
      </p>
      {history.length === 0 ? (
        <p className="admin-lifecycle-hint">Nothing recorded yet.</p>
      ) : (
        <ol className="admin-lifecycle-history">
          {history.map((entry) => (
            <li key={entry.id}>
              <span className="admin-lifecycle-when">{when(entry.at)}</span>
              <span className="admin-lifecycle-what">
                {entry.summary}
                {entry.detail && <small>{entry.detail}</small>}
              </span>
              <span className="admin-lifecycle-who">
                {entry.who}
                {!entry.buyerVisible && <small>internal</small>}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
