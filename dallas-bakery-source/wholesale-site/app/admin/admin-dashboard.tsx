"use client";

import { CreditTerms, ExclusivePricing } from "./customer-terms";
import { DeliveryLocations } from "./delivery-locations";
import { ProductsManager } from "./products-manager";
import { ShippingQueue } from "./shipping-queue";

import Link from "next/link";
import { useMemo, useState } from "react";

type ApplicationStatus = "pending" | "approved" | "declined";

type WholesaleApplication = {
  id: string;
  businessName: string;
  businessType: string;
  contactName: string;
  email: string;
  phone: string;
  website: string;
  street: string;
  street2: string;
  city: string;
  state: string;
  zip: string;
  multipleLocations: boolean;
  locationCount: number;
  additionalMarkets: string;
  screeningStatus: string;
  addressScreening: string;
  categoryScreening: string;
  standardizedAddress: string;
  matchedBusiness: string;
  status: ApplicationStatus;
  ownerNotes: string;
  creditLimitCents: number;
  decidedBy: string;
  decidedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type Props = {
  initialApplications: WholesaleApplication[];
  /** Unpaid account-order totals per application id. */
  initialOutstanding: Record<string, number>;
  initialShipping: {
    rateCents: number;
    unitsPerBox: number;
    formattedRate: string;
    boxWeightOz: number;
    updatedAt: string | null;
  };
  user: { displayName: string; email: string };
  readiness: {
    commercialAddressCheck: boolean;
    businessCategoryCheck: boolean;
    buyerOrdering: boolean;
    cardPayments: boolean;
    emailNotifications: boolean;
    orderIntake: boolean;
    shippingLabels: boolean;
  };
};

const businessTypeLabels: Record<string, string> = {
  restaurant: "Restaurant / caterer",
  grocery: "Grocery / food market",
  hospitality: "Hotel / hospitality",
  institution: "School / institution",
  "food-distributor": "Food distributor",
};

function GrainMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 48 48" fill="none">
      <path d="M24 42V12m0 7c-6-1-9-5-9-10 6 1 9 5 9 10Zm0 8c-6-1-10-5-10-10 6 1 10 5 10 10Zm0 8c-6-1-10-5-10-10 6 1 10 5 10 10Zm0-16c6-1 9-5 9-10-6 1-9 5-9 10Zm0 8c6-1 10-5 10-10-6 1-10 5-10 10Zm0 8c6-1 10-5 10-10-6 1-10 5-10 10Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function formatDate(value: string) {
  const parsed = new Date(value.replace(" ", "T") + (value.includes("Z") ? "" : "Z"));
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Chicago",
    timeZoneName: "short",
  }).format(parsed);
}

function addressOf(application: WholesaleApplication) {
  return [
    application.street,
    application.street2,
    `${application.city}, ${application.state} ${application.zip}`,
  ].filter(Boolean).join(", ");
}

function statusLabel(status: string) {
  if (status === "approved") return "Approved";
  if (status === "declined") return "Declined";
  return "Pending";
}

