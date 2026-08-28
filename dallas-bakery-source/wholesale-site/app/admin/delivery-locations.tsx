"use client";

/**
 * Owner-managed delivery addresses for one approved business, shown inside
 * the application card. Adding an address here is the screening step for it;
 * buyers can only ever choose among what appears in this list.
 */

import { useCallback, useEffect, useState } from "react";

type BuyerLocation = {
  id: string;
  name: string;
  street: string;
  street2: string;
  city: string;
  state: string;
  zip: string;
  active: boolean;
};

const EMPTY_FORM = { name: "", street: "", street2: "", city: "", state: "", zip: "" };

export function DeliveryLocations({ applicationId, primaryLabel }: { applicationId: string; primaryLabel: string }) {
  const [locations, setLocations] = useState<BuyerLocation[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/admin/buyer-locations?applicationId=${encodeURIComponent(applicationId)}`, { cache: "no-store" });
      if (!response.ok) return;
      const data = await response.json();
      setLocations(data.locations || []);
    } catch {
      // The list is a convenience view; a failed load just shows the primary.
    }
  }, [applicationId]);

  // load awaits the request before it sets anything.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  async function add(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/admin/buyer-locations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ applicationId, ...form }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "The address could not be added.");
      setForm(EMPTY_FORM);
      setOpen(false);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The address could not be added.");
    } finally {
      setBusy(false);
    }
  }

  async function setActive(id: string, active: boolean) {
    setBusy(true);
    try {
      await fetch("/api/admin/buyer-locations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "set-active", id, active }),
      });
      await load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="admin-locations">
      <div className="admin-locations-head">
        <h4>Delivery locations</h4>
        <button type="button" className="buyer-link" onClick={() => setOpen((current) => !current)}>
          {open ? "Cancel" : "Add a location"}
        </button>
      </div>
      <ul>
        <li>
          <strong>{primaryLabel}</strong>
          <span className="admin-location-primary">PRIMARY · SCREENED</span>
        </li>
        {locations.map((location) => (
          <li key={location.id} className={location.active ? "" : "inactive"}>
            <strong>{location.name || "Additional location"}</strong>
            <span>
              {[location.street, location.street2].filter(Boolean).join(", ")} · {location.city}, {location.state} {location.zip}
            </span>
            <button
              type="button"
              className="buyer-link"
              disabled={busy}
              onClick={() => void setActive(location.id, !location.active)}
            >
              {location.active ? "Deactivate" : "Reactivate"}
            </button>
          </li>
        ))}
      </ul>

      {open && (
        <form className="admin-location-form" onSubmit={add}>
          <input placeholder="Location name (e.g. Plano store)" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input required placeholder="Street address" value={form.street} onChange={(e) => setForm({ ...form, street: e.target.value })} />
          <input placeholder="Suite (optional)" value={form.street2} onChange={(e) => setForm({ ...form, street2: e.target.value })} />
          <div className="admin-location-row">
            <input required placeholder="City" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
            <input required placeholder="TX" maxLength={2} value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value.toUpperCase() })} />
            <input required placeholder="ZIP" value={form.zip} onChange={(e) => setForm({ ...form, zip: e.target.value })} />
          </div>
          <p className="admin-location-note">
            Adding an address approves it for delivery — check it the way you would a new application.
          </p>
          {error && <p className="buyer-error" role="alert">{error}</p>}
          <button type="submit" className="admin-action-approve" disabled={busy}>
            {busy ? "Saving…" : "Approve this address"}
          </button>
        </form>
      )}
    </div>
  );
}
