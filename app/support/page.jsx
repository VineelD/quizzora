import Link from "next/link";
import { redirect } from "next/navigation";
import LogoutButton from "../../components/LogoutButton.jsx";
import SessionIdentityBadge from "../../components/SessionIdentityBadge.jsx";
import SiteFooter from "../../components/SiteFooter.jsx";
import SupportConsole from "../../components/SupportConsole.jsx";
import { homePathForRole, isPlatformOperator, requireSession } from "../../lib/auth.js";

export default async function SupportPage() {
  const user = await requireSession(null, { skipBilling: true });
  if (!isPlatformOperator(user)) {
    redirect(homePathForRole(user.role));
  }

  return (
    <main className="shell" id="main-content">
      <nav className="nav">
        <Link className="brand" href="/support">
          <span className="brand-mark" aria-hidden="true">
            <img className="brand-logo" src="/brand/quizzora-logo.svg" alt="" width="28" height="28" />
          </span>
          <span>Support desk</span>
        </Link>
        <div className="row">
          <SessionIdentityBadge user={user} />
          {user.role === "superadmin" ? (
            <Link className="button secondary" href="/superadmin">
              Super admin
            </Link>
          ) : null}
          <LogoutButton />
        </div>
      </nav>

      <section className="panel">
        <p className="eyebrow">Support operations</p>
        <h1 className="page-title">Ticket queue</h1>
        <p className="page-lead">
          Review school issues, assign tickets, change status, and reply to admins, teachers, and students.
        </p>
      </section>

      <SupportConsole />

      <SiteFooter />
    </main>
  );
}
