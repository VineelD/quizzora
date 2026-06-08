"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { computeQuestionTimeLimitSeconds, computeOverallTimeLimitSeconds } from "../lib/quiz-timing.js";
import { normalizeQuizQuestionsForDisplay } from "../lib/question-display.js";
import { isPlainQuizOptionText, prepareQuizOptionMarkdown } from "../lib/quiz-display-text.js";
import QuestionVisual from "./QuestionVisual.jsx";
import StudyCoachMarkdown from "./StudyCoachMarkdown.jsx";
import { useQuizTimer } from "./useQuizTimer.js";

function QuizOptionMarkdown({ option }) {
  const prepared = prepareQuizOptionMarkdown(option);
  const plain = isPlainQuizOptionText(prepared);

  return (
    <StudyCoachMarkdown
      className="study-markdown quiz-option-markdown"
      plainMode={plain}
      skipPrepare
      variant="quiz"
    >
      {prepared}
    </StudyCoachMarkdown>
  );
}

function QuizQuestionMarkdown({ children, className = "study-markdown quiz-question-markdown" }) {
  return (
    <StudyCoachMarkdown className={className} variant="quiz">
      {children}
    </StudyCoachMarkdown>
  );
}

function resolveQuestionTimeLimit(question, assignment) {
  const fromQuestion = Number(question?.timeLimitSeconds);
  if (Number.isFinite(fromQuestion) && fromQuestion > 0) {
    return fromQuestion;
  }
  return computeQuestionTimeLimitSeconds({
    questionStyle: assignment.question_style || assignment.questionStyle,
    difficulty: assignment.difficulty,
  });
}

function TimedQuizForm({ assignment }) {
  const router = useRouter();
  const questions = useMemo(
    () => normalizeQuizQuestionsForDisplay(assignment.questions),
    [assignment.questions],
  );
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  const [timeSpentMs, setTimeSpentMs] = useState({});
  const [timedOutQuestions, setTimedOutQuestions] = useState({});
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [finished, setFinished] = useState(false);

  const stateRef = useRef({ answers, timeSpentMs, timedOutQuestions, currentIndex, finished, loading });
  stateRef.current = { answers, timeSpentMs, timedOutQuestions, currentIndex, finished, loading };

  const overallTimeLimitSeconds = useMemo(() => {
    const fromAssignment = Number(assignment.overallTimeLimitSeconds ?? assignment.overall_time_limit_seconds);
    if (Number.isFinite(fromAssignment) && fromAssignment > 0) {
      return fromAssignment;
    }
    return computeOverallTimeLimitSeconds(questions);
  }, [assignment, questions]);

  const currentQuestion = questions[currentIndex];
  const questionTimeLimitSeconds = resolveQuestionTimeLimit(currentQuestion, assignment);

  const submitFinal = useCallback(
    async (finalAnswers, finalTimeSpentMs, finalTimedOut, overallElapsedMs) => {
      setLoading(true);
      setMessage("");

      const response = await fetch("/api/student/submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assignmentId: assignment.assignment_id,
          answers: finalAnswers,
          timeSpentMs: finalTimeSpentMs,
          overallElapsedMs,
          timedOutQuestions: finalTimedOut,
        }),
      });
      const payload = await response.json();
      setLoading(false);

      if (!response.ok) {
        setMessage(payload.error || "Could not submit quiz.");
        return;
      }

      setMessage(`Submitted: ${payload.score}/${payload.total}`);
      router.refresh();
    },
    [assignment.assignment_id, router],
  );

  const advanceQuestion = useCallback(
    (nextAnswers, nextTimeSpentMs, nextTimedOut, overallElapsedMs, { forceSubmit = false } = {}) => {
      const index = stateRef.current.currentIndex;
      if (index >= questions.length - 1 || forceSubmit) {
        setFinished(true);
        submitFinal(nextAnswers, nextTimeSpentMs, nextTimedOut, overallElapsedMs);
        return;
      }
      setCurrentIndex((value) => value + 1);
    },
    [questions.length, submitFinal],
  );

  const timerHelpersRef = useRef({
    getQuestionElapsedMs: () => 0,
    getOverallElapsedMs: () => 0,
  });

  const handleQuestionExpire = useCallback(() => {
    const state = stateRef.current;
    if (state.finished || state.loading) {
      return;
    }

    const elapsedMs = timerHelpersRef.current.getQuestionElapsedMs();
    const nextTimedOut = { ...state.timedOutQuestions, [String(state.currentIndex)]: true };
    const nextTimeSpentMs = { ...state.timeSpentMs, [String(state.currentIndex)]: elapsedMs };

    setTimedOutQuestions(nextTimedOut);
    setTimeSpentMs(nextTimeSpentMs);
    advanceQuestion(state.answers, nextTimeSpentMs, nextTimedOut, timerHelpersRef.current.getOverallElapsedMs());
  }, [advanceQuestion]);

  const handleOverallExpire = useCallback(() => {
    const state = stateRef.current;
    if (state.finished || state.loading) {
      return;
    }
    setFinished(true);
    submitFinal(
      state.answers,
      state.timeSpentMs,
      state.timedOutQuestions,
      timerHelpersRef.current.getOverallElapsedMs(),
    );
  }, [submitFinal]);

  const {
    questionDisplay,
    overallDisplay,
    questionProgress,
    overallProgress,
    getQuestionElapsedMs,
    getOverallElapsedMs,
  } = useQuizTimer({
    questionTimeLimitSeconds,
    overallTimeLimitSeconds,
    active: !finished && !loading,
    onQuestionExpire: handleQuestionExpire,
    onOverallExpire: handleOverallExpire,
  });

  useEffect(() => {
    timerHelpersRef.current = { getQuestionElapsedMs, getOverallElapsedMs };
  }, [getQuestionElapsedMs, getOverallElapsedMs]);

  function selectAnswer(option) {
    const state = stateRef.current;
    if (state.finished || state.loading) {
      return;
    }

    const elapsedMs = getQuestionElapsedMs();
    const nextAnswers = { ...state.answers, [String(state.currentIndex)]: option };
    const nextTimeSpentMs = { ...state.timeSpentMs, [String(state.currentIndex)]: elapsedMs };

    setAnswers(nextAnswers);
    setTimeSpentMs(nextTimeSpentMs);
    advanceQuestion(nextAnswers, nextTimeSpentMs, state.timedOutQuestions, getOverallElapsedMs());
  }

  return (
    <form
      className="panel quiz-timed-panel"
      onSubmit={(event) => {
        event.preventDefault();
      }}
    >
      <div className="quiz-timer-header">
        <div className="quiz-timer-block">
          <p className="eyebrow">Time left for this question</p>
          <p className="quiz-timer-value" aria-live="polite">
            {questionDisplay}
          </p>
          <div className="quiz-timer-bar" aria-hidden="true">
            <div className="quiz-timer-bar-fill question" style={{ width: `${questionProgress * 100}%` }} />
          </div>
        </div>
        <div className="quiz-timer-block">
          <p className="eyebrow">
            Time left overall · Question {currentIndex + 1} of {questions.length}
          </p>
          <p className="quiz-timer-value" aria-live="polite">
            {overallDisplay}
          </p>
          <div className="quiz-timer-bar" aria-hidden="true">
            <div className="quiz-timer-bar-fill overall" style={{ width: `${overallProgress * 100}%` }} />
          </div>
        </div>
      </div>

      <fieldset className="question-card quiz-timed-question-card">
        <legend className="quiz-timed-legend">
          Question {currentIndex + 1} of {questions.length}
        </legend>
        <QuestionVisual question={currentQuestion} />
        <QuizQuestionMarkdown className="study-markdown quiz-question-markdown quiz-timed-question-text">
          {currentQuestion.question}
        </QuizQuestionMarkdown>
        <div className="quiz-option-list">
        {currentQuestion.options.map((option) => (
          <label className="row quiz-option-row quiz-timed-option-row" key={option}>
            <input
              checked={answers[String(currentIndex)] === option}
              name={`question-${currentIndex}`}
              onChange={() => selectAnswer(option)}
              type="radio"
              value={option}
            />
            <QuizOptionMarkdown option={option} />
          </label>
        ))}
        </div>
      </fieldset>

      {message ? <div className="message">{message}</div> : null}
      {loading ? <p className="muted">Submitting…</p> : null}
    </form>
  );
}

