import assert from "node:assert/strict";
import { test } from "node:test";
import {
  normalizeQuizQuestionTextForDisplay,
  normalizeQuizQuestionsForDisplay,
} from "../lib/question-display.js";
import {
  studentFacingBreadcrumb,
  studentFacingFocus,
  stripInternalTopicPreview,
} from "../lib/student-display.js";
import { fixGluedWordProblemSpacing } from "../lib/study-message-content.js";

test("fixGluedWordProblemSpacing inserts space after numbers before letters", () => {
  assert.equal(
    fixGluedWordProblemSpacing("A town has 10,000withanannual growth rate of 5%."),
    "A town has 10,000 with an annual growth rate of 5%.",
  );
  assert.equal(fixGluedWordProblemSpacing("$a_n = 2^n - 1$"), "$a_n = 2^n - 1$");
});

test("normalizeQuizQuestionTextForDisplay strips internal markers and sanitizes math", () => {
  const raw = "\uE000MATH0\uE001What is $2 + 2$?";
  const normalized = normalizeQuizQuestionTextForDisplay(raw);
  assert.doesNotMatch(normalized, /\uE000MATH/);
  assert.match(normalized, /\$2 \+ 2\$/);
});

test("normalizeQuizQuestionsForDisplay normalizes question bodies and options", () => {
  const [question] = normalizeQuizQuestionsForDisplay([
    {
      question: "Population is 10,000people.",
      options: ["10,000people", "$x = 1$"],
      answer: "$x = 1$",
    },
  ]);

  assert.match(question.question, /10,000 people/);
  assert.match(question.options[0], /10,000 people/);
  assert.match(question.options[1], /\$x = 1\$/);
});

test("studentFacingFocus uses assignment title for internal multi-topic previews", () => {
  assert.equal(
    studentFacingFocus("Topic A — Sub 1; Topic B — Sub 2 (+23 more)", "Year 7 Science Quiz 3"),
    "Year 7 Science Quiz 3",
  );
  assert.equal(studentFacingFocus("Cells › Animal cells", "Science Quiz"), "Cells › Animal cells");
});

test("stripInternalTopicPreview removes (+N more) suffix", () => {
  assert.equal(stripInternalTopicPreview("A; B (+5 more)"), "A; B");
});

test("studentFacingBreadcrumb omits internal topic preview from focus", () => {
  assert.equal(
    studentFacingBreadcrumb({
      yearLevel: "Year 7",
      subject: "Science",
      focus: "A; B (+12 more)",
      assignmentTitle: "Cells review",
    }),
    "Year 7 · Science · Cells review",
  );
});