export default function AdminDashboard({ initialApplications, initialOutstanding, initialShipping, readiness, user }: Props) {
  const [applications, setApplications] = useState(initialApplications);
  const [filter, setFilter] = useState<"pending" | "approved" | "declined" | "all">("pending");
  const [query, setQuery] = useState("");
  const [notes, setNotes] = useState<Record<string, string>>(
    Object.fromEntries(initialApplications.map((application) => [application.id, application.ownerNotes])),
  );
  const [savingId, setSavingId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [shipping, setShipping] = useState(initialShipping);
  const [shippingRate, setShippingRate] = useState((initialShipping.rateCents / 100).toFixed(2));
  const [unitsPerBox, setUnitsPerBox] = useState(String(initialShipping.unitsPerBox));
  const [shippingSaving, setShippingSaving] = useState(false);
  const [shippingMessage, setShippingMessage] = useState("");
  const [shippingError, setShippingError] = useState("");

  const counts = useMemo(() => ({
    pending: applications.filter((application) => application.status === "pending").length,
    approved: applications.filter((application) => application.status === "approved").length,
    declined: applications.filter((application) => application.status === "declined").length,
    multiLocation: applications.filter((application) => application.multipleLocations).length,
  }), [applications]);

  const visibleApplications = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return applications.filter((application) => {
      const matchesFilter = filter === "all" || application.status === filter;
      const searchable = [
        application.businessName,
        application.contactName,
        application.email,
        application.phone,
        application.city,
        application.state,
      ].join(" ").toLowerCase();
      return matchesFilter && (!needle || searchable.includes(needle));
    });
  }, [applications, filter, query]);

  async function updateApplication(
    application: WholesaleApplication,
    status: ApplicationStatus,
    creditLimitCents?: number,
  ) {
    setSavingId(application.id);
    setErrors((current) => ({ ...current, [application.id]: "" }));

    try {
      const response = await fetch("/api/admin/applications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: application.id,
          status,
          ownerNotes: notes[application.id] || "",
          ...(creditLimitCents === undefined ? {} : { creditLimitCents }),
        }),
      });
      const data = (await response.json()) as {
        application?: WholesaleApplication;
        error?: string;
      };
      if (!response.ok || !data.application) {
        throw new Error(data.error || "The application could not be updated.");
      }
      setApplications((current) =>
        current.map((item) => item.id === application.id ? data.application! : item),
      );
      return null;
    } catch (error) {
      const message = error instanceof Error ? error.message : "The application could not be updated.";
      setErrors((current) => ({ ...current, [application.id]: message }));
      return message;
    } finally {
      setSavingId(null);
    }
  }

  function confirmDecision(application: WholesaleApplication, status: ApplicationStatus) {
    const action = status === "approved" ? "approve" : status === "declined" ? "decline" : "move to pending";
    if (!window.confirm(`Are you sure you want to ${action} ${application.businessName}?`)) return;

    // Approval is the moment to decide on credit: a limit lets this buyer
    // place orders on account (invoiced, no card). Cancel keeps whatever the
    // account already has; it can be changed any time on the approved card.
    let creditLimitCents: number | undefined;
    if (status === "approved") {
      const answer = window.prompt(
        `Give ${application.businessName} a credit limit?\n\n` +
        "Enter a dollar amount to let them order on account (you invoice them), " +
        "or 0 to keep them card-only. You can change this later on their card.",
        ((application.creditLimitCents || 0) / 100).toFixed(0),
      );
      if (answer !== null && answer.trim() !== "") {
        const dollars = Number(answer.replace(/[$,\s]/g, ""));
        if (Number.isFinite(dollars) && dollars >= 0 && dollars <= 250_000) {
          creditLimitCents = Math.round(dollars * 100);
        }
      }
    }
    void updateApplication(application, status, creditLimitCents);
  }

  const [boxWeightLbs, setBoxWeightLbs] = useState((initialShipping.boxWeightOz / 16).toFixed(1));

  async function saveShipping(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setShippingSaving(true);
    setShippingError("");
    setShippingMessage("");

    const dollars = Number(shippingRate);
    const rateCents = Math.round(dollars * 100);
    const boxSize = Number(unitsPerBox);
    const weightLbs = Number(boxWeightLbs);
    if (!shippingRate.trim() || !unitsPerBox.trim() || !Number.isFinite(dollars) || dollars < 0 || !Number.isInteger(boxSize)) {
      setShippingError("Enter a valid dollar amount and whole-number box size.");
      setShippingSaving(false);
      return;
    }
    if (!boxWeightLbs.trim() || !Number.isFinite(weightLbs) || weightLbs < 1 || weightLbs > 150) {
      setShippingError("Box weight must be between 1 and 150 pounds.");
      setShippingSaving(false);
      return;
    }

    try {
      const response = await fetch("/api/admin/settings/shipping", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rateCents, unitsPerBox: boxSize, boxWeightOz: Math.round(weightLbs * 16) }),
      });
      const data = (await response.json()) as { shipping?: typeof initialShipping; error?: string };
      if (!response.ok || !data.shipping) throw new Error(data.error || "Shipping could not be updated.");
      setShipping(data.shipping);
      setShippingRate((data.shipping.rateCents / 100).toFixed(2));
      setUnitsPerBox(String(data.shipping.unitsPerBox));
      setBoxWeightLbs((data.shipping.boxWeightOz / 16).toFixed(1));
      setShippingMessage("Live shipping updated on the website, app, and checkout rate service.");
    } catch (caught) {
      setShippingError(caught instanceof Error ? caught.message : "Shipping could not be updated.");
    } finally {
      setShippingSaving(false);
    }
  }

  return (
    <main className="admin-page">
      <header className="admin-header">
        <Link className="brand admin-brand" href="/" aria-label="Dallas Bakery Wholesale home">
          <span className="brand-mark"><GrainMark /></span>
          <span><strong>DALLAS BAKERY</strong><small>OWNER PORTAL</small></span>
        </Link>
        <div className="admin-account">
          <span><strong>{user.displayName}</strong><small>{user.email}</small></span>
          <form action="/api/admin/logout" method="post">
            <button type="submit">Sign out</button>
          </form>
        </div>
      </header>

      <section className="admin-shell">
        <div className="admin-title-row">
          <div>
            <p className="admin-kicker">Wholesale applications</p>
            <h1>Account approvals</h1>
            <p>Review every request, see the quiet screening signals, and approve the right businesses.</p>
          </div>
          <Link className="admin-site-link" href="/apply">View customer form <span>↗</span></Link>
        </div>

        <div className="admin-stats" aria-label="Application totals">
          <article><span>Waiting</span><strong>{counts.pending}</strong><small>Needs your decision</small></article>
          <article><span>Approved</span><strong>{counts.approved}</strong><small>Wholesale accounts</small></article>
          <article><span>Multi-location</span><strong>{counts.multiLocation}</strong><small>Businesses with 2+ stores</small></article>
          <article><span>Total requests</span><strong>{applications.length}</strong><small>All time</small></article>
        </div>

        <section className="admin-shipping-card" aria-labelledby="shipping-settings-title">
          <div>
            <p className="admin-kicker">Live order settings</p>
            <h2 id="shipping-settings-title">Case shipping</h2>
            <p>
              Wholesale buyers pay <strong>{shipping.formattedRate}</strong> per case — one case ships as one
              box of <strong>{shipping.unitsPerBox} loaves</strong>. Three cases is three boxes at{" "}
              {shipping.formattedRate} each. Retail still bills by the box.
            </p>
            {shipping.updatedAt && <small>Last updated {formatDate(shipping.updatedAt)}</small>}
          </div>
          <form onSubmit={saveShipping}>
            <label>
              <span>Rate per box</span>
              <span className="admin-money-input"><b>$</b><input aria-label="Shipping dollars per box" inputMode="decimal" min="0" max="1000" required step="0.01" value={shippingRate} onChange={(event) => setShippingRate(event.target.value)} /></span>
            </label>
            <label>
              <span>Units per box</span>
              <input inputMode="numeric" min="1" max="1000" required step="1" type="number" value={unitsPerBox} onChange={(event) => setUnitsPerBox(event.target.value)} />
            </label>
            <label>
              <span>Packed box weight (lb)</span>
              <input aria-label="Packed box weight in pounds" inputMode="decimal" min="1" max="150" required step="0.1" type="number" value={boxWeightLbs} onChange={(event) => setBoxWeightLbs(event.target.value)} />
            </label>
            <button disabled={shippingSaving} type="submit">{shippingSaving ? "Saving…" : "Save live shipping"}</button>
          </form>
          {shippingError && <p className="admin-shipping-feedback error" role="alert">{shippingError}</p>}
          {shippingMessage && <p className="admin-shipping-feedback success" role="status">{shippingMessage}</p>}
        </section>

        <details className="admin-readiness">
          <summary>
            <span>Launch connections</span>
            <strong>{Object.values(readiness).filter(Boolean).length}/{Object.keys(readiness).length} active</strong>
          </summary>
          <div>
            <p className={readiness.commercialAddressCheck ? "ready" : "needs-setup"}><span>{readiness.commercialAddressCheck ? "✓" : "!"}</span><strong>Commercial address screening</strong><small>{readiness.commercialAddressCheck ? "Automatic check active" : "Applications require owner review"}</small></p>
            <p className={readiness.businessCategoryCheck ? "ready" : "needs-setup"}><span>{readiness.businessCategoryCheck ? "✓" : "!"}</span><strong>Business listing screening</strong><small>{readiness.businessCategoryCheck ? "Automatic check active" : "Applications require owner review"}</small></p>
            <p className={readiness.buyerOrdering ? "ready" : "needs-setup"}><span>{readiness.buyerOrdering ? "✓" : "!"}</span><strong>Buyer ordering portal</strong><small>{readiness.buyerOrdering ? "Approved buyers can order at /order" : "STRIPE_SECRET_KEY needed — the catalog cannot take an order"}</small></p>
            <p className={readiness.cardPayments ? "ready" : "needs-setup"}><span>{readiness.cardPayments ? "✓" : "!"}</span><strong>Card payments</strong><small>{readiness.cardPayments ? "Stripe card form active on site and app" : "STRIPE_PUBLISHABLE_KEY needed — the card form cannot load"}</small></p>
            <p className={readiness.emailNotifications ? "ready" : "needs-setup"}><span>{readiness.emailNotifications ? "✓" : "!"}</span><strong>Email notifications</strong><small>{readiness.emailNotifications ? "Owner and applicant email active" : "Mail sender needed — decisions are not announced"}</small></p>
            <p className={readiness.orderIntake ? "ready" : "needs-setup"}><span>{readiness.orderIntake ? "✓" : "!"}</span><strong>Order intake</strong><small>{readiness.orderIntake ? "Stripe webhook signed and receiving" : "Stripe webhook secret needed — paid orders will not appear"}</small></p>
            <p className={readiness.shippingLabels ? "ready" : "needs-setup"}><span>{readiness.shippingLabels ? "✓" : "!"}</span><strong>UPS shipping labels</strong><small>{readiness.shippingLabels ? "UPS account connected" : "UPS client id, secret, and account number needed"}</small></p>
          </div>
        </details>

        {/* The shipping queue is its own section. It used to sit inside
            .admin-toolbar — a dark flex bar built for the filter buttons —
            which rendered the whole orders table as dark text on a dark
            background, squashed into a flex row. */}
        <ProductsManager />

        <ShippingQueue />

        <div className="admin-toolbar">
          <div className="admin-filters" aria-label="Filter applications">
            {(["pending", "approved", "declined", "all"] as const).map((option) => (
              <button
                type="button"
                className={filter === option ? "active" : ""}
                onClick={() => setFilter(option)}
                key={option}
              >
                {option === "all" ? "All" : statusLabel(option)}
                <span>{option === "all" ? applications.length : counts[option]}</span>
              </button>
            ))}
          </div>
          <label className="admin-search">
            <span>Search</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Business, contact, city…"
            />
          </label>
        </div>

        <section className="admin-application-list" aria-live="polite">
          {visibleApplications.length === 0 && (
            <div className="admin-empty-state">
              <span>✓</span>
              <h2>{filter === "pending" && !query ? "You’re all caught up." : "No applications found."}</h2>
              <p>{filter === "pending" && !query ? "New wholesale requests will appear here automatically." : "Try another status or search term."}</p>
            </div>
          )}

          {visibleApplications.map((application) => (
            <article className="admin-application-card" key={application.id}>
              <div className="admin-application-summary">
                <div className="admin-business-monogram" aria-hidden="true">
                  {application.businessName.trim().slice(0, 1).toUpperCase()}
                </div>
                <div className="admin-business-name">
                  <div className="admin-badge-row">
                    <span className={`admin-status status-${application.status}`}>{statusLabel(application.status)}</span>
                    <span className={`admin-screening ${application.screeningStatus === "auto_matched" ? "matched" : "review"}`}>
                      {application.screeningStatus === "auto_matched" ? "Auto-matched" : "Check details"}
                    </span>
                    {application.multipleLocations && <span className="admin-location-badge">{application.locationCount} locations</span>}
                  </div>
                  <h2>{application.businessName}</h2>
                  <p>{businessTypeLabels[application.businessType] || application.businessType} · {application.city}, {application.state}</p>
                </div>
                <div className="admin-applied-date">
                  <small>Received</small>
                  <span>{formatDate(application.createdAt)}</span>
                </div>
              </div>

              <div className="admin-application-grid">
                <div>
                  <small>Contact</small>
                  <strong>{application.contactName}</strong>
                  <a href={`mailto:${application.email}`}>{application.email}</a>
                  <a href={`tel:${application.phone}`}>{application.phone}</a>
                </div>
                <div>
                  <small>Primary delivery location</small>
                  <strong>{addressOf(application)}</strong>
                  {application.standardizedAddress && <span>Matched to {application.standardizedAddress}</span>}
                </div>
                <div>
                  <small>Business details</small>
                  <strong>{application.matchedBusiness || "Listing not automatically matched"}</strong>
                  {application.website ? <a href={application.website} target="_blank" rel="noreferrer">Open website / listing ↗</a> : <span>No website provided</span>}
                </div>
                <div>
                  <small>Additional locations</small>
                  <strong>{application.multipleLocations ? `${application.locationCount} total locations` : "Single location"}</strong>
                  <span>{application.additionalMarkets || "No additional cities provided"}</span>
                </div>
              </div>

              <div className="admin-screening-row">
                <span>Address signal: <strong>{application.addressScreening.replaceAll("-", " ")}</strong></span>
                <span>Business signal: <strong>{application.categoryScreening.replaceAll("-", " ")}</strong></span>
              </div>

              {application.status === "approved" && (
                <CreditTerms
                  creditLimitCents={application.creditLimitCents || 0}
                  outstandingCents={initialOutstanding[application.id] || 0}
                  onSave={(cents) => updateApplication(application, application.status, cents)}
                />
              )}
              {application.status === "approved" && (
                <ExclusivePricing
                  applicationId={application.id}
                  businessName={application.businessName}
                />
              )}
              {application.status === "approved" && (
                <DeliveryLocations
                  applicationId={application.id}
                  primaryLabel={`${application.street}${application.street2 ? ", " + application.street2 : ""} · ${application.city}, ${application.state} ${application.zip}`}
                />
              )}
              {application.status === "approved" && (
                <div className="admin-store-status store-synced">
                  <span aria-hidden="true">✓</span>
                  <p>
                    <strong>Private catalog ready</strong>
                    This buyer can sign in and order by the case. Approval is all
                    that is required — there is no store connection to wait on.
                  </p>
                </div>
              )}

              <label className="admin-notes">
                <span>Private owner notes</span>
                <textarea
                  value={notes[application.id] || ""}
                  onChange={(event) => setNotes((current) => ({ ...current, [application.id]: event.target.value }))}
                  placeholder="Add order needs, follow-up details, or a reason for your decision…"
                  maxLength={2000}
                />
              </label>

              {errors[application.id] && <p className="admin-error" role="alert">{errors[application.id]}</p>}

              <div className="admin-card-actions">
                <div>
                  <a href={`mailto:${application.email}?subject=${encodeURIComponent("Dallas Bakery wholesale account")}`}>Email customer</a>
                  <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addressOf(application))}`} target="_blank" rel="noreferrer">Open map ↗</a>
                </div>
                <div>
                  <button
                    type="button"
                    className="admin-action-reset"
                    disabled={savingId === application.id}
                    onClick={() => updateApplication(application, application.status)}
                  >{savingId === application.id ? "Saving…" : "Save notes"}</button>
                  {application.status !== "declined" && (
                    <button
                      type="button"
                      className="admin-action-decline"
                      disabled={savingId === application.id}
                      onClick={() => confirmDecision(application, "declined")}
                    >Decline</button>
                  )}
                  {application.status !== "pending" && (
                    <button
                      type="button"
                      className="admin-action-reset"
                      disabled={savingId === application.id}
                      onClick={() => confirmDecision(application, "pending")}
                    >Move to pending</button>
                  )}
                  {application.status !== "approved" && (
                    <button
                      type="button"
                      className="admin-action-approve"
                      disabled={savingId === application.id}
                      onClick={() => confirmDecision(application, "approved")}
                    >{savingId === application.id ? "Saving…" : "Approve account"}</button>
                  )}
                  {application.status === "approved" && (
                    <span className="admin-approved-message">✓ Account approved</span>
                  )}
                </div>
              </div>
            </article>
          ))}
        </section>
      </section>
    </main>
  );
}
