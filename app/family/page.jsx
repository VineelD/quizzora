import Link from "next/link";
import ClassDashboard from "../../components/ClassDashboard.jsx";
import FamilyConsole from "../../components/FamilyConsole.jsx";
import FamilyStudentManager from "../../components/FamilyStudentManager.jsx";
import LogoutButton from "../../components/LogoutButton.jsx";
import SessionIdentityBadge from "../../components/SessionIdentityBadge.jsx";
import QuizBank from "../../components/QuizBank.jsx";
import QuizCreator from "../../components/QuizCreator.jsx";
import SiteFooter from "../../components/SiteFooter.jsx";
import SubscriptionBanner from "../../components/SubscriptionBanner.jsx";
import { requireSession } from "../../lib/auth.js";
import {
  getFamilySubscription,
  serializeFamilySubscriptionForClient,
} from "../../lib/billing-enforcement.js";
import { getSubjectNames, getYearLevels, getCurriculumPickerTree } from "../../lib/curriculum.js";
import {
  getTeacherAssignments,
  getTeacherClassDashboard,
  listFamilyStudents,
  listTeacherQuizzes,
} from "../../lib/db.js";
import { getFamilyById } from "../../lib/families.js";

export default async function FamilyPage() {
  const parent = await requireSession("parent");
  const family = getFamilyById(parent.family_id);
  const subscription = parent.family_id ? getFamilySubscription(parent.family_id) : null;
  const clientSubscription = serializeFamilySubscriptionForClient(subscription);
  const students = listFamilyStudents(parent.family_id);
  const isOwner = Number(family?.owner_user_id) === Number(parent.id);
  const classDashboard = getTeacherClassDashboard(parent.id);
  const quizLibrary = listTeacherQuizzes(parent.id);
  const assignments = getTeacherAssignments(parent.id);
  const assignedCount = assignments.length;
  const submittedCount = assignments.reduce((total, item) => total + item.submitted_count, 0);
  const studentSlots = assignments.reduce((total, item) => total + item.student_count, 0);

  return (
    <main className="shell" id="main-content">
      <nav className="nav">
        <Link className="brand" href="/family">
          <span className="brand-mark" aria-hidden="true">
            <img className="brand-logo" src="/brand/quizzora-logo.svg" alt="" width="28" height="28" />
          </span>
          <span>Family portal</span>
        </Link>
        <div className="row">
          <SessionIdentityBadge user={parent} />
          <Link className="button secondary" href="/family/billing">
            Billing
          </Link>
          <Link className="button secondary" href="/help">
            Support
          </Link>
          <LogoutButton />
        </div>
      </nav>

      <SubscriptionBanner billingHref="/family/billing" subscription={subscription} tenantLabel="family" />

      <section className="panel">
        <p className="eyebrow">Homeschool &amp; family learning</p>
        <h1 className="page-title">{family?.name || "Your family"}</h1>
        <p className="page-lead">
          Create AI quizzes, assign work to your children, and manage student accounts. The first parent who registers
          is the family administrator and can rotate the family code.
        </p>
        <div className="grid-3">
          <div className="metric">
            <strong>{students.length}</strong>
            <span>Children</span>
          </div>
          <div className="metric">
            <strong>{assignedCount}</strong>
            <span>Assignments</span>
          </div>
          <div className="metric">
            <strong>{submittedCount}</strong>
            <span>Submissions</span>
          </div>
        </div>
      </section>

      {family ? <FamilyConsole family={family} isOwner={isOwner} /> : null}

      <QuizCreator
        subjects={getSubjectNames()}
        curriculumTree={getCurriculumPickerTree()}
        subscription={clientSubscription}
      />

      <QuizBank quizzes={quizLibrary} yearLevels={getYearLevels()} />

      <ClassDashboard classes={classDashboard} />

      <FamilyStudentManager students={students} />

      <SiteFooter />
    </main>
  );
}
