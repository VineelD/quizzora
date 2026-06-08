"use client";

import { useState } from "react";
import StudentQuizForm from "./StudentQuizForm.jsx";
import StudentStudyCoach from "./StudentStudyCoach.jsx";
import StudentStudyFiles from "./StudentStudyFiles.jsx";

export default function StudentAssignmentWorkspace({
  assignment,
  studyRequired,
  initialUnlocked,
  allowResumeAfterSubmit = false,
  quizSubmitted = false,
}) {
  const showLearn = studyRequired || allowResumeAfterSubmit;
  const defaultTab = showLearn && (studyRequired ? !initialUnlocked : true) ? "learn" : "quiz";
  const [activeTab, setActiveTab] = useState(defaultTab);
  const [quizUnlocked, setQuizUnlocked] = useState(!studyRequired || initialUnlocked || quizSubmitted);
  const [filesRefreshToken, setFilesRefreshToken] = useState(0);

  if (!showLearn) {
    return <StudentQuizForm assignment={assignment} />;
  }

  return (
    <div className="assignment-workspace">
      <div className="assignment-tabs row" role="tablist" aria-label="Assignment steps">
        <button
          aria-selected={activeTab === "learn"}
          className={`button ${activeTab === "learn" ? "primary" : "secondary"}`}
          onClick={() => setActiveTab("learn")}
          role="tab"
          type="button"
        >
          Learn
        </button>
        <button
          aria-selected={activeTab === "files"}
          className={`button ${activeTab === "files" ? "primary" : "secondary"}`}
          onClick={() => setActiveTab("files")}
          role="tab"
          type="button"
        >
          Files
        </button>
        <button
          aria-selected={activeTab === "quiz"}
          className={`button ${activeTab === "quiz" ? "primary" : "secondary"}`}
          disabled={!quizUnlocked && !quizSubmitted}
          onClick={() => setActiveTab("quiz")}
          role="tab"
          type="button"
        >
          {quizSubmitted ? "Quiz" : quizUnlocked ? "Quiz" : "Quiz (locked)"}
        </button>
      </div>

      <div className={activeTab === "learn" ? undefined : "hidden"}>
        <StudentStudyCoach
          assignmentId={assignment.assignment_id}
          learningIntentions={assignment.learningIntentions || []}
          quizSubmitted={quizSubmitted}
          onStudyFileSaved={() => setFilesRefreshToken((current) => current + 1)}
          onUnlocked={() => {
            if (!quizSubmitted) {
              setQuizUnlocked(true);
              setActiveTab("quiz");
            }
          }}
        />
      </div>
      <div className={activeTab === "files" ? undefined : "hidden"}>
        <StudentStudyFiles
          assignmentId={assignment.assignment_id}
          refreshToken={filesRefreshToken}
        />
      </div>
      {activeTab === "quiz" && quizSubmitted ? (
        <section className="panel">
          <p className="hero-copy">You already submitted this quiz. Scroll down to review your results, or return to Learn to continue your Study Coach conversation.</p>
        </section>
      ) : activeTab === "quiz" && quizUnlocked ? (
        <StudentQuizForm assignment={assignment} />
      ) : activeTab === "quiz" ? (
        <section className="panel">
          <p className="hero-copy">Complete Study Coach to unlock the quiz.</p>
        </section>
      ) : null}
    </div>
  );
}
