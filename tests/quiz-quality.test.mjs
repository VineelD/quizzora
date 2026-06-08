import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applyQuizQuestionClarityFixes,
  prepareQuizForAssignment,
  questionNeedsRegeneration,
  QuizReadabilityError,
  validateQuizQuestionClarity,
  validateQuizStudentReadability,
} from "../lib/quiz-quality.js";

test("applyQuizQuestionClarityFixes repairs glued word-problem stems", () => {
  const fixed = applyQuizQuestionClarityFixes({
    question: "Apopulationof10,000withanannualgrowthrateof5%isgiven.",
    options: ["4,200", "$a_n = 2^n - 1$", "3,600", "2,800"],
    answer: "4,200",
    explanation: "Step 1: read the scenario.",
  });

  assert.match(fixed.question, /10,000 with an annual/);
  assert.equal(fixed.options[0], "4,200");
});

test("validateQuizStudentReadability auto-fixes and passes clean quizzes", () => {
  const result = validateQuizStudentReadability({
    subject: "Mathematics",
    focus: "Sequences",
    questions: [
      {
        question: "What is the next term in the sequence 2, 4, 8, 16?",
        options: ["24", "32", "30", "28"],
        answer: "32",
        explanation: "Step 1: double each term.",
      },
    ],
  });

  assert.equal(result.valid, true);
  assert.equal(result.criticalCount, 0);
});

test("prepareQuizForAssignment blocks quizzes with unfixable critical issues", () => {
  assert.throws(
    () =>
      prepareQuizForAssignment({
        subject: "Mathematics",
        focus: "Algebra",
        questions: [
          {
            question: "",
            options: ["1", "2", "3", "4"],
            answer: "1",
            explanation: "Substitute.",
          },
        ],
      }),
    QuizReadabilityError,
  );
});

test("validateQuizQuestionClarity detects glued text in stems", () => {
  const review = validateQuizQuestionClarity({
    question: "Apopulationof10,000withanannualgrowthrateof5% grows each year.",
    options: ["4,200", "3,600", "2,800", "1,900"],
    answer: "4,200",
  });

  assert.ok(review.issues.some((issue) => issue.code === "glued_stem"));
});

test("applyQuizQuestionClarityFixes repairs bad dollar delimiters", () => {
  const fixed = applyQuizQuestionClarityFixes({
    question: "Find $x$ when $2x+1=5$",
    options: ["$x=2$", "$$x=3$$", "$x=4$", "$x=5$"],
    answer: "$x=2$",
    explanation: "Solve for x.",
  });

  assert.doesNotMatch(fixed.options[1], /\$\$/);
  assert.match(fixed.options[1], /\$x=3\$/);
});

test("validateQuizQuestionClarity rejects topic mashup stems", () => {
  const review = validateQuizQuestionClarity({
    question:
      "Using trigonometry, find the Fibonacci ratio in this recurrence relation for sin theta and a_n.",
    options: ["A", "B", "C", "D"],
    answer: "A",
    explanation: "Step 1.",
  });

  assert.equal(review.valid, false);
  assert.equal(review.needsReview, true);
  assert.ok(review.issues.some((issue) => issue.code === "topic_mashup"));
});

test("validateQuizQuestionClarity rejects math placeholders and bad delimiters", () => {
  const placeholderReview = validateQuizQuestionClarity({
    question: "Solve [MATH0] for n.",
    options: ["1", "2", "3", "4"],
    answer: "1",
  });
  assert.ok(placeholderReview.issues.some((issue) => issue.code === "math_placeholder"));

  const dollarReview = validateQuizQuestionClarity({
    question: "Which option shows the correct probability?",
    options: ["$$$$0.43$$$$", "2", "3", "4"],
    answer: "2",
  });
  assert.ok(dollarReview.issues.some((issue) => issue.code === "bad_dollars"));
});

test("validateQuizQuestionClarity rejects empty and duplicate options", () => {
  const emptyReview = validateQuizQuestionClarity({
    question: "Pick the correct value.",
    options: ["10", "", "12", "14"],
    answer: "10",
  });
  assert.ok(emptyReview.issues.some((issue) => issue.code === "empty_option"));

  const duplicateReview = validateQuizQuestionClarity({
    question: "Pick the correct value.",
    options: ["10", "10", "12", "14"],
    answer: "10",
  });
  assert.ok(duplicateReview.issues.some((issue) => issue.code === "duplicate_options"));
});

test("questionNeedsRegeneration is true for unfixable clarity issues", () => {
  assert.equal(
    questionNeedsRegeneration({
      question: "Pick the correct value.",
      options: ["10", "10", "12", "14"],
      answer: "10",
    }),
    true,
  );
});
