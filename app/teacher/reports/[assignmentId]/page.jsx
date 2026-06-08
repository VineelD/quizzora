import Link from "next/link";
import LogoutButton from "../../../../components/LogoutButton.jsx";
import SessionIdentityBadge from "../../../../components/SessionIdentityBadge.jsx";
import QuestionExplanation from "../../../../components/QuestionExplanation.jsx";
import QuestionVisual from "../../../../components/QuestionVisual.jsx";
import StudyCoachMarkdown from "../../../../components/StudyCoachMarkdown.jsx";
import { EDUCATOR_ROLES, requireSession } from "../../../../lib/auth.js";
import { isSudokuAssignment } from "../../../../lib/assignment-categories.js";
import { getAssignmentReport } from "../../../../lib/db.js";
import { enrichStoredQuizImages } from "../../../../lib/images.js";

export const maxDuration = 120;

function formatSudokuTime(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function sudokuScoreLabel(student) {
  if (!student.submitted_at) {
    return "-";
  }
  const time = formatSudokuTime(student.sudokuSubmission?.elapsedSeconds || 0);
  const mistakes = student.sudokuSubmission?.mistakes || 0;
  return `Completed (${time}, ${mistakes} mistakes)`;
}

export default async function TeacherReportPage({ params }) {
  const teacher = await requireSession(EDUCATOR_ROLES);
  const { assignmentId } = await params;
  const reportRow = getAssignmentReport(teacher.id, Number(assignmentId));
  const report = reportRow
    ? {
        ...reportRow,
        questions: await enrichStoredQuizImages(reportRow.id, reportRow.questions),
      }
    : null;

  if (!report) {
    return (
      <main className="shell">
        <section className="panel">
          <h1>Report not found</h1>
          <Link className="button secondary" href="/teacher">
            Back to teacher portal
          </Link>
        </section>
      </main>
    );
  }

  const isSudoku = isSudokuAssignment(report);
  const submitted = report.students.filter((student) => student.submitted_at).length;
  const quizQuestions = Array.isArray(report.questions) ? report.questions : [];
  const clarityNeedsReview = quizQuestions.some((question) => question?.clarityReview?.needsReview);
  const diagramNotes = quizQuestions
    .map((question, index) => {
      if (question?.imageSkipped) {
        return `Question ${index + 1}: diagram skipped — ${question.imageError || "not generated"}`;
      }
      if (question?.imageError && !question?.imageUrl?.trim()) {
        return `Question ${index + 1}: diagram unavailable — ${question.imageError}`;
      }
      return "";
    })
    .filter(Boolean);

  return (
    <main className="shell">
      <nav className="nav">
        <Link className="brand" href="/teacher">
          <span className="brand-mark">R</span>
          <span>{isSudoku ? "Sudoku report" : "Quiz report"}</span>
        </Link>
        <div className="row">
          <SessionIdentityBadge user={teacher} />
          <LogoutButton />
        </div>
      </nav>

      <section className="panel">
        <p className="eyebrow">Teacher report</p>
        <h1 className="page-title">{report.title}</h1>
        <div className="row">
          <span className="tag">{report.class_name}</span>
          <span className="tag">{report.subject}</span>
          <span className="tag">{report.focus}</span>
          <span className="tag">
            {submitted}/{report.students.length} submitted
          </span>
          <a className="button secondary" href={`/api/teacher/assignments/${assignmentId}/export`}>
            Export CSV
          </a>
        </div>
        {isSudoku ? <p className="hero-copy">{report.curriculum_summary}</p> : null}
        {!isSudoku && clarityNeedsReview ? (
          <p className="message quiz-review-notice" role="status">
            Some questions may confuse students — review the question guide below before reusing this quiz.
          </p>
        ) : null}
        {!isSudoku && diagramNotes.length > 0 ? (
          <div className="message quiz-diagram-report" role="status">
            <p>Diagram notes:</p>
            <ul>
              {diagramNotes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      <section className="panel">
        <h2 className="section-title">Student marks</h2>
        <div className="table-wrap">
          <table className="table table-stacked">
            <thead>
              <tr>
                <th>Student</th>
                <th>Status</th>
                <th>{isSudoku ? "Result" : "Score"}</th>
                <th>Submitted</th>
              </tr>
            </thead>
            <tbody>
              {report.students.map((student) => (
                <tr key={student.id}>
                  <td data-label="Student">
                    <strong>{student.name}</strong>
                    <br />
                    <span className="muted">{student.email}</span>
                  </td>
                  <td data-label="Status">{student.status}</td>
                  <td data-label={isSudoku ? "Result" : "Score"}>
                    {isSudoku
                      ? sudokuScoreLabel(student)
                      : student.percent === null
                        ? "-"
                        : `${student.score}/${student.total} (${student.percent}%)`}
                  </td>
                  <td data-label="Submitted">{student.submitted_at || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {!isSudoku && quizQuestions.length > 0 ? (
        <section className="panel">
          <h2 className="section-title">Question guide</h2>
          <div className="grid">
            {quizQuestions.map((question, index) => (
              <article className="question-card" key={question.question}>
                <h3 className="panel-title">
                  Question {index + 1}
                  {question?.clarityReview?.needsReview ? (
                    <span className="tag warning-tag">Needs review</span>
                  ) : null}
                </h3>
                <QuestionVisual question={question} showDiagramStatus />
                <StudyCoachMarkdown className="study-markdown quiz-question-markdown" variant="quiz">
                  {question.question}
                </StudyCoachMarkdown>
                <div className="row quiz-answer-row">
                  <span className="tag success-tag">Answer:</span>
                  <StudyCoachMarkdown className="study-markdown quiz-answer-markdown" variant="quiz">
                    {question.answer}
                  </StudyCoachMarkdown>
                </div>
                <QuestionExplanation explanation={question.explanation} />
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}
