import Link from "next/link";
import LogoutButton from "../../components/LogoutButton.jsx";
import SessionIdentityBadge from "../../components/SessionIdentityBadge.jsx";
import ClassDashboard from "../../components/ClassDashboard.jsx";
import QuizBank from "../../components/QuizBank.jsx";
import QuizCreator from "../../components/QuizCreator.jsx";
import MasteryTrendsPanel from "../../components/MasteryTrendsPanel.jsx";
import SiteFooter from "../../components/SiteFooter.jsx";
import StudentManager from "../../components/StudentManager.jsx";
import SubscriptionBanner from "../../components/SubscriptionBanner.jsx";
import { EDUCATOR_ROLES, requireSession } from "../../lib/auth.js";
import { getSchoolSubscription, serializeSubscriptionForClient } from "../../lib/billing-enforcement.js";
import { getSubjectNames, getYearLevels, getCurriculumPickerTree } from "../../lib/curriculum.js";
import {
  getTeacherAssignments,
  getTeacherClassDashboard,
  getTeacherClasses,
  getTeacherStudents,
  listTeacherQuizzes,
} from "../../lib/db.js";

export default async function TeacherPage() {
  const teacher = await requireSession(EDUCATOR_ROLES);
  const subscription = teacher.school_id ? getSchoolSubscription(teacher.school_id) : null;
  const clientSubscription = serializeSubscriptionForClient(subscription);
  const classDashboard = getTeacherClassDashboard(teacher.id);
  const classes = getTeacherClasses(teacher.id);
  const students = getTeacherStudents(teacher.id);
  const quizLibrary = listTeacherQuizzes(teacher.id);
  const assignments = getTeacherAssignments(teacher.id);
  const assignedCount = assignments.length;
  const submittedCount = assignments.reduce((total, item) => total + item.submitted_count, 0);
  const studentSlots = assignments.reduce((total, item) => total + item.student_count, 0);

  return (
    <main className="shell" id="main-content">
      <nav className="nav">
        <Link className="brand" href="/teacher">
          <span className="brand-mark">T</span>
          <span>Educator Console</span>
        </Link>
        <div className="row">
          <SessionIdentityBadge user={teacher} />
          <Link className="button secondary" href="/help">
            Support
          </Link>
          <LogoutButton />
        </div>
      </nav>

      <SubscriptionBanner subscription={subscription} />

      <section className="panel">
        <p className="eyebrow">Teaching dashboard</p>
        <h1 className="page-title">Welcome, {teacher.name}.</h1>
        {teacher.role === "admin" ? (
          <p className="muted">
            You are viewing the educator console as school administrator. Teachers at your school use the same
            console with their own accounts.
          </p>
        ) : null}
        <div className="grid-3">
          <div className="metric">
            <strong>{classDashboard.length}</strong>
            <span>Year groups</span>
          </div>
          <div className="metric">
            <strong>{assignedCount}</strong>
            <span>Assigned quizzes</span>
          </div>
          <div className="metric">
            <strong>{studentSlots ? Math.round((submittedCount / studentSlots) * 100) : 0}%</strong>
            <span>Completion rate</span>
          </div>
        </div>
      </section>

      <ClassDashboard classes={classDashboard} />

      <StudentManager yearLevels={getYearLevels()} students={students} />

      <QuizCreator
        subjects={getSubjectNames()}
        curriculumTree={getCurriculumPickerTree()}
        subscription={clientSubscription}
      />

      <QuizBank quizzes={quizLibrary} yearLevels={getYearLevels()} />

      <MasteryTrendsPanel classes={classes} students={students} />

      <section className="panel">
        <div className="row between">
          <div>
            <p className="eyebrow">Reports</p>
            <h2 className="section-title">Class quiz status</h2>
          </div>
        </div>

        <div className="table-wrap">
          <table className="table table-stacked">
            <thead>
              <tr>
                <th>Quiz</th>
                <th>Year group</th>
                <th>Submitted</th>
                <th>Average</th>
                <th>Report</th>
              </tr>
            </thead>
            <tbody>
              {assignments.map((assignment) => (
                <tr key={assignment.assignment_id}>
                  <td data-label="Quiz">
                    <strong>{assignment.title}</strong>
                    <br />
                    <span className="muted">{assignment.source}</span>
                  </td>
                  <td data-label="Year group">{assignment.class_name}</td>
                  <td data-label="Submitted">
                    {assignment.submitted_count}/{assignment.student_count}
                  </td>
                  <td data-label="Average">{assignment.average_percent}%</td>
                  <td data-label="Report">
                    <Link className="button secondary" href={`/teacher/reports/${assignment.assignment_id}`}>
                      Open
                    </Link>
                  </td>
                </tr>
              ))}
              {assignments.length === 0 ? (
                <tr>
                  <td colSpan="5" data-label="">
                    No quizzes assigned yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
