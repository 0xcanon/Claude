"use client";

import { FormEvent, useState } from "react";

export default function LoginForm() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const form = new FormData(event.currentTarget);

    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: String(form.get("email") || ""),
          password: String(form.get("password") || ""),
        }),
      });
      const data = (await response.json()) as {
        ok?: boolean;
        requiresPasswordChange?: boolean;
        error?: string;
      };
      if (!response.ok || !data.ok) throw new Error(data.error || "Sign in failed.");
      window.location.assign(data.requiresPasswordChange ? "/admin/change-password" : "/admin");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Sign in failed.");
      setLoading(false);
    }
  }

  return (
    <form className="admin-login-form" onSubmit={signIn}>
      <p className="admin-kicker">Welcome back</p>
      <h2>Sign in to approvals.</h2>
      <p>Use the private owner credentials for Dallas Bakery Wholesale.</p>
      <label>
        Owner email
        <input name="email" type="email" autoComplete="username" defaultValue="sales@dallasbakery.com" required />
      </label>
      <label>
        Password
        <input name="password" type="password" autoComplete="current-password" placeholder="Your private password" required />
      </label>
      {error && <p className="admin-login-error" role="alert">{error}</p>}
      <button type="submit" disabled={loading}>
        {loading ? "Signing in…" : "Open owner portal"}<span aria-hidden="true">→</span>
      </button>
      <small>Five failed attempts temporarily lock sign-in for 15 minutes.</small>
    </form>
  );
}
