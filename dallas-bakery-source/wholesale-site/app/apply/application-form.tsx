"use client";

import Link from "next/link";

import { orderRulesLines } from "../order-rules";
import { FormEvent, useEffect, useRef, useState } from "react";

type CheckResult = {
  status?: "submitted" | "rejected" | "error";
  message?: string;
  reason?: string;
};

export default function ApplicationForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const startedAt = useRef<number | null>(null);
  const [checking, setChecking] = useState(false);
  const [multipleLocations, setMultipleLocations] = useState(false);
  const [result, setResult] = useState<CheckResult>({});

  useEffect(() => {
    startedAt.current = Date.now();
  }, []);

  async function submitApplication(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setChecking(true);
    setResult({});

    const form = new FormData(event.currentTarget);
    const storeAddress = {
      street: String(form.get("street") || ""),
      street2: String(form.get("street2") || ""),
      city: String(form.get("city") || ""),
      state: String(form.get("state") || ""),
      zip: String(form.get("zip") || ""),
    };

    const payload = {
      contactName: String(form.get("contactName") || ""),
      businessName: String(form.get("businessName") || ""),
      businessType: String(form.get("businessType") || ""),
      email: String(form.get("email") || ""),
      phone: String(form.get("phone") || ""),
      storeAddress,
      shippingAddress: storeAddress,
      website: String(form.get("companySite") || ""),
      multipleLocations,
      locationCount: String(form.get("locationCount") || "1"),
      additionalMarkets: String(form.get("additionalMarkets") || ""),
      privacyAgreement: form.get("privacyAgreement") === "on",
      marketingOptIn: form.get("marketingOptIn") === "on",
      honeypot: String(form.get("companyFax") || ""),
      elapsedMs: startedAt.current ? Date.now() - startedAt.current : 0,
    };

    try {
      const response = await fetch("/api/verify-wholesale-business", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await response.json()) as CheckResult;

      if (!response.ok) {
        setResult({
          status: data.status === "rejected" ? "rejected" : "error",
          message: data.message || "We couldn’t match those details. Please check the information and try again.",
        });
        return;
      }

      setResult(data);
    } catch {
      setResult({
        status: "error",
        message: "We couldn’t prepare your account request right now. Please try again.",
      });
    } finally {
      setChecking(false);
    }
  }

  return (
    <form ref={formRef} className="application-form" onSubmit={submitApplication}>
      <div className="application-fields two-up">
        <label>
          Your name
          <input name="contactName" type="text" autoComplete="name" placeholder="Full name" required />
        </label>
        <label>
          Business name
          <input name="businessName" type="text" autoComplete="organization" placeholder="Name shown at the store" required />
        </label>
      </div>

      <label>
        Business type
        <select name="businessType" defaultValue="" required>
          <option value="" disabled>Select the closest match</option>
          <option value="restaurant">Restaurant or caterer</option>
          <option value="grocery">Grocery or specialty food market</option>
          <option value="hospitality">Hotel or hospitality</option>
          <option value="institution">School, hospital, or institution</option>
          <option value="food-distributor">Food distributor</option>
        </select>
      </label>

      <div className="application-fields two-up">
        <label>
          Business email
          <input name="email" type="email" autoComplete="email" placeholder="you@business.com" required />
        </label>
        <label>
          Phone
          <input name="phone" type="tel" autoComplete="tel" placeholder="(000) 000-0000" required />
        </label>
      </div>

      <div className="form-divider">
        <span>Store address</span>
        <small>Primary delivery location</small>
      </div>

      <label>
        Street address
        <input name="street" type="text" autoComplete="address-line1" placeholder="Business street address" required />
      </label>
      <div className="application-fields address-row">
        <label>
          Suite
          <input name="street2" type="text" autoComplete="address-line2" placeholder="Optional" />
        </label>
        <label>
          City
          <input name="city" type="text" autoComplete="address-level2" placeholder="City" required />
        </label>
        <label>
          State
          <input name="state" type="text" autoComplete="address-level1" placeholder="TX" maxLength={2} required />
        </label>
        <label>
          ZIP
          <input name="zip" type="text" inputMode="numeric" autoComplete="postal-code" placeholder="00000" pattern="[0-9]{5}(-[0-9]{4})?" required />
        </label>
      </div>

      <label>
        Business website or Google listing <span className="optional-label">Optional</span>
        <input name="companySite" type="url" inputMode="url" placeholder="https://" />
      </label>

      <label className="application-check multi-location-toggle">
        <input
          name="multipleLocations"
          type="checkbox"
          checked={multipleLocations}
          onChange={(event) => setMultipleLocations(event.target.checked)}
        />
        <span>We have more than one store location.</span>
      </label>

      {multipleLocations && (
        <div className="application-fields two-up multi-location-fields">
          <label>
            Total locations
            <input name="locationCount" type="number" inputMode="numeric" min={2} max={500} defaultValue={2} required />
          </label>
          <label>
            Other store cities <span className="optional-label">Optional</span>
            <input name="additionalMarkets" type="text" placeholder="Plano, Fort Worth, Austin…" />
          </label>
          <p>After approval, we’ll collect each exact storefront address before adding it as a delivery location.</p>
        </div>
      )}

      <label className="application-check">
        <input name="addressAgreement" type="checkbox" required />
        <span>Save this as our primary wholesale delivery location.</span>
      </label>

      <label className="application-check">
        <input name="privacyAgreement" type="checkbox" required />
        <span>
          I agree to the <Link href="/terms">wholesale terms</Link> and understand how Dallas Bakery handles my information in its <Link href="/privacy">privacy notice</Link>.
        </span>
      </label>

      {/* Optional and unchecked: a marketing list you were opted into is a
          list you resent. The two boxes above are required; this one is not. */}
      <label className="application-check">
        <input name="marketingOptIn" type="checkbox" />
        <span>
          Email me when Dallas Bakery adds a bread or changes wholesale pricing. Order
          confirmations and invoices come either way.
        </span>
      </label>

      <div className="application-rules">
        <strong>How wholesale ordering works</strong>
        <ul>
          {orderRulesLines().map((line) => <li key={line}>{line}</li>)}
        </ul>
      </div>

      <label className="honeypot" aria-hidden="true">
        Fax
        <input name="companyFax" type="text" tabIndex={-1} autoComplete="off" />
      </label>

      <button className="button application-submit" type="submit" disabled={checking || result.status === "submitted"}>
        {checking ? "Preparing your account…" : "Continue wholesale setup"}
        {!checking && <span aria-hidden="true">→</span>}
      </button>

      <div className={`application-result ${result.status || ""}`} role="status" aria-live="polite">
        {result.status === "submitted" && (
          <p><strong>Thank you—your request is in.</strong> We review new accounts by hand and email a decision to the business address you gave us. Approved accounts can order the same day.</p>
        )}
        {result.status === "rejected" && (
          <p><strong>We couldn’t match the business details.</strong> {result.message}</p>
        )}
        {result.status === "error" && (
          <p><strong>Something didn’t go through.</strong> {result.message}</p>
        )}
      </div>
    </form>
  );
}
