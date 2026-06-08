import Link from "next/link";
import LogoutButton from "../../../../components/LogoutButton.jsx";
import SessionIdentityBadge from "../../../../components/SessionIdentityBadge.jsx";
import QuestionExplanation from "../../../../components/QuestionExplanation.jsx";
import QuestionVisual from "../../../../components/QuestionVisual.jsx";
import StudyCoachMarkdown from "../../../../components/StudyCoachMarkdown.jsx";
import StudentAssignmentWorkspace from "../../../../components/StudentAssignmentWorkspace.jsx";
import SudokuGame from "../../../../components/SudokuGame.jsx";
import { requireSession } from "../../../../lib/auth.js";
import { isSudokuAssignment } from "../../../../lib/assignment-categories.js";
import AssignmentDueNotice from "../../../../components/AssignmentDueNotice.jsx";
import { canSubmitBeforeDue } from "../../../../lib/dates.js";
import { getStudentAssignment } from "../../../../lib/db.js";
import { enrichStoredQuizImages } from "../../../../lib/images.js";
import { normalizeQuizQuestionsForDisplay } from "../../../../lib/question-display.js";
import { studentFacingFocus } from "../../../../lib/student-display.js";
import {
  getStudySession,
  studyCoachAvailableForAssignment,
  studyCoachRequiredForAssignment,
} from "../../../../lib/study.js";

export const maxDuration = 120;

function formatSudokuTime(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export default async function StudentAssignmentPage({ params }) {
  const student = await requireSession("student");
  const { assignmentId } = await params;
  const assignmentRow = getStudentAssignment(student.id, Number(assignmentId));
  const assignment = assignmentRow
    ? {
        ...assignmentRow,
        questions: normalizeQuizQuestionsForDisplay(
          await enrichStoredQuizImages(assignmentRow.id, assignmentRow.questions),
        ),
      }
    : null;

  if (!assignment) {
    return (
      <main className="shell">
        <section className="panel">
          <h1>Assignment not found</h1>
          <Link className="button secondary" href="/student">
            Back to student portal
          </Link>
        </section>
      </main>
    );
  }

  const isSudoku = isSudokuAssignment(assignment);
  const sudoku = isSudoku ? assignment.questions : null;
  const canSubmit = canSubmitBeforeDue({
    dueAt: assignment.due_at,
    allowLate: assignment.allow_late !== 0,
  });
  const studyAvailable = studyCoachAvailableForAssignment(assignment);
  const studyRequired = studyCoachRequiredForAssignment(assignment);
  const studySession = studyAvailable ? getStudySession(student.id, assignment.assignment_id) : null;
  const displayFocus = studentFacingFocus(assignment.focus, assignment.title);

  return (
    <main className="shell">
      <nav className="nav">
        <Link className="brand" href="/student">
          <span className="brand-mark">Q</span>
          <span>{isSudoku ? "Sudoku" : "Quiz"}</span>
        </Link>
        <div className="row">
          <SessionIdentityBadge user={student} />
          <LogoutButton />
        </div>
      </nav>

      <section className="panel">
        <p className="eyebrow">{isSudoku ? "Student Sudoku" : "Student quiz"}</p>
        <h1 className="page-title">{assignment.title}</h1>
        <div className="row">
          <span className="tag">{assignment.class_name}</span>
          <span className="tag">{assignment.year_level}</span>
          {isSudoku ? <span className="tag">{sudoku?.difficulty}</span> : <span className="tag">{displayFocus}</span>}
        </div>
        <p className="page-lead">{assignment.curriculum_summary}</p>
        <AssignmentDueNotice assignment={assignment} />
      </section>

      {assignment.submitted_at && studyAvailable ? (
        <StudentAssignmentWorkspace
          allowResumeAfterSubmit
          assignment={assignment}
          initialUnlocked
          quizSubmitted
          studyRequired={false}
        />
      ) : null}

      {assignment.submitted_at ? (
        <section className="panel">
          <h2 className="section-title">Result</h2>
          {isSudoku ? (
            <p className="hero-copy">
              Completed in {formatSudokuTime(assignment.submission?.elapsedSeconds || 0)} with{" "}
              {assignment.submission?.mistakes || 0} mistake
              {(assignment.submission?.mistakes || 0) === 1 ? "" : "s"}.
            </p>
          ) : (
            <p className="hero-copy">
              You scored {assignment.score}/{assignment.total} ({assignment.percent}%).
            </p>
          )}
          {isSudoku && assignment.submission?.grid ? (
            <SudokuGame
              assignmentId={assignment.assignment_id}
              initialGrid={assignment.submission.grid}
              puzzle={sudoku.puzzle}
              readOnly
            />
          ) : (
            <div className="grid">
              {Array.isArray(assignment.questions)
                ? assignment.questions.map((question, index) => (
                    <article className="question-card" key={question.question}>
                      <h3 className="panel-title">Question {index + 1}</h3>
                      <QuestionVisual question={question} />
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
                  ))
                : null}
            </div>
          )}
        </section>
      ) : !canSubmit ? (
        <section className="panel">
          <p className="hero-copy">This assignment is closed. Contact your teacher if you need an extension.</p>
        </section>
      ) : isSudoku && sudoku?.puzzle ? (
        <SudokuGame assignmentId={assignment.assignment_id} puzzle={sudoku.puzzle} />
      ) : (
        <StudentAssignmentWorkspace
          assignment={assignment}
          initialUnlocked={studySession?.progress?.unlocked ?? !studyRequired}
          studyRequired={studyRequired}
          quizSubmitted={false}
        />
      )}
    </main>
  );
}
