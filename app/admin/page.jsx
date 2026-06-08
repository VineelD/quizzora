import Link from "next/link";
import AdminConsole from "../../components/AdminConsole.jsx";
import AdminOnboarding from "../../components/AdminOnboarding.jsx";
import AuditLogViewer from "../../components/AuditLogViewer.jsx";
import LogoutButton from "../../components/LogoutButton.jsx";
import SessionIdentityBadge from "../../components/SessionIdentityBadge.jsx";
import SchoolDataExport from "../../components/SchoolDataExport.jsx";
import SiteFooter from "../../components/SiteFooter.jsx";
import { getAdminOnboardingSnapshot } from "../../lib/admin-onboarding.js";
import { listAuditLogsForSchool, countAuditLogsForSchool } from "../../lib/audit.js";
import { requireSession } from "../../lib/auth.js";
import { getSchoolById, listSchoolTeachers } from "../../lib/db.js";
export default async function AdminPage() {
  const admin = await requireSession("admin");
  const school = getSchoolById(admin.school_id);
  const teachers = listSchoolTeachers(admin.school_id);
  const auditLogs = listAuditLogsForSchool(admin.school_id, { limit: 50 });
  const auditTotal = countAuditLogsForSchool(admin.school_id);
  const onboarding = getAdminOnboardingSnapshot(admin.school_id);

  return (
    <main className="shell" id="main-content">
      <nav className="nav">
        <Link className="brand" href="/admin">
          <span className="brand-mark" aria-hidden="true">
            <img className="brand-logo" src="/brand/quizzora-logo.svg" alt="" width="28" height="28" />
          </span>
          <span>School admin</span>
        </Link>
        <div className="row">
          <SessionIdentityBadge user={admin} />
          <Link className="button secondary" href="/help">
            Support
          </Link>
          <Link className="button secondary" href="/teacher">
            Teacher view
          </Link>
          <LogoutButton />
        </div>
      </nav>

      <section className="panel">
        <p className="eyebrow">Administration</p>
        <h1 className="page-title">{school?.name || "Your school"}</h1>
        <p className="page-lead">
          Manage teachers, billing, and school data. Teachers use the educator console for day-to-day classes.
        </p>
      </section>

      <AdminOnboarding snapshot={onboarding} />

      <AdminConsole school={school} teachers={teachers} />

      <SchoolDataExport />

      <AuditLogViewer initialLogs={auditLogs} total={auditTotal} />

      <SiteFooter />
    </main>
  );
}
