import {
  fixGluedWordProblemSpacing,
  protectMathRegions,
  stripInternalContentMarkers,
} from "./study-message-content.js";
import {
  repairQuizMathDelimiters,
  sanitizeQuizText,
  stripQuizMathPlaceholders,
} from "./quiz-display-text.js";
import {
  detectEmbeddedDiagramInProse,
  hasInvalidDiagramSpecWithoutFallback,
  questionHasValidDiagramChannel,
} from "./quiz-diagram-prompt-rules.js";

export function quizQualityFirstEnabled() {
  return process.env.QUIZ_QUALITY_FIRST === "true";
}

export class QuizReadabilityError extends Error {
  constructor(message, { issues = [] } = {}) {
    super(message);
    this.name = "QuizReadabilityError";
    this.statusCode = 422;
    this.issues = issues;
  }
}

const MATH_PLACEHOLDER = /\[MATH(\d+)\]|\uE000MATH\s*\d+\uE001/gi;
const QUADRUPLE_DOLLAR = /\$\$\$\$/;
const RAW_LATEX_IN_OPTION = /\\(?:frac|sqrt|begin|text|sin|cos|tan|log|ln|binom|boxed)\{/;

/** Unrelated curriculum clusters — matching 3+ clusters in one stem suggests a topic mashup. */
export const TOPIC_CLUSTERS = [
  { id: "trigonometry", keywords: ["trigonometry", "trig", "sine", "cosine", "tangent", "sin ", "cos ", "tan ", "theta", "radian"] },
  { id: "fibonacci", keywords: ["fibonacci", "golden ratio", "golden spiral"] },
  { id: "sequences", keywords: ["recurrence", "recursive", "a_n", "arithmetic sequence", "geometric sequence", "nth term"] },
  { id: "probability", keywords: ["probability", "probable", "likelihood", "random event", "sample space", "outcomes"] },
  { id: "geometry", keywords: ["perimeter", "circumference", "pythagoras", "hypotenuse", "parallelogram", "rhombus"] },
  { id: "algebra", keywords: ["quadratic", "polynomial", "factorise", "factorize", "simultaneous equation"] },
  { id: "statistics", keywords: ["mean", "median", "mode", "standard deviation", "interquartile", "box plot"] },
  { id: "calculus", keywords: ["derivative", "integral", "differentiate", "f'(x)", "dy/dx", "gradient function"] },
  { id: "finance", keywords: ["interest rate", "compound interest", "loan", "annuity", "depreciation"] },
  { id: "biology", keywords: ["mitosis", "photosynthesis", "chloroplast", "ecosystem", "organism", "cell membrane"] },
  { id: "physics", keywords: ["velocity", "acceleration", "newton", "circuit", "voltage", "force diagram"] },
  { id: "chemistry", keywords: ["molecule", "reaction", "periodic table", "electron shell", "covalent bond"] },
];

const MAX_STEM_CHARS = 520;
const REVIEW_SCORE_THRESHOLD = 70;

function countUnescapedDollars(text) {
  let count = 0;
  const value = String(text || "");
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] === "$" && (index === 0 || value[index - 1] !== "\\")) {
      count += 1;
    }
  }
  return count;
}

function hasOrphanDollars(text) {
  const { text: protectedText } = protectMathRegions(String(text || "").trim());
  const count = countUnescapedDollars(protectedText);
  return count > 0 && count % 2 === 1;
}

function detectGluedText(text) {
  const sample = stripQuizMathPlaceholders(String(text || ""));
  const { text: protectedText } = protectMathRegions(sample);
  if (/(?<=[\d,])(?=[A-Za-z])/.test(protectedText)) {
    return true;
  }
  if (/(?<=[a-z])(?=[A-Z][a-z])/.test(protectedText)) {
    return true;
  }
  return /\b(?:of|with|an|the|and|rate)[a-z]{4,}/i.test(protectedText.replace(/\s+/g, ""));
}

function detectMatchedTopicClusters(text) {
  const haystack = String(text || "").toLowerCase();
  return TOPIC_CLUSTERS.filter((cluster) =>
    cluster.keywords.some((keyword) => haystack.includes(keyword.toLowerCase())),
  );
}

