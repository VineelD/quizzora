import { normalizeYearLevel } from "./year-levels.js";
import { getMaxQuestionsPerQuizForPlan } from "./plans.js";
import { distributeQuestionCounts, resolveTopicSelectionFromBody } from "./quiz-distribution.js";
import {
  ABSOLUTE_MAX_QUESTIONS_PER_QUIZ,
  MIN_QUESTIONS_PER_QUIZ,
} from "./quiz-timing.js";

export function clampQuestionCount(rawCount, { maxQuestionsPerQuiz = ABSOLUTE_MAX_QUESTIONS_PER_QUIZ } = {}) {
  const planCap = Math.max(MIN_QUESTIONS_PER_QUIZ, Math.min(ABSOLUTE_MAX_QUESTIONS_PER_QUIZ, maxQuestionsPerQuiz));
  const requested = Number(rawCount || 5);
  const clamped = Math.min(Math.max(requested, MIN_QUESTIONS_PER_QUIZ), planCap);
  return {
    questionCount: clamped,
    wasClamped: clamped !== requested,
    requested,
    planCap,
  };
}

/**
 * Parse quiz creation payload (backward compatible with single focus string).
 * @param {object} body
 * @param {{ subscription?: object | null, maxQuestionsPerQuiz?: number }} [options]
 */
export function parseQuizRequestFromBody(body, options = {}) {
  const yearLevel = normalizeYearLevel(body.yearLevel);
  const { selectedTopics, selectedSubtopics, focus } = resolveTopicSelectionFromBody(body);
  const maxQuestionsPerQuiz =
    options.maxQuestionsPerQuiz ??
    getMaxQuestionsPerQuizForPlan(options.subscription?.limits);

  const { questionCount, wasClamped, requested, planCap } = clampQuestionCount(body.questionCount, {
    maxQuestionsPerQuiz,
  });

  const distribution =
    selectedSubtopics.length > 0
      ? distributeQuestionCounts(questionCount, selectedSubtopics)
      : null;

  return {
    yearLevel,
    subject: String(body.subject || "Science"),
    focus,
    selectedTopics,
    selectedSubtopics,
    distribution,
    difficulty: String(body.difficulty || "mixed"),
    questionStyle: String(body.questionStyle || "worded"),
    questionCount,
    questionCountClamped: wasClamped,
    questionCountRequested: requested,
    questionCountPlanCap: planCap,
    timedMode: body.timedMode !== false,
    dueAt: body.dueAt || null,
  };
}
