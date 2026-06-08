import Link from "next/link";
import LogoutButton from "../../components/LogoutButton.jsx";
import SessionIdentityBadge from "../../components/SessionIdentityBadge.jsx";
import { requireSession } from "../../lib/auth.js";
import { isSudokuAssignment } from "../../lib/assignment-categories.js";
import { formatDueLabel, isPastDue } from "../../lib/dates.js";
import { getStudentAssignments } from "../../lib/db.js";

export default async function StudentPage() {
  const student = await requireSession("student");
  const assignments = getStudentAssignments(student.id);
  const submitted = assignments.filter((assignment) => assignment.submitted_at).length;

  return (
    <main className="shell">
      <nav className="nav">
        <Link className="brand" href="/student">
          <span className="brand-mark">S</span>
          <span>Student Portal</span>
        </Link>
        <div className="row">
          <SessionIdentityBadge user={student} />
          <Link className="button secondary" href="/help">
            Support
          </Link>
          <LogoutButton />
        </div>
      </nav>

      <section className="panel">
        <p className="eyebrow">Dashboard</p>
        <h1 className="page-title">Your assigned work.</h1>
        <div className="grid">
          <div className="metric">
            <strong>{assignments.length}</strong>
            <span>Assigned</span>
          </div>
          <div className="metric">
            <strong>{submitted}</strong>
            <span>Submitted</span>
          </div>
        </div>
      </section>

      <section className="panel">
        <h2 className="section-title">Assignments</h2>
        <div className="grid">
          {assignments.map((assignment) => (
            <article className="card" key={assignment.assignment_id}>
              <div className="row">
                <span className="tag">{assignment.class_name}</span>
                <span className="tag">{assignment.subject}</span>
                {assignment.submitted_at && !isSudokuAssignment(assignment) ? (
                  <span className="tag success-tag">{assignment.percent}%</span>
                ) : null}
                {assignment.submitted_at && isSudokuAssignment(assignment) ? (
                  <span className="tag success-tag">Completed</span>
                ) : null}
              </div>
              <h3 className="panel-title">{assignment.title}</h3>
              <p>{assignment.curriculum_summary}</p>
              {assignment.due_at ? (
                <p className="muted">
                  Due {formatDueLabel(assignment.due_at)}
                  {isPastDue(assignment.due_at) && !assignment.submitted_at ? " (past due)" : ""}
                </p>
              ) : null}
              <Link className="button primary" href={`/student/assignments/${assignment.assignment_id}`}>
                {assignment.submitted_at
                  ? "View result"
                  : isSudokuAssignment(assignment)
                    ? "Play Sudoku"
                    : "Start quiz"}
              </Link>
            </article>
          ))}
          {assignments.length === 0 ? <p>No assignments yet.</p> : null}
        </div>
      </section>
    </main>
  );
}