function scoreFromIssues(issues) {
  let score = 100;
  for (const issue of issues) {
    if (issue.severity === "critical") {
      score -= 25;
    } else if (issue.severity === "warning") {
      score -= 12;
    } else {
      score -= 6;
    }
  }
  return Math.max(0, Math.min(100, score));
}

function repairField(text, { expressions = [] } = {}) {
  let value = stripQuizMathPlaceholders(String(text ?? ""), { expressions });
  value = fixGluedWordProblemSpacing(value);
  value = sanitizeQuizText(value, { expressions });
  value = repairQuizMathDelimiters(value);
  return stripInternalContentMarkers(value).trim();
}

/**
 * Auto-fix glued spacing and math delimiters on a quiz question before save/display.
 */
export function applyQuizQuestionClarityFixes(question) {
  if (!question || typeof question !== "object") {
    return question;
  }

  const expressions = Array.isArray(question.mathExpressions) ? question.mathExpressions : [];
  const repairOptions = { expressions };

  const options = Array.isArray(question.options)
    ? question.options.map((option) => repairField(option, repairOptions))
    : question.options;

  return {
    ...question,
    question: repairField(question.question, repairOptions),
    options,
    answer: repairField(question.answer, repairOptions),
    explanation:
      typeof question.explanation === "string"
        ? repairField(question.explanation, repairOptions)
        : question.explanation,
  };
}

/**
 * Validate one quiz question for student-facing clarity.
 */
export function validateQuizQuestionClarity(question, { focus = "" } = {}) {
  const issues = [];
  const expressions = Array.isArray(question?.mathExpressions) ? question.mathExpressions : [];
  const stem = String(question?.question || "");
  const options = Array.isArray(question?.options) ? question.options : [];

  if (!stem.trim()) {
    issues.push({ code: "empty_stem", message: "Question text is empty.", severity: "critical" });
  }

  const trimmedOptions = options.map((option) => String(option || "").trim());
  if (trimmedOptions.some((option) => !option)) {
    issues.push({
      code: "empty_option",
      message: "One or more answer options are empty.",
      severity: "critical",
    });
  }

  const normalizedOptions = trimmedOptions.map((option) =>
    stripQuizMathPlaceholders(option, { expressions }).trim().toLowerCase(),
  );
  const filledOptions = normalizedOptions.filter(Boolean);
  if (filledOptions.length >= 2 && new Set(filledOptions).size < filledOptions.length) {
    issues.push({
      code: "duplicate_options",
      message: "Two or more answer options are identical.",
      severity: "critical",
    });
  }

  if (stem.length > MAX_STEM_CHARS) {
    issues.push({
      code: "long_stem",
      message: `Question stem is very long (${stem.length} characters). Shorten for clarity.`,
      severity: "warning",
    });
  }

  if (detectGluedText(stem)) {
    issues.push({
      code: "glued_stem",
      message: "Question stem has glued words or numbers without spaces.",
      severity: "warning",
    });
  }

  for (const option of options) {
    const optionText = String(option || "");
    if (detectGluedText(optionText)) {
      issues.push({
        code: "glued_option",
        message: "An answer option has glued words or numbers without spaces.",
        severity: "warning",
      });
      break;
    }
  }

  const explanation = String(question?.explanation || "");
  const fieldsToScan = [stem, ...options, String(question?.answer || ""), explanation];
  for (const field of fieldsToScan) {
    const value = String(field || "");
    if (MATH_PLACEHOLDER.test(value)) {
      issues.push({
        code: "math_placeholder",
        message: "Placeholder math tokens such as [MATH0] are present.",
        severity: "critical",
      });
      break;
    }
    if (QUADRUPLE_DOLLAR.test(value)) {
      issues.push({
        code: "bad_dollars",
        message: "Malformed dollar math delimiters ($$$$) are present.",
        severity: "critical",
      });
      break;
    }
    if (hasOrphanDollars(value)) {
      issues.push({
        code: "orphan_dollar",
        message: "Unpaired $ math delimiters are present.",
        severity: "critical",
      });
      break;
    }
  }

  for (const option of options) {
    const plain = stripQuizMathPlaceholders(String(option || ""), { expressions }).trim();
    if (RAW_LATEX_IN_OPTION.test(plain) && !/\$[^$]+\$/.test(plain)) {
      issues.push({
        code: "raw_latex_option",
        message: "An option contains raw LaTeX outside $...$ delimiters.",
        severity: "warning",
      });
      break;
    }
  }

  const matchedClusters = detectMatchedTopicClusters(stem);
  if (matchedClusters.length > 2) {
    issues.push({
      code: "topic_mashup",
      message: `Question mixes unrelated topics (${matchedClusters.map((item) => item.id).join(", ")}). Use one topic per question.`,
      severity: "critical",
    });
  }

  if (focus && matchedClusters.length >= 2) {
    const focusLower = String(focus).toLowerCase();
    const focusAligned = matchedClusters.some((cluster) =>
      cluster.keywords.some((keyword) => focusLower.includes(keyword.toLowerCase())),
    );
    if (!focusAligned) {
      issues.push({
        code: "focus_drift",
        message: "Question may not stay on the selected subtopic.",
        severity: "warning",
      });
    }
  }

  for (const field of [stem, ...options, explanation]) {
    if (detectEmbeddedDiagramInProse(field)) {
      issues.push({
        code: "diagram_embedded_in_stem",
        message:
          "Diagram or visual content is embedded in question/option text — use diagramSpec, diagramMermaid, or diagramPrompt instead.",
        severity: "critical",
      });
      break;
    }
  }

  if (question?.needsDiagram && !questionHasValidDiagramChannel(question)) {
    issues.push({
      code: "diagram_missing_channel",
      message:
        "Question needs a diagram but has no valid render channel (diagramSpec, diagramMermaid, or diagramPrompt).",
      severity: "critical",
    });
  }

  if (hasInvalidDiagramSpecWithoutFallback(question)) {
    issues.push({
      code: "diagram_invalid_spec",
      message:
        "diagramSpec is invalid for client rendering — use number_line/recursion_tree spec or provide diagramPrompt/diagramMermaid.",
      severity: "critical",
    });
  }

  const score = scoreFromIssues(issues);
  const needsReview = score < REVIEW_SCORE_THRESHOLD || issues.some((issue) => issue.severity === "critical");

  return {
    valid: !issues.some((issue) => issue.severity === "critical"),
    score,
    needsReview,
    issues,
  };
}

