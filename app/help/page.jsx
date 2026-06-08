import Link from "next/link";
import LogoutButton from "../../components/LogoutButton.jsx";
import SessionIdentityBadge from "../../components/SessionIdentityBadge.jsx";
import SiteFooter from "../../components/SiteFooter.jsx";
import SupportHelpPanel from "../../components/SupportHelpPanel.jsx";
import { homePathForRole, requireSession } from "../../lib/auth.js";

export default async function HelpPage() {
  const user = await requireSession(["admin", "teacher", "student", "parent"], { skipBilling: true });
  const homeHref = homePathForRole(user.role);

  return (
    <main className="shell" id="main-content">
      <nav className="nav">
        <Link className="brand" href={homeHref}>
          <span className="brand-mark" aria-hidden="true">
            <img className="brand-logo" src="/brand/quizzora-logo.svg" alt="" width="28" height="28" />
          </span>
          <span>Help &amp; support</span>
        </Link>
        <div className="row">
          <SessionIdentityBadge user={user} />
          <Link className="button secondary" href={homeHref}>
            Back to dashboard
          </Link>
          <LogoutButton />
        </div>
      </nav>

      <section className="panel">
        <p className="eyebrow">Support</p>
        <h1>Get help without leaving the portal</h1>
        <p className="hero-copy">
          Lodge a ticket when something is blocking your school or family workspace. Support staff can see your account
          context and reply
          here.
        </p>
      </section>

      <SupportHelpPanel />

      <SiteFooter />
    </main>
  );
}
