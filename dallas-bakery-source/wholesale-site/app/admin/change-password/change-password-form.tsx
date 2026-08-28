"use client";

import { FormEvent, useState } from "react";

export default function ChangePasswordForm() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") || "");
    const confirmation = String(form.get("confirmation") || "");
    if (password !== confirmation) {
      setError("The passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/admin/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !data.ok) throw new Error(data.error || "Password could not be updated.");
      window.location.assign("/admin");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Password could not be updated.");
      setLoading(false);
    }
  }

  return (
    <form className="admin-password-form" onSubmit={changePassword}>
      <label>
        New password
        <input name="password" type="password" autoComplete="new-password" minLength={14} maxLength={128} required />
      </label>
      <label>
        Confirm new password
        <input name="confirmation" type="password" autoComplete="new-password" minLength={14} maxLength={128} required />
      </label>
      <small>Use at least 14 characters with a letter and a number.</small>
      {error && <p className="admin-login-error" role="alert">{error}</p>}
      <button type="submit" disabled={loading}>{loading ? "Saving…" : "Save password & continue"}</button>
    </form>
  );
}
