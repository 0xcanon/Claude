import type { Metadata } from "next";
import Link from "next/link";
import ApplicationForm from "./application-form";

export const metadata: Metadata = {
  title: "Open a Wholesale Account | Dallas Bakery",
  description:
    "Set up a Dallas Bakery wholesale account for business pricing, ordering, and delivery support.",
  alternates: {
    canonical: "https://dallasbakery.net/apply",
  },
};

function GrainMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 48 48" fill="none">
      <path d="M24 42V12m0 7c-6-1-9-5-9-10 6 1 9 5 9 10Zm0 8c-6-1-10-5-10-10 6 1 10 5 10 10Zm0 8c-6-1-10-5-10-10 6 1 10 5 10 10Zm0-16c6-1 9-5 9-10-6 1-9 5-9 10Zm0 8c6-1 10-5 10-10-6 1-10 5-10 10Zm0 8c6-1 10-5 10-10-6 1-10 5-10 10Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function ApplyPage() {
  return (
    <main className="application-page">
      <header className="application-header">
        <Link className="brand" href="/" aria-label="Dallas Bakery Wholesale home">
          <span className="brand-mark"><GrainMark /></span>
          <span>
            <strong>DALLAS BAKERY</strong>
            <small>WHOLESALE</small>
          </span>
        </Link>
        <Link className="application-back" href="/">← Back to our bread</Link>
      </header>

      <div className="application-layout">
        <aside className="application-aside">
          <p className="eyebrow eyebrow-light"><span /> Wholesale partnership</p>
          <h1>Wholesale made<br /><em>simple.</em></h1>
          <p>
            Tell us about your business and primary delivery location so we can
            tailor ordering, delivery, and account support to your needs.
          </p>

          <div className="eligible-card">
            <small>Who we serve</small>
            <div>
              <span>Restaurants &amp; caterers</span>
              <span>Grocers &amp; food markets</span>
              <span>Hotels &amp; hospitality</span>
              <span>Schools &amp; institutions</span>
              <span>Food distributors</span>
            </div>
          </div>

          <div className="privacy-note">
            <span>✓</span>
            <p><strong>One account, every approved location.</strong> Tell us how many storefronts you operate and we’ll keep the setup organized.</p>
          </div>
        </aside>

        <section className="application-panel">
          <div className="application-panel-heading">
            <span>Wholesale account setup</span>
            <strong>About 2 minutes</strong>
          </div>
          <h2>Tell us about your business.</h2>
          <p className="application-intro">
            Your primary store becomes your first delivery location. Have more stores? Tell us how many now; we’ll collect and approve each exact address before delivery.
          </p>
          <ApplicationForm />
        </section>
      </div>
    </main>
  );
}
