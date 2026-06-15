import assert from "node:assert/strict";
import { test } from "node:test";
import { buildOpenAiPrompt } from "../lib/ai.js";
import {
  detectEmbeddedDiagramInProse,
  questionHasValidDiagramChannel,
} from "../lib/quiz-diagram-prompt-rules.js";
import { prepareQuizQuestionMarkdown } from "../lib/quiz-display-text.js";
import { isAsciiDiagramContent } from "../lib/study-message-content.js";
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

test("detectEmbeddedDiagramInProse flags ASCII and mermaid in question text", () => {
  assert.equal(
    detectEmbeddedDiagramInProse("Study the circuit: Battery -- 4Ω -- Bulb. What is the current?"),
    true,
  );
  assert.equal(detectEmbeddedDiagramInProse("```mermaid\nflowchart TD\nA-->B\n```"), true);
  assert.equal(
    detectEmbeddedDiagramInProse("A series circuit has a $12\\text{ V}$ battery. What is the current?"),
    false,
  );
});

test("validateQuizQuestionClarity rejects diagram embedded in stem", () => {
  const review = validateQuizQuestionClarity({
    question: "Battery -- 4Ω -- Bulb\nWhat is the current?",
    options: ["1 A", "2 A", "3 A", "4 A"],
    answer: "3 A",
    needsDiagram: false,
  });

  assert.ok(review.issues.some((issue) => issue.code === "diagram_embedded_in_stem"));
});

test("validateQuizQuestionClarity rejects needsDiagram without render channel", () => {
  const review = validateQuizQuestionClarity({
    question: "A cell diagram is shown. Which organelle produces ATP?",
    options: ["Nucleus", "Mitochondria", "Ribosome", "Golgi"],
    answer: "Mitochondria",
    needsDiagram: true,
  });

  assert.ok(review.issues.some((issue) => issue.code === "diagram_missing_channel"));
});

test("questionHasValidDiagramChannel accepts spec, mermaid, and image prompt", () => {
  assert.equal(
    questionHasValidDiagramChannel({
      needsDiagram: true,
      diagramSpec: { diagramType: "number_line", min: 0, max: 10, points: [5], intervals: [] },
    }),
    true,
  );
  assert.equal(
    questionHasValidDiagramChannel({
      needsDiagram: true,
      diagramType: "flowchart",
      diagramMermaid: "flowchart TD\nA-->B",
    }),
    true,
  );
  assert.equal(
    questionHasValidDiagramChannel({
      needsDiagram: true,
      diagramType: "cell_diagram",
      diagramPrompt: "Educational cell diagram with labelled mitochondria.",
    }),
    true,
  );
  assert.equal(questionHasValidDiagramChannel({ needsDiagram: true }), false);
});

test("validateQuizStudentReadability flags invalid diagramSpec without fallback", () => {
  const result = validateQuizStudentReadability({
    subject: "Science",
    focus: "Cells",
    questions: [
      {
        question: "Which part of the cell shown produces energy?",
        options: ["Nucleus", "Mitochondria", "Cell wall", "Vacuole"],
        answer: "Mitochondria",
        needsDiagram: true,
        diagramSpec: { diagramType: "cell_diagram", labels: ["Mitochondria"] },
      },
    ],
  });

  assert.ok(
    result.issues.some(
      (issue) => issue.code === "diagram_invalid_spec" || issue.code === "diagram_missing_channel",
    ),
  );
});

test("sanitizeQuizText strips ASCII parallel circuit blocks from explanations", () => {
  const raw = `Across R2: 1 × 6 = 6V
### Parallel Circuit Visual
\`\`\`text
+ --- R1 (4Ω) --- +
| |
+ --- R2 (6Ω) --- + 12 V supply
\`\`\`
Total resistance: $R_{total} = 2\\,\\Omega$`;

  assert.equal(isAsciiDiagramContent("+ --- R1 (4Ω) --- +"), true);
  const cleaned = prepareQuizQuestionMarkdown(raw);
  assert.doesNotMatch(cleaned, /R1 \(4Ω\)/);
  assert.doesNotMatch(cleaned, /Parallel Circuit Visual/i);
  assert.match(cleaned, /Total resistance/i);
});

test("validateQuizQuestionClarity rejects ASCII circuit in explanation", () => {
  const review = validateQuizQuestionClarity({
    question: "What is the total resistance of the parallel circuit?",
    options: ["$2\\,\\Omega$", "$4\\,\\Omega$", "$6\\,\\Omega$", "$12\\,\\Omega$"],
    answer: "$2\\,\\Omega$",
    explanation: "+ --- R1 (4Ω) --- +\n| |\n+ --- R2 (6Ω) --- +",
    needsDiagram: true,
    diagramPrompt: "Educational physics parallel circuit with R1 4 ohm, R2 6 ohm, 12 V battery.",
  });

  assert.ok(review.issues.some((issue) => issue.code === "diagram_embedded_in_stem"));
});

test("buildOpenAiPrompt includes channel-first diagram routing rules", () => {
  const prompt = buildOpenAiPrompt({
    subject: "Science",
    focus: "Electric circuits",
    questionCount: 5,
    difficulty: "medium",
    yearLevel: "Year 9",
  });

  assert.match(prompt, /Channel-first diagram routing/i);
  assert.match(prompt, /diagramLabels/i);
  assert.match(prompt, /FORBIDDEN in question/i);
  assert.match(prompt, /parallel\/series circuits/i);
  assert.match(prompt, /diagramType.*circuit/i);
  assert.match(prompt, /KaTeX in the browser/i);
});
