"use client";

/**
 * Per-customer terms on an approved application card: the credit line and
 * exclusive pricing.
 *
 * Credit: the owner grants (or revokes) a dollar limit. A buyer with credit
 * can place orders "on account" — no card — and each unpaid invoice holds
 * part of the line until it is marked paid in the shipping queue.
 *
 * Exclusive pricing: a special price per loaf for this business on any
 * product. Set here, it applies everywhere that buyer's cart is priced —
 * website, app, standing orders, and order intake.
 */

import { useState } from "react";

function money(cents: number) {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

type CreditProps = {
  creditLimitCents: number;
  /** Net terms in days: 15, 30, or 0 for none. */
  creditTermsDays: number;
  outstandingCents: number;
  /** The slice of the outstanding balance past its due date. */
  overdueCents: number;
  /** True while the application is still pending — terms set now apply the
   *  moment the account is approved. */
  pending?: boolean;
  /** Saves through the applications PATCH so status and notes are preserved. */
  onSave: (creditLimitCents: number, creditTermsDays: number) => Promise<string | null>;
};

export function CreditTerms({ creditLimitCents, creditTermsDays, outstandingCents, overdueCents, pending, onSave }: CreditProps) {
  const onTerms = creditTermsDays === 15 || creditTermsDays === 30;
  const [terms, setTerms] = useState<0 | 15 | 30>(onTerms ? (creditTermsDays as 15 | 30) : 0);
  const [limitDollars, setLimitDollars] = useState(
    creditLimitCents > 0 ? (creditLimitCents / 100).toFixed(2) : "",
  );
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  // A save elsewhere (the approve prompt) changes the props; syncing during
  // render keeps the fields current without an effect.
  const [lastSeenLimit, setLastSeenLimit] = useState(creditLimitCents);
  if (lastSeenLimit !== creditLimitCents) {
    setLastSeenLimit(creditLimitCents);
    setLimitDollars(creditLimitCents > 0 ? (creditLimitCents / 100).toFixed(2) : "");
  }
  const [lastSeenDays, setLastSeenDays] = useState(creditTermsDays);
  if (lastSeenDays !== creditTermsDays) {
    setLastSeenDays(creditTermsDays);
    setTerms(creditTermsDays === 15 || creditTermsDays === 30 ? (creditTermsDays as 15 | 30) : 0);
  }

  const available = Math.max(0, creditLimitCents - outstandingCents);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    if (terms === 0) {
      setSaving(true);
      const problem = await onSave(0, 0);
      setSaving(false);
      if (problem) setError(problem);
      else setMessage("Saved. This buyer pays by card only.");
      return;
    }
    const dollars = Number(limitDollars);
    if (!limitDollars.trim() || !Number.isFinite(dollars) || dollars <= 0) {
      setError(`Enter the most they can owe on Net ${terms} — their net limit.`);
      return;
    }
    setSaving(true);
    const problem = await onSave(Math.round(dollars * 100), terms);
    setSaving(false);
    if (problem) {
      setError(problem);
    } else {
      setMessage(`Saved — Net ${terms} with a ${money(Math.round(dollars * 100))} net limit${pending ? ", live the moment you approve them" : ""}. They order without a card and you invoice them.`);
    }
  }

  return (
    <section className="admin-credit" aria-label="Net terms">
      <div className="admin-credit-summary">
        <p className="admin-kicker">Net terms</p>
        {onTerms && creditLimitCents > 0 ? (
          <>
            <p>
              <strong>Net {creditTermsDays}</strong> · Net limit{" "}
              <strong>{money(creditLimitCents)}</strong> · Outstanding{" "}
              <strong>{money(outstandingCents)}</strong> · Available{" "}
              <strong>{money(available)}</strong>
              {pending ? " — active once approved." : ""}
            </p>
            {overdueCents > 0 && (
              <p className="admin-credit-overdue" role="alert">
                Past due <strong>{money(overdueCents)}</strong> — their account is
                locked to card until you mark the overdue invoices paid in the
                shipping queue.
              </p>
            )}
          </>
        ) : (
          <p>
            Card only. Put this buyer on Net 15 or Net 30 and set their net
            limit — the most they can owe at once — and they order without a
            card; you invoice them and mark it paid in the shipping queue.
            {pending ? " Set it now and it applies the moment you approve them." : ""}
          </p>
        )}
      </div>
      <form onSubmit={save}>
        <label>
          <span>Payment terms</span>
          <select
            aria-label="Net payment terms"
            value={terms}
            onChange={(event) => {
              const value = Number(event.target.value);
              setTerms(value === 15 ? 15 : value === 30 ? 30 : 0);
            }}
          >
            <option value={0}>Card only</option>
            <option value={15}>Net 15</option>
            <option value={30}>Net 30</option>
          </select>
        </label>
        {terms !== 0 && (
          <label>
            <span>Net limit</span>
            <span className="admin-money-input"><b>$</b><input
              aria-label={`Maximum owed on Net ${terms}, in dollars`}
              inputMode="decimal"
              min="0"
              max="250000"
              step="0.01"
              placeholder="1500.00"
              value={limitDollars}
              onChange={(event) => setLimitDollars(event.target.value)}
            /></span>
          </label>
        )}
        <button disabled={saving} type="submit">{saving ? "Saving…" : "Save net terms"}</button>
      </form>
      {error && <p className="admin-error" role="alert">{error}</p>}
      {message && <p className="admin-credit-saved" role="status">{message}</p>}
    </section>
  );
}