const REGENERATION_ISSUE_CODES = new Set([
  "empty_stem",
  "empty_option",
  "duplicate_options",
  "glued_stem",
  "glued_option",
  "math_placeholder",
  "bad_dollars",
  "orphan_dollar",
  "topic_mashup",
  "diagram_embedded_in_stem",
  "diagram_missing_channel",
  "diagram_invalid_spec",
]);

/** True when auto-fix did not resolve clarity issues — caller should regenerate the question. */
export function questionNeedsRegeneration(question, context = {}) {
  const fixed = applyQuizQuestionClarityFixes(question);
  const review = validateQuizQuestionClarity(fixed, context);
  if (!review.valid) {
    return true;
  }
  return review.issues.some((issue) => REGENERATION_ISSUE_CODES.has(issue.code));
}

export function enrichQuizWithClarity(questions, context = {}) {
  if (!Array.isArray(questions)) {
    return { questions, clarityReport: buildQuizClarityReport([]) };
  }

  const enriched = questions.map((question) => {
    const fixed = applyQuizQuestionClarityFixes(question);
    const clarityReview = validateQuizQuestionClarity(fixed, context);
    return {
      ...fixed,
      clarityReview: {
        score: clarityReview.score,
        needsReview: clarityReview.needsReview,
        issues: clarityReview.issues.map((issue) => issue.message),
      },
    };
  });

  return {
    questions: enriched,
    clarityReport: buildQuizClarityReport(enriched),
  };
}

