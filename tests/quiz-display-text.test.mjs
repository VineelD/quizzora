import assert from "node:assert/strict";
import { test } from "node:test";
import {
  prepareQuizDisplayText,
  prepareQuizOptionMarkdown,
  prepareQuizQuestionMarkdown,
  sanitizeQuizText,
  stripQuizMathPlaceholders,
  unwrapProseInlineMathDelimiters,
} from "../lib/quiz-display-text.js";
import { normalizeQuizQuestionsForDisplay } from "../lib/question-display.js";
import { renderQuizOptionMarkdownText } from "../lib/study-markdown-render.js";
import { prepareStudyMessageMarkdown } from "../lib/study-message-content.js";
import { renderStudyCoachMarkdownText } from "../lib/study-markdown-render.js";

test("unwrapProseInlineMathDelimiters removes dollars from prose clauses", () => {
  const raw =
    "A household appliance operates at 240 V, and $0.30 per kWh, what is the monthly cost of running this appliance (30 days)?$";
  const unwrapped = unwrapProseInlineMathDelimiters(raw);
  assert.doesNotMatch(unwrapped, /\$0\.30 per kWh/i);
  assert.match(unwrapped, /0\.30 per kWh, what is the monthly cost/i);
  assert.doesNotMatch(unwrapped, /0\.30perkWh/i);
});

test("sanitizeQuizText preserves readable household energy question stems", () => {
  const raw =
    "A household appliance operates at 240 V, and $0.30 per kWh, what is the monthly cost of running this appliance (30 days)?$";
  const prepared = sanitizeQuizText(raw);
  assert.match(prepared, /A household appliance operates at 240 V/);
  assert.doesNotMatch(prepared, /A h o u s e h o l d/);
  assert.match(prepared, /0\.30 per kWh, what is the monthly cost/i);
  assert.doesNotMatch(prepared, /0\.30perkWh/i);
});

test("sanitizeQuizText repairs glued word-problem spacing", () => {
  const prepared = sanitizeQuizText(
    "Apopulationof10,000withanannualgrowthrateof5%isgivenbytheformulaP_n=1.05P_{n-1}.",
  );
  assert.match(prepared, /10,000 with an annual/);
  assert.match(prepared, /growth rate of 5%/);
});

test("stripQuizMathPlaceholders restores bracket and unicode math tokens", () => {
  const restored = stripQuizMathPlaceholders("Solve [MATH0] where $x=2$.", {
    expressions: [{ expression: "a_n = 2^n - 1" }],
  });
  assert.match(restored, /\$a_n = 2\^n - 1\$/);
  assert.doesNotMatch(restored, /\[MATH0\]/);
});

test("prepareQuizDisplayText normalizes question and MCQ options", () => {
  const { question, options } = prepareQuizDisplayText(
    { question: "Which formula gives $a_n = 2^n - 1$?" },
    ["4,200", "$a_n = 2^n - 1$", "3,600", "[MATH0]"],
  );

  assert.match(question, /\$a_n = 2\^n - 1\$/);
  assert.equal(options[0], "4,200");
  assert.match(options[1], /\$a_n = 2\^n - 1\$/);
  assert.equal(options[2], "3,600");
  assert.doesNotMatch(options[3], /\[MATH0\]/);
});

test("normalizeQuizQuestionsForDisplay fixes stored broken questions client-side", () => {
  const normalized = normalizeQuizQuestionsForDisplay([
    {
      question: "Find $S_n$ when $S_n=S_{n-1}+3n$.",
      options: ["4,200", "$a_n = 2^n - 1$", "3,600", "2,800"],
      answer: "$a_n = 2^n - 1$",
      explanation: "Step 1: substitute values.",
    },
  ]);

  assert.match(normalized[0].question, /\$S_n=S_\{n-1\}\+3n\$/);
  assert.equal(normalized[0].options[0], "4,200");
  assert.match(normalized[0].options[1], /\$a_n = 2\^n - 1\$/);
});

test("prepareQuizQuestionMarkdown repairs sin squared identity without coach sanitizer", () => {
  const prepared = prepareQuizQuestionMarkdown(
    "Use $\\$\\sin^2 \\theta$ + $\\cos^2 \\theta = 1 }$$ for all angles.",
  );
  assert.match(prepared, /\$\\sin\^2 \\theta \+ \\cos\^2 \\theta = 1\$/);
  assert.doesNotMatch(prepared, /\[MATH\d+\]/i);
  assert.doesNotMatch(prepared, /PLAIN FORMULA/i);
});

test("coach portion sin identity renders without visible dollar signs", () => {
  const raw =
    "### The Formula You Might Be Referring To:\n\n$\\$\\sin^2 \\theta$ + $\\cos^2 \\theta = 1 }$$\n\n---$$";
  const prepared = prepareStudyMessageMarkdown(raw);
  const rendered = renderStudyCoachMarkdownText(prepared);
  assert.match(prepared, /### The Formula You Might Be Referring To:/);
  assert.doesNotMatch(rendered, /\$/);
  assert.match(rendered, /sin|θ|cos/i);
});

test("prepareQuizOptionMarkdown repairs malformed quadruple-dollar option", () => {
  const repaired = prepareQuizOptionMarkdown("$$$$0.43\\\\ 0.57$$$$");
  assert.doesNotMatch(repaired, /\$\$\$\$/);
  assert.match(repaired, /0\.43/);
});

test("numeric-only options skip math sanitizer", () => {
  const option = prepareQuizOptionMarkdown("$4,200$");
  assert.equal(option, "4,200");
});

test("renderQuizOptionMarkdownText renders pmatrix option without stray dollars", () => {
  const raw = "$$\n\\begin{pmatrix} 0.43 \\\\ 0.57 \\end{pmatrix}\n$$";
  const rendered = renderQuizOptionMarkdownText(raw);
  assert.doesNotMatch(rendered, /\$/);
  assert.match(rendered, /0\.43/);
});