type Product = {
  sku: string;
  title: string;
  loafPriceCents: number;
  loavesPerCase: number;
  active: boolean;
};

type PricingProps = { applicationId: string; businessName: string };

export function ExclusivePricing({ applicationId, businessName }: PricingProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [overrides, setOverrides] = useState<Record<string, number>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busySku, setBusySku] = useState("");
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [productsResponse, pricesResponse] = await Promise.all([
        fetch("/api/admin/products"),
        fetch(`/api/admin/customer-prices?applicationId=${encodeURIComponent(applicationId)}`),
      ]);
      const productsData = (await productsResponse.json()) as { products?: Product[]; error?: string };
      const pricesData = (await pricesResponse.json()) as { overrides?: Record<string, number>; error?: string };
      if (!productsResponse.ok || !productsData.products) throw new Error(productsData.error || "Products could not be loaded.");
      if (!pricesResponse.ok || !pricesData.overrides) throw new Error(pricesData.error || "Prices could not be loaded.");
      setProducts(productsData.products.filter((product) => product.active));
      setOverrides(pricesData.overrides);
      setDrafts(Object.fromEntries(
        Object.entries(pricesData.overrides).map(([sku, cents]) => [sku, (cents / 100).toFixed(2)]),
      ));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Pricing could not be loaded.");
    } finally {
      setLoading(false);
    }
  }

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && !products.length) void load();
  }

  async function post(body: Record<string, unknown>) {
    const response = await fetch("/api/admin/customer-prices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, applicationId }),
    });
    const data = (await response.json()) as { overrides?: Record<string, number>; error?: string };
    if (!response.ok || !data.overrides) throw new Error(data.error || "The price could not be saved.");
    setOverrides(data.overrides);
    setDrafts((current) => {
      const next = { ...current };
      for (const [sku, cents] of Object.entries(data.overrides!)) next[sku] = (cents / 100).toFixed(2);
      return next;
    });
  }

  async function setPrice(product: Product) {
    const dollars = Number(drafts[product.sku]);
    setError("");
    if (!String(drafts[product.sku] || "").trim() || !Number.isFinite(dollars) || dollars <= 0) {
      setError(`Enter a price per loaf for ${product.title}.`);
      return;
    }
    setBusySku(product.sku);
    try {
      await post({ action: "set", sku: product.sku, loafPriceCents: Math.round(dollars * 100) });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The price could not be saved.");
    } finally {
      setBusySku("");
    }
  }

  async function clearPrice(product: Product) {
    setError("");
    setBusySku(product.sku);
    try {
      await post({ action: "clear", sku: product.sku });
      setDrafts((current) => ({ ...current, [product.sku]: "" }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The price could not be cleared.");
    } finally {
      setBusySku("");
    }
  }

  return (
    <section className="admin-exclusive" aria-label="Exclusive pricing">
      <div className="admin-exclusive-head">
        <div>
          <p className="admin-kicker">Exclusive pricing</p>
          <p>
            {Object.keys(overrides).length
              ? `${Object.keys(overrides).length} special price${Object.keys(overrides).length === 1 ? "" : "s"} set for ${businessName}.`
              : `Special per-loaf prices for ${businessName} only. Everyone else keeps the catalog price.`}
          </p>
        </div>
        <button type="button" onClick={toggle}>{open ? "Close" : "Set prices"}</button>
      </div>
      {open && (
        <div className="admin-exclusive-body">
          {loading && <p>Loading products…</p>}
          {!loading && products.map((product) => {
            const override = overrides[product.sku];
            return (
              <div className="admin-exclusive-row" key={product.sku}>
                <div className="admin-exclusive-product">
                  <strong>{product.title}</strong>
                  <small>
                    List {money(product.loafPriceCents)}/loaf · {money(product.loafPriceCents * product.loavesPerCase)}/case
                    {override ? ` — this buyer pays ${money(override)}/loaf (${money(override * product.loavesPerCase)}/case)` : ""}
                  </small>
                </div>
                <span className="admin-money-input"><b>$</b><input
                  aria-label={`${product.title} price per loaf for ${businessName}`}
                  inputMode="decimal"
                  placeholder={(product.loafPriceCents / 100).toFixed(2)}
                  value={drafts[product.sku] ?? ""}
                  onChange={(event) => setDrafts((current) => ({ ...current, [product.sku]: event.target.value }))}
                /></span>
                <button
                  type="button"
                  disabled={busySku === product.sku}
                  onClick={() => void setPrice(product)}
                >{busySku === product.sku ? "Saving…" : override ? "Update" : "Set"}</button>
                {override ? (
                  <button
                    type="button"
                    className="admin-exclusive-clear"
                    disabled={busySku === product.sku}
                    onClick={() => void clearPrice(product)}
                  >Back to list price</button>
                ) : null}
              </div>
            );
          })}
          {error && <p className="admin-error" role="alert">{error}</p>}
        </div>
      )}
    </section>
  );
}