export function buildQuizClarityReport(questions) {
  const rows = (Array.isArray(questions) ? questions : []).map((question, index) => {
    const review = question?.clarityReview || validateQuizQuestionClarity(question);
    return {
      index,
      score: review.score,
      needsReview: review.needsReview,
      issues: review.issues?.map?.((issue) => issue.message) || review.issues || [],
    };
  });

  const needsReviewCount = rows.filter((row) => row.needsReview).length;
  const averageScore = rows.length
    ? Math.round(rows.reduce((sum, row) => sum + row.score, 0) / rows.length)
    : 100;

  return {
    averageScore,
    needsReviewCount,
    needsReview: needsReviewCount > 0,
    questions: rows,
    summary:
      needsReviewCount > 0
        ? `${needsReviewCount} question${needsReviewCount === 1 ? "" : "s"} may confuse students — review before assigning.`
        : "All questions passed clarity checks.",
  };
}

export function quizNeedsReview(clarityReport) {
  return Boolean(clarityReport?.needsReview);
}

function validateQuestionDiagramReadability(question, index) {
  const issues = [];
  const prefix = `Question ${index + 1}:`;

  const stem = String(question?.question || "");
  if (detectEmbeddedDiagramInProse(stem)) {
    issues.push({
      code: "diagram_embedded_in_stem",
      message: `${prefix} diagram content is embedded in the question text — route to structured diagram fields.`,
      severity: "critical",
    });
  }

  if (question?.needsDiagram && !questionHasValidDiagramChannel(question)) {
    issues.push({
      code: "diagram_missing_channel",
      message: `${prefix} needs a diagram but no diagramSpec, diagramMermaid, or diagramPrompt is set.`,
      severity: "critical",
    });
  }

  if (hasInvalidDiagramSpecWithoutFallback(question)) {
    issues.push({
      code: "diagram_invalid_spec",
      message: `${prefix} diagramSpec is not renderable — fix spec or add diagramPrompt/diagramMermaid.`,
      severity: "critical",
    });
  }

  if (!question?.needsDiagram) {
    return issues;
  }

  if (question.imageGenerated === "openai" && String(question.imageUrl || "").trim()) {
    return issues;
  }

  if (question.imageSkipped) {
    issues.push({
      code: "diagram_skipped",
      message: `Question ${index + 1}: diagram was skipped (${question.imageError || "cap or disabled"}).`,
      severity: "warning",
    });
    return issues;
  }

  if (question.imageError) {
    issues.push({
      code: "diagram_failed",
      message: `Question ${index + 1}: diagram unavailable — ${question.imageError}`,
      severity: "warning",
    });
  }

  return issues;
}

/**
 * Auto-fix and validate an entire quiz for student-facing readability before assign.
 */
export function validateQuizStudentReadability(quiz, context = {}) {
  const questions = Array.isArray(quiz?.questions) ? quiz.questions : [];
  const allIssues = [];

  const fixedQuestions = questions.map((question, index) => {
    const fixed = applyQuizQuestionClarityFixes(question);
    const clarity = validateQuizQuestionClarity(fixed, context);
    const diagramIssues = validateQuestionDiagramReadability(fixed, index);
    const issues = [...clarity.issues, ...diagramIssues];

    for (const issue of issues) {
      allIssues.push({ questionIndex: index, ...issue });
    }

    return {
      ...fixed,
      clarityReview: {
        score: clarity.score,
        needsReview: clarity.needsReview || diagramIssues.length > 0,
        issues: issues.map((issue) => issue.message),
      },
    };
  });

  const critical = allIssues.filter((issue) => issue.severity === "critical");
  const warnings = allIssues.filter((issue) => issue.severity === "warning");

  return {
    valid: critical.length === 0,
    questions: fixedQuestions,
    issues: allIssues,
    criticalCount: critical.length,
    warningCount: warnings.length,
    readabilityReport: buildQuizClarityReport(fixedQuestions),
  };
}

/**
 * Apply readability fixes and block assign when unfixable critical issues remain.
 */
export function prepareQuizForAssignment(quiz, context = {}) {
  const result = validateQuizStudentReadability(quiz, context);
  if (!result.valid) {
    const summary = result.issues
      .filter((issue) => issue.severity === "critical")
      .map((issue) => issue.message)
      .slice(0, 4)
      .join(" ");
    throw new QuizReadabilityError(
      summary || "Quiz has confusing questions that could not be auto-fixed.",
      { issues: result.issues },
    );
  }

  return {
    ...quiz,
    questions: result.questions,
    readabilityReport: result.readabilityReport,
    readabilityWarnings: result.warningCount,
  };
}
