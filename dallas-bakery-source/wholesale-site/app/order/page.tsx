import { orderRulesLines } from "../order-rules";
import { OrderPortal } from "./order-portal";
import type { Metadata } from "next";
import Link from "next/link";

import { getWholesaleShippingSettings } from "../shipping-settings";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Wholesale Ordering | Dallas Bakery",
  description: "Approved Dallas Bakery wholesale partners can access private catalogs and secure ordering.",
  alternates: { canonical: "https://dallasbakery.net/order" },
};

function GrainMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 48 48" fill="none">
      <path d="M24 42V12m0 7c-6-1-9-5-9-10 6 1 9 5 9 10Zm0 8c-6-1-10-5-10-10 6 1 10 5 10 10Zm0 8c-6-1-10-5-10-10 6 1 10 5 10 10Zm0-16c6-1 9-5 9-10-6 1-9 5-9 10Zm0 8c6-1 10-5 10-10-6 1-10 5-10 10Zm0 8c6-1 10-5 10-10-6 1-10 5-10 10Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default async function OrderPage() {
  const shipping = await getWholesaleShippingSettings();

  return (
    <main className="order-page">
      <header className="application-header order-header">
        <Link className="brand" href="/" aria-label="Dallas Bakery Wholesale home">
          <span className="brand-mark"><GrainMark /></span>
          <span><strong>DALLAS BAKERY</strong><small>WHOLESALE</small></span>
        </Link>
        <Link className="application-back" href="/">← Back to our bread</Link>
      </header>

      <section className="order-portal-section">
        <OrderPortal />
      </section>

      <section className="order-hero">
        <div className="order-intro">
          <p className="eyebrow eyebrow-light"><span /> Approved partner ordering</p>
          <h1>Your private catalog,<br /><em>built for business.</em></h1>
          <p>
            Approved Dallas Bakery buyers order through a secure business account.
            Your business pricing, saved storefronts, cart, checkout, and order history stay in one place.
          </p>
          <div className="order-actions">
            <Link className="button button-order-light" href="/apply">Not approved yet? Apply <span>→</span></Link>
            <a className="order-text-link" href="mailto:sales@dallasbakery.com">Need account help?</a>
          </div>
          <small className="order-private-note">Wholesale pricing is shown only inside an approved buyer account.</small>
          <ul className="order-rules-list" aria-label="Ordering rules">
            {orderRulesLines().map((line) => <li key={line}>{line}</li>)}
          </ul>
        </div>

        <aside className="order-account-card">
          <span className="order-platform">DALLAS BAKERY WHOLESALE</span>
          <h2>One company.<br />Every store.</h2>
          <ul>
            <li><span>01</span><p><strong>Company account</strong>Keep contacts and order history together.</p></li>
            <li><span>02</span><p><strong>Store locations</strong>Choose the approved delivery location at checkout.</p></li>
            <li><span>03</span><p><strong>Private catalog</strong>See wholesale products and account pricing after sign-in.</p></li>
            <li><span>04</span><p><strong>Card checkout</strong>Pay by card without leaving Dallas Bakery, then track every box.</p></li>
            <li><span>05</span><p><strong>Case shipping</strong>{shipping.formattedRate} per case — one case, one box of {shipping.unitsPerBox} loaves.</p></li>
          </ul>
        </aside>
      </section>

      <section className="order-steps">
        <div>
          <p className="eyebrow"><span /> How access works</p>
          <h2>Simple for real businesses.</h2>
        </div>
        <ol>
          <li><span>1</span><div><strong>Apply once</strong><p>Tell us about your food business and primary storefront.</p></div></li>
          <li><span>2</span><div><strong>Dallas Bakery approves</strong><p>We review the business and prepare the company account.</p></div></li>
          <li><span>3</span><div><strong>Order securely</strong><p>Sign in to see the private catalog and place repeat orders.</p></div></li>
        </ol>
      </section>
    </main>
  );
}
