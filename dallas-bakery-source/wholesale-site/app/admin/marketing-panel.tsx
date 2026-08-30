"use client";

/**
 * The marketing list and the one place a campaign is sent from.
 *
 * A send cannot be recalled, so the panel is built to slow it down by exactly
 * one step: the "Send test to me" button sends the identical message to the
 * owner first, and the send button names how many businesses will receive it.
 */

import { useCallback, useEffect, useState } from "react";

type Subscriber = {
  email: string;
  businessName: string;
  source: string;
  subscribedAt: string;
  unsubscribedAt: string | null;
  active: boolean;
};

type Payload = {
  subscribers: Subscriber[];
  activeCount: number;
  pushDevices: { buyer: number; owner: number };
  sentTestTo?: string;
  campaign?: { sent: number; failed: number; recipients: number };
};

function shortDate(value: string | null) {
  if (!value) return "";
  const date = new Date(String(value).replace(" ", "T") + (String(value).includes("T") ? "" : "Z"));
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(date);
}

export function MarketingPanel() {
  const [data, setData] = useState<Payload | null>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [addEmail, setAddEmail] = useState("");
  const [addName, setAddName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/marketing", { cache: "no-store" });
      if (!response.ok) return;
      setData(await response.json());
    } catch {
      // Renders empty until the next successful load.
    }
  }, []);

  // load awaits the request before it sets anything.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  async function act(payload: Record<string, unknown>, done: (result: Payload) => string) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/admin/marketing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "That did not go through.");
      setData(result);
      setMessage(done(result));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "That did not go through.");
    } finally {
      setBusy(false);
    }
  }

  const activeCount = data?.activeCount ?? 0;
  const devices = data?.pushDevices ?? { buyer: 0, owner: 0 };

  return (
    <section className="admin-products" aria-labelledby="marketing-title">
      <div className="admin-products-head">
        <div>
          <p className="admin-kicker">Reach</p>
          <h2 id="marketing-title">Email list &amp; notifications</h2>
          <p className="admin-products-sub">
            {activeCount === 0
              ? "Nobody has opted in yet. Buyers join by ticking the box on the wholesale application."
              : `${activeCount} business${activeCount === 1 ? "" : "es"} opted in. `}
            {devices.buyer + devices.owner > 0 && (
              <>
                {devices.buyer} buyer phone{devices.buyer === 1 ? "" : "s"} and {devices.owner} owner
                phone{devices.owner === 1 ? "" : "s"} are set up for push notifications.
              </>
            )}
          </p>
        </div>
      </div>

      <form
        className="admin-marketing-compose"
        onSubmit={(event) => {
          event.preventDefault();
          const sure = window.confirm(
            `Send "${subject}" to ${activeCount} business${activeCount === 1 ? "" : "es"}?\n\n` +
            "This goes out immediately and can't be recalled.",
          );
          if (!sure) return;
          void act({ action: "send", subject, body }, (result) =>
            `Sent to ${result.campaign?.sent ?? 0} of ${result.campaign?.recipients ?? 0}.` +
            (result.campaign?.failed ? ` ${result.campaign.failed} did not go through.` : ""));
        }}
      >
        <label>
          <span>Subject</span>
          <input
            required
            maxLength={120}
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            placeholder="New: sourdough rye, wholesale from Monday"
          />
        </label>
        <label>
          <span>Message</span>
          <textarea
            required
            rows={8}
            maxLength={8000}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder={"We're baking a new rye starting Monday.\n\nCall the bakery or order in your account — it's in the catalog now."}
          />
        </label>
        <p className="admin-product-note">
          Every message is signed off with the bakery&apos;s address and a one-click unsubscribe link,
          which the law requires. Order confirmations, tracking, and invoices are separate — nobody
          loses those by unsubscribing here.
        </p>
        <div className="admin-product-actions">
          <button
            type="button"
            className="buyer-link"
            disabled={busy || !subject.trim() || !body.trim()}
            onClick={() => void act({ action: "test", subject, body }, (result) =>
              `Test sent to ${result.sentTestTo || "you"}. Check it before sending to the list.`)}
          >
            Send test to me
          </button>
          <button type="submit" className="admin-action-approve" disabled={busy || activeCount === 0}>
            {busy ? "Sending…" : `Send to ${activeCount} business${activeCount === 1 ? "" : "es"}`}
          </button>
        </div>
      </form>

      <form
        className="admin-marketing-add"
        onSubmit={(event) => {
          event.preventDefault();
          void act({ action: "add", email: addEmail, businessName: addName }, () => {
            setAddEmail("");
            setAddName("");
            return "Added to the list.";
          });
        }}
      >
        <label>
          <span>Add someone who asked in person</span>
          <input
            required
            type="email"
            value={addEmail}
            onChange={(event) => setAddEmail(event.target.value)}
            placeholder="buyer@theirshop.com"
          />
        </label>
        <label>
          <span>Business name</span>
          <input value={addName} onChange={(event) => setAddName(event.target.value)} placeholder="Their Shop" />
        </label>
        <button type="submit" className="buyer-link" disabled={busy}>Add</button>
      </form>

      {data && data.subscribers.length > 0 && (
        <div className="admin-marketing-list">
          <table>
            <thead>
              <tr><th>Business</th><th>Email</th><th>Joined</th><th>Status</th><th /></tr>
            </thead>
            <tbody>
              {data.subscribers.map((subscriber) => (
                <tr key={subscriber.email} className={subscriber.active ? "" : "inactive"}>
                  <td>{subscriber.businessName || "—"}</td>
                  <td>{subscriber.email}</td>
                  <td>{shortDate(subscriber.subscribedAt)}</td>
                  <td>{subscriber.active ? subscriber.source : `Unsubscribed ${shortDate(subscriber.unsubscribedAt)}`}</td>
                  <td>
                    {subscriber.active && (
                      <button
                        type="button"
                        className="buyer-link"
                        disabled={busy}
                        onClick={() => void act(
                          { action: "remove", email: subscriber.email },
                          () => `${subscriber.email} removed from the list.`,
                        )}
                      >
                        Remove
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {error && <p className="buyer-error" role="alert">{error}</p>}
      {message && <p className="admin-shipping-feedback success" role="status">{message}</p>}
    </section>
  );
}
