"use client";

/**
 * Problems buyers have raised, and what was done about them.
 *
 * The order is the point. Cases sit here ranked by what they are costing the
 * buyer right now — a shop that got half a delivery this morning is above a
 * billing question from last week — so working top-down is the right thing to
 * do without anyone having to decide it.
 *
 * Answering emails the buyer. There is no separate "notify them" step,
 * because the step that gets skipped is always the one that is separate.
 */

import { useCallback, useEffect, useState } from "react";

type SupportCase = {
  id: string;
  businessName: string;
  contactEmail: string;
  orderId: string;
  orderNumber: number;
  reason: string;
  reasonLabel: string;
  likelyRefund: boolean;
  message: string;
  status: "open" | "answered" | "resolved";
  reply: string;
  ownerNotes: string;
  urgency: "now" | "today" | "soon";
  waitingFor: string;
  openedAt: string;
  resolvedAt: string | null;
};

const URGENCY_WORD = {
  now: "Answer today",
  today: "Today",
  soon: "When you can",
} as const;

export function SupportQueue() {
  const [cases, setCases] = useState<SupportCase[]>([]);
  const [openCount, setOpenCount] = useState(0);
  const [showResolved, setShowResolved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState<Record<string, { reply: string; notes: string }>>({});
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/support", { cache: "no-store" });
      if (!response.ok) throw new Error("The problem queue could not be loaded.");
      const data = await response.json();
      setCases(data.cases || []);
      setOpenCount(Number(data.openCount || 0));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The problem queue could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  // load awaits its request before setting anything.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  function draftFor(row: SupportCase) {
    return drafts[row.id] || { reply: row.reply, notes: row.ownerNotes };
  }

  /**
   * Seeded from what is already saved on the case, so typing a private note
   * on an answered case cannot blank out the reply the buyer was sent.
   */
  function setDraft(row: SupportCase, patch: Partial<{ reply: string; notes: string }>) {
    setDrafts((current) => ({
      ...current,
      [row.id]: { ...(current[row.id] || { reply: row.reply, notes: row.ownerNotes }), ...patch },
    }));
  }

  async function save(row: SupportCase, status?: "answered" | "resolved") {
    const draft = draftFor(row);
    setBusy(row.id);
    setError("");
    setNote("");
    try {
      const response = await fetch("/api/admin/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: row.id,
          reply: draft.reply,
          ownerNotes: draft.notes,
          status,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "That could not be saved.");
      setNote(status === "resolved"
        ? `${row.businessName} has been answered and the case is closed.`
        : `Sent to ${row.contactEmail}.`);
      setDrafts((current) => {
        const next = { ...current };
        delete next[row.id];
        return next;
      });
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "That could not be saved.");
    } finally {
      setBusy("");
    }
  }

  const shown = showResolved ? cases : cases.filter((row) => row.status !== "resolved");

  return (
    <section className="admin-panel" aria-labelledby="support-queue-title">
      <div className="admin-panel-head">
        <h2 id="support-queue-title">
          Problems{openCount > 0 && <span className="admin-badge">{openCount}</span>}
        </h2>
        <p>
          What buyers have told us went wrong. Answering one emails them straight away.
        </p>
      </div>

      <div className="admin-filters" aria-label="Filter problems">
        <button type="button" className={showResolved ? "" : "active"} onClick={() => setShowResolved(false)}>
          Still open
        </button>
        <button type="button" className={showResolved ? "active" : ""} onClick={() => setShowResolved(true)}>
          Everything
        </button>
      </div>

      {error && <p className="admin-error">{error}</p>}
      {note && <p className="admin-success">{note}</p>}

      {loading ? (
        <p>Loading…</p>
      ) : shown.length === 0 ? (
        <p className="admin-empty">
          {showResolved ? "No one has reported a problem yet." : "Nothing outstanding. Every problem raised has been answered."}
        </p>
      ) : (
        <ul className="admin-support-list">
          {shown.map((row) => {
            const draft = draftFor(row);
            return (
              <li key={row.id} className={`admin-support-case urgency-${row.urgency} status-${row.status}`}>
                <header>
                  <div>
                    <strong>{row.businessName}</strong>
                    <small>{row.contactEmail}</small>
                  </div>
                  <div className="admin-support-tags">
                    <span className={`admin-urgency urgency-${row.urgency}`}>{URGENCY_WORD[row.urgency]}</span>
                    {row.orderNumber > 0 && <span className="admin-support-order">Order #{row.orderNumber}</span>}
                    {row.likelyRefund && row.status !== "resolved" && (
                      <span className="admin-support-money">Probably owe money back</span>
                    )}
                    {row.status === "resolved" && <span className="admin-support-done">Closed</span>}
                  </div>
                </header>

                <p className="admin-support-reason">{row.reasonLabel}</p>
                <blockquote className="admin-support-message">{row.message}</blockquote>
                {row.waitingFor && <p className="admin-support-waiting">Waiting {row.waitingFor}.</p>}

                <label htmlFor={`reply-${row.id}`}>What we&rsquo;re telling them (they get this by email)</label>
                <textarea
                  id={`reply-${row.id}`}
                  rows={3}
                  maxLength={2000}
                  value={draft.reply}
                  placeholder="We're sending two replacement cases on tomorrow's run, no charge."
                  onChange={(event) => setDraft(row, { reply: event.target.value })}
                />

                <label htmlFor={`notes-${row.id}`}>Your own note (the buyer never sees this)</label>
                <input
                  id={`notes-${row.id}`}
                  maxLength={2000}
                  value={draft.notes}
                  placeholder="Third damaged box from the Tuesday pallet"
                  onChange={(event) => setDraft(row, { notes: event.target.value })}
                />

                <div className="admin-support-actions">
                  <button
                    type="button"
                    disabled={busy === row.id || !draft.reply.trim()}
                    onClick={() => void save(row)}
                  >
                    {busy === row.id ? "Sending…" : "Send this reply"}
                  </button>
                  {row.status !== "resolved" && (
                    <button
                      type="button"
                      className="admin-secondary"
                      disabled={busy === row.id || !draft.reply.trim()}
                      onClick={() => void save(row, "resolved")}
                    >
                      Send it and close the case
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
