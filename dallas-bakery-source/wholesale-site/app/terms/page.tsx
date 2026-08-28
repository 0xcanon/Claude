import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Wholesale Terms | Dallas Bakery",
  description: "Terms for Dallas Bakery wholesale account requests and ordering.",
  alternates: { canonical: "https://dallasbakery.net/terms" },
};

function GrainMark() {
  return <svg aria-hidden="true" viewBox="0 0 48 48" fill="none"><path d="M24 42V12m0 7c-6-1-9-5-9-10 6 1 9 5 9 10Zm0 8c-6-1-10-5-10-10 6 1 10 5 10 10Zm0 8c-6-1-10-5-10-10 6 1 10 5 10 10Zm0-16c6-1 9-5 9-10-6 1-9 5-9 10Zm0 8c6-1 10-5 10-10-6 1-10 5-10 10Zm0 8c6-1 10-5 10-10-6 1-10 5-10 10Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

export default function TermsPage() {
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
        <h1>Wholesale terms.</h1>
        <p>These terms apply to requests for Dallas Bakery wholesale access. Order-specific pricing and conditions shown in an approved buyer account also apply.</p>

        <section>
          <h2>Business eligibility</h2>
          <p>Wholesale access is intended for legitimate commercial food businesses, hospitality operators, institutions, and food distributors. Information submitted must be accurate and authorized by the business. An application does not guarantee approval.</p>
        </section>
        <section>
          <h2>Approved delivery locations</h2>
          <p>Wholesale delivery is limited to approved business locations saved to the company account. Additional storefronts may be added after Dallas Bakery receives and approves each location’s information.</p>
        </section>
        <section>
          <h2>Pricing and orders</h2>
          <p>Wholesale pricing is private and may depend on product, quantity, destination, freight, taxes, and account terms. An order is accepted only when confirmed through the ordering system or in writing by Dallas Bakery. Availability and fulfillment timing may change.</p>
        </section>
        <section>
          <h2>Account use</h2>
          <p>Keep account credentials secure and notify Dallas Bakery promptly of unauthorized use. Wholesale access may be suspended or closed for inaccurate information, misuse, nonpayment, or activity inconsistent with these terms.</p>
        </section>
        <section>
          <h2>Questions</h2>
          <p>For account or order questions, contact <a href="mailto:sales@dallasbakery.com">sales@dallasbakery.com</a> or call <a href="tel:+14697294706">(469) 729-4706</a>.</p>
        </section>
      </article>
    </main>
  );
}
