import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Notice | Dallas Bakery Wholesale",
  description: "How Dallas Bakery handles wholesale account information.",
  alternates: { canonical: "https://dallasbakery.net/privacy" },
};

function GrainMark() {
  return <svg aria-hidden="true" viewBox="0 0 48 48" fill="none"><path d="M24 42V12m0 7c-6-1-9-5-9-10 6 1 9 5 9 10Zm0 8c-6-1-10-5-10-10 6 1 10 5 10 10Zm0 8c-6-1-10-5-10-10 6 1 10 5 10 10Zm0-16c6-1 9-5 9-10-6 1-9 5-9 10Zm0 8c6-1 10-5 10-10-6 1-10 5-10 10Zm0 8c6-1 10-5 10-10-6 1-10 5-10 10Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

export default function PrivacyPage() {
  return (
    <main className="legal-page">
      <header className="legal-header">
        <Link className="brand" href="/" aria-label="Dallas Bakery Wholesale home">
          <span className="brand-mark"><GrainMark /></span>
          <span><strong>DALLAS BAKERY</strong><small>WHOLESALE</small></span>
        </Link>
        <Link className="application-back" href="/">← Back to website</Link>
      </header>
      <article className="legal-body">
        <p className="eyebrow"><span /> Effective August 25, 2026</p>
        <h1>Privacy notice.</h1>
        <p>This notice explains how Dallas Bakery uses information submitted through its wholesale website and owner tools.</p>

        <section>
          <h2>Information we collect</h2>
          <p>We collect the contact, business, storefront, and delivery-location details you provide, along with account-review notes, approval status, and technical information used to keep the service secure.</p>
        </section>
        <section>
          <h2>How we use it</h2>
          <p>We use this information to confirm wholesale eligibility, review and support your account, create approved company and delivery-location records, fulfill orders, prevent misuse, and communicate about your wholesale relationship.</p>
        </section>
        <section>
          <h2>Service providers</h2>
          <p>Information may be processed by service providers that host the site, validate commercial addresses and business listings, support secure ordering, or otherwise help operate the wholesale program. They receive only the information needed for their role and are subject to their own privacy terms.</p>
        </section>
        <section>
          <h2>Retention and protection</h2>
          <p>We retain records for as long as reasonably needed to evaluate or service an account, meet legal and accounting obligations, resolve disputes, and prevent abuse. We use access controls and encrypted connections, but no online system can be guaranteed completely secure.</p>
        </section>
        <section>
          <h2>Your choices</h2>
          <p>To ask about, correct, or request deletion of wholesale application information, email <a href="mailto:sales@dallasbakery.com">sales@dallasbakery.com</a>. Some records may need to be retained for legal, fraud-prevention, or transaction purposes.</p>
        </section>
      </article>
    </main>
  );
}