export default function StudentQuizForm({ assignment }) {
  const router = useRouter();
  const questions = useMemo(
    () => normalizeQuizQuestionsForDisplay(assignment.questions),
    [assignment.questions],
  );
  const [answers, setAnswers] = useState({});
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const timedMode = assignment.timedMode === true;

  if (timedMode && Array.isArray(questions) && questions.length > 0) {
    return <TimedQuizForm assignment={{ ...assignment, questions }} />;
  }

  async function submitQuiz(event) {
    event.preventDefault();
    setLoading(true);
    setMessage("");

    const response = await fetch("/api/student/submissions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assignmentId: assignment.assignment_id, answers }),
    });
    const payload = await response.json();
    setLoading(false);

    if (!response.ok) {
      setMessage(payload.error || "Could not submit quiz.");
      return;
    }

    setMessage(`Submitted: ${payload.score}/${payload.total}`);
    router.refresh();
  }

  return (
    <form className="panel" onSubmit={submitQuiz}>
      <h2 className="section-title">Answer questions</h2>
      <div className="grid">
        {questions.map((question, index) => (
          <fieldset className="question-card" key={question.question}>
            <legend>Question {index + 1}</legend>
            <QuestionVisual question={question} />
            <QuizQuestionMarkdown>{question.question}</QuizQuestionMarkdown>
            {question.options.map((option) => (
              <label className="row quiz-option-row" key={option}>
                <input
                  checked={answers[String(index)] === option}
                  name={`question-${index}`}
                  onChange={() => setAnswers((current) => ({ ...current, [String(index)]: option }))}
                  required
                  type="radio"
                  value={option}
                />
                <QuizOptionMarkdown option={option} />
              </label>
            ))}
          </fieldset>
        ))}
      </div>
      {message ? <div className="message">{message}</div> : null}
      <button className="button primary submit-wide" disabled={loading} type="submit">
        {loading ? "Submitting..." : "Submit quiz"}
      </button>
    </form>
  );
}
