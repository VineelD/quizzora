import Link from "next/link";
import LogoutButton from "../../components/LogoutButton.jsx";
import SessionIdentityBadge from "../../components/SessionIdentityBadge.jsx";
import SiteFooter from "../../components/SiteFooter.jsx";
import SuperAdminConsole from "../../components/SuperAdminConsole.jsx";
import SuperAdminCurriculumDocs from "../../components/SuperAdminCurriculumDocs.jsx";
import SuperAdminQuestionBank from "../../components/SuperAdminQuestionBank.jsx";
import SuperAdminStudyCoachTest from "../../components/SuperAdminStudyCoachTest.jsx";
import { requireSession } from "../../lib/auth.js";

export default async function SuperAdminPage() {
  const user = await requireSession("superadmin", { skipBilling: true });

  return (
    <main className="shell" id="main-content">
      <nav className="nav">
        <Link className="brand" href="/superadmin">
          <span className="brand-mark" aria-hidden="true">
            <img className="brand-logo" src="/brand/quizzora-logo.svg" alt="" width="28" height="28" />
          </span>
          <span>Super admin</span>
        </Link>
        <div className="row">
          <SessionIdentityBadge user={user} />
          <Link className="button secondary" href="/support">
            Support desk
          </Link>
          <LogoutButton />
        </div>
      </nav>

      <section className="panel">
        <p className="eyebrow">Platform operator</p>
        <h1>Cross-school access</h1>
        <p className="hero-copy">
          View every school and user account on the platform. Create, edit, or delete any admin, teacher, student, or
          support account. School admins and teachers still only see their own tenant.
        </p>
      </section>

      <SuperAdminQuestionBank />

      <SuperAdminCurriculumDocs />

      <SuperAdminStudyCoachTest />

      <SuperAdminConsole />

      <SiteFooter />
    </main>
  );
}
