import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAdminAccount, getAdminSession } from "../../admin-auth";
import ChangePasswordForm from "./change-password-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Set Owner Password | Dallas Bakery",
  robots: { index: false, follow: false },
};

export default async function ChangePasswordPage() {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");
  const account = await getAdminAccount(session.email);
  if (!account) redirect("/admin/login");

  return (
    <main className="admin-password-page">
      <section className="admin-password-card">
        <p className="admin-kicker">Dallas Bakery owner portal</p>
        <h1>Choose your private password.</h1>
        <p>Replace the temporary password before opening the approval dashboard.</p>
        <ChangePasswordForm />
        <form action="/api/admin/logout" method="post" className="admin-password-signout">
          <button type="submit">Sign out instead</button>
        </form>
      </section>
    </main>
  );
}
