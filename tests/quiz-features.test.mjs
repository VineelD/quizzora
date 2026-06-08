import assert from "node:assert/strict";
import { test } from "node:test";
import { buildSubtopicOptions } from "../lib/curriculum-topics.js";
import { distributeQuestionCounts, resolveTopicSelectionFromBody } from "../lib/quiz-distribution.js";
import { parseQuizRequestFromBody } from "../lib/quiz-request.js";
import {
  applyTimingToQuestions,
  computeOverallTimeLimitSeconds,
  computeQuestionTimeLimitSeconds,
  formatTimerDisplay,
  TIME_BY_QUESTION_STYLE,
} from "../lib/quiz-timing.js";
import { getTrialPlanLimits } from "../lib/plans.js";

test("buildSubtopicOptions lists only subtopics under selected topics", () => {
  const topicOptions = [
    { key: "Topic A", topic: "Topic A", stream: null, subtopics: ["Sub 1", "Sub 2"] },
    { key: "Topic B", topic: "Topic B", stream: null, subtopics: ["Sub 3"] },
  ];

  assert.equal(buildSubtopicOptions(topicOptions, []).length, 0);

  const topicAOnly = buildSubtopicOptions(topicOptions, ["Topic A"]);
  assert.equal(topicAOnly.length, 2);
  assert.ok(topicAOnly.every((item) => item.topicKey === "Topic A"));

  const bothTopics = buildSubtopicOptions(topicOptions, ["Topic A", "Topic B"]);
  assert.equal(bothTopics.length, 3);
  assert.deepEqual(
    bothTopics.map((item) => item.label),
    ["Topic A — Sub 1", "Topic A — Sub 2", "Topic B — Sub 3"],
  );
});

test("distributeQuestionCounts splits evenly with round-robin remainder", () => {
  const keys = ["A", "B", "C", "D", "E"];
  assert.deepEqual(distributeQuestionCounts(20, keys), {
    A: 4,
    B: 4,
    C: 4,
    D: 4,
    E: 4,
  });
  assert.deepEqual(distributeQuestionCounts(23, keys), {
    A: 5,
    B: 5,
    C: 5,
    D: 4,
    E: 4,
  });
});

test("distributeQuestionCounts handles empty and zero totals", () => {
  assert.deepEqual(distributeQuestionCounts(10, []), {});
  assert.deepEqual(distributeQuestionCounts(0, ["A", "B"]), { A: 0, B: 0 });
});

test("parseQuizRequestFromBody accepts multi-select payload and builds distribution", () => {
  const trialLimits = getTrialPlanLimits();
  const parsed = parseQuizRequestFromBody(
    {
      yearLevel: "Year 7",
      subject: "Science",
      selectedTopics: ["Mixtures"],
      selectedSubtopics: ["Topic A — Sub 1", "Topic A — Sub 2", "Topic B — Sub 3"],
      questionCount: 10,
      difficulty: "core",
      questionStyle: "worded",
    },
    { subscription: { limits: trialLimits } },
  );

  assert.equal(parsed.selectedSubtopics.length, 3);
  assert.equal(parsed.questionCount, 10);
  assert.deepEqual(parsed.distribution, {
    "Topic A — Sub 1": 4,
    "Topic A — Sub 2": 3,
    "Topic B — Sub 3": 3,
  });
});

test("parseQuizRequestFromBody clamps question count to plan cap", () => {
  const parsed = parseQuizRequestFromBody(
    {
      questionCount: 100,
      focus: "Forces — Push and pull",
    },
    { maxQuestionsPerQuiz: 30 },
  );

  assert.equal(parsed.questionCount, 30);
  assert.equal(parsed.questionCountClamped, true);
});

test("parseQuizRequestFromBody remains backward compatible with focus string", () => {
  const parsed = parseQuizRequestFromBody({
    focus: "Forces — Push and pull",
    questionCount: 5,
  });

  assert.equal(parsed.focus, "Forces — Push and pull");
  assert.deepEqual(parsed.selectedSubtopics, []);
  assert.equal(parsed.distribution, null);
});

test("resolveTopicSelectionFromBody builds focus preview for many subtopics", () => {
  const result = resolveTopicSelectionFromBody({
    selectedSubtopics: ["A — 1", "B — 2", "C — 3"],
  });
  assert.match(result.focus, /\+1 more/);
});

test("computeQuestionTimeLimitSeconds uses style and extension rules", () => {
  assert.equal(computeQuestionTimeLimitSeconds({ questionStyle: "multiple-choice" }), TIME_BY_QUESTION_STYLE["multiple-choice"]);
  assert.equal(computeQuestionTimeLimitSeconds({ questionStyle: "worded" }), TIME_BY_QUESTION_STYLE.worded);
  assert.equal(
    computeQuestionTimeLimitSeconds({ questionStyle: "multiple-choice", difficulty: "extension" }),
    240,
  );
});

test("applyTimingToQuestions attaches limits and computeOverallTimeLimitSeconds sums them", () => {
  const questions = applyTimingToQuestions([{ question: "Q1", options: ["a"], answer: "a" }], {
    questionStyle: "worded",
    difficulty: "core",
  });
  assert.equal(questions[0].timeLimitSeconds, 180);
  assert.equal(computeOverallTimeLimitSeconds(questions), 180);
});

test("formatTimerDisplay renders mm:ss", () => {
  assert.equal(formatTimerDisplay(125), "2:05");
  assert.equal(formatTimerDisplay(0), "0:00");
});
