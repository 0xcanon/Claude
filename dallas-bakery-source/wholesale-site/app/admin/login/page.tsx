import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getAdminAccount, getAdminSession } from "../../admin-auth";
import LoginForm from "./login-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Owner Sign In | Dallas Bakery",
  robots: { index: false, follow: false },
};

function GrainMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 48 48" fill="none">
      <path d="M24 42V12m0 7c-6-1-9-5-9-10 6 1 9 5 9 10Zm0 8c-6-1-10-5-10-10 6 1 10 5 10 10Zm0 8c-6-1-10-5-10-10 6 1 10 5 10 10Zm0-16c6-1 9-5 9-10-6 1-9 5-9 10Zm0 8c6-1 10-5 10-10-6 1-10 5-10 10Zm0 8c6-1 10-5 10-10-6 1-10 5-10 10Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default async function AdminLoginPage() {
  const session = await getAdminSession();
  if (session) {
    const account = await getAdminAccount(session.email);
    redirect(account?.mustChangePassword ? "/admin/change-password" : "/admin");
  }

  return (
    <main className="admin-login-page">
      <section className="admin-login-brand-panel">
        <Link className="brand" href="/" aria-label="Dallas Bakery Wholesale home">
          <span className="brand-mark"><GrainMark /></span>
          <span><strong>DALLAS BAKERY</strong><small>WHOLESALE</small></span>
        </Link>
        <div>
          <p className="admin-kicker">Private owner access</p>
          <h1>Your wholesale desk,<br /><em>all in one place.</em></h1>
          <p>Review new business requests, manage approvals, and keep every location organized.</p>
        </div>
        <small className="admin-login-security">Protected with encrypted credentials, secure cookies, and automatic lockout.</small>
      </section>
      <section className="admin-login-form-panel">
        <div className="admin-login-form-heading">
          <span>Dallas Bakery owner portal</span>
          <Link href="/">Back to website</Link>
        </div>
        <LoginForm />
      </section>
    </main>
  );
}
