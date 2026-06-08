/** Per-question time limits (seconds) by question style. */
export const TIME_BY_QUESTION_STYLE = {
  "multiple-choice": 60,
  worded: 180,
  mixed: 120,
};

/** Minimum time when difficulty is extension (seconds). */
export const TIME_EXTENSION_MIN_SECONDS = 240;

export const ABSOLUTE_MAX_QUESTIONS_PER_QUIZ = 100;
export const MIN_QUESTIONS_PER_QUIZ = 1;

/**
 * Compute per-question time limit from style and difficulty.
 * @param {{ questionStyle?: string, difficulty?: string, question?: object }} options
 */
export function computeQuestionTimeLimitSeconds({ questionStyle = "worded", difficulty = "mixed" } = {}) {
  const style = String(questionStyle || "worded").toLowerCase();
  let seconds = TIME_BY_QUESTION_STYLE[style] ?? TIME_BY_QUESTION_STYLE.worded;

  if (String(difficulty || "").toLowerCase() === "extension") {
    seconds = Math.max(seconds, TIME_EXTENSION_MIN_SECONDS);
  }

  return seconds;
}

/**
 * Attach timeLimitSeconds to each question; preserve existing values.
 */
export function applyTimingToQuestions(questions, { questionStyle = "worded", difficulty = "mixed" } = {}) {
  if (!Array.isArray(questions)) {
    return [];
  }

  return questions.map((question) => {
    const existing = Number(question?.timeLimitSeconds);
    const timeLimitSeconds =
      Number.isFinite(existing) && existing > 0
        ? Math.round(existing)
        : computeQuestionTimeLimitSeconds({ questionStyle, difficulty });

    return {
      ...question,
      timeLimitSeconds,
    };
  });
}

/**
 * Sum of per-question limits (default overall cap when not explicitly set).
 */
export function computeOverallTimeLimitSeconds(questions) {
  if (!Array.isArray(questions) || !questions.length) {
    return 0;
  }

  return questions.reduce((total, question) => {
    const limit = Number(question?.timeLimitSeconds);
    return total + (Number.isFinite(limit) && limit > 0 ? limit : computeQuestionTimeLimitSeconds());
  }, 0);
}

export function formatTimerDisplay(totalSeconds) {
  const safe = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
