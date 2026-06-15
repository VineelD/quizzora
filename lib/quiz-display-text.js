import {
  convertLatexDelimiters,
  fixGluedWordProblemSpacing,
  latexToPlainText,
  normalizeMangledBackslashes,
  normalizeMangledLatexCommands,
  normalizeStudyMessageContent,
  protectMathRegions,
  repairMalformedMathDelimiters,
  stripEscapedDollarArtifacts,
  stripAsciiDiagramArtifacts,
  stripInternalContentMarkers,
  unprotectMathRegions,
  wrapInlineLatex,
} from "./study-message-content.js";

const BRACKET_MATH_PLACEHOLDER = /\[MATH(\d+)\]/gi;
const UNICODE_MATH_PLACEHOLDER = /\uE000MATH\s*(\d+)\uE001/g;
const INTERNAL_CONTENT_MARKER = /\uE000MATH\d+\uE001|\uE004CODE\d+\uE005/g;
const QUADRUPLE_DOLLAR = /\$\$\$\$+/;
const NUMERIC_ONLY_OPTION = /^[\d,.\s%+\-]+$/;

const PLAIN_QUIZ_OPTION_MATH_PATTERN =
  /(\$\$?|\\[(\[]|\\\w|[A-Za-z]_[{\d]|\\(?:frac|sqrt|begin|text|sum|int|sin|cos|tan|log|ln|binom|boxed)\{)/;

function normalizeMathRegionsOnly(text, transform) {
  const { text: protectedText, regions } = protectMathRegions(String(text || ""));
  const normalized = regions.map((region) => transform(region));
  return unprotectMathRegions(protectedText, normalized);
}

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

function findLastUnescapedDollar(text) {
  const value = String(text || "");
  for (let index = value.length - 1; index >= 0; index -= 1) {
    if (value[index] === "$" && (index === 0 || value[index - 1] !== "\\")) {
      return index;
    }
  }
  return -1;
}

function hasUnprotectedMathDollars(text) {
  const { text: protectedText } = protectMathRegions(String(text || "").trim());
  return countUnescapedDollars(protectedText) > 0;
}

const ORPHAN_DOLLAR_LINE = /^\s*\$\$?\s*$/;
const MATRIX_INLINE_ENVIRONMENTS = /\\begin\{(?:pmatrix|bmatrix|vmatrix|Bmatrix|matrix|cases)\}/;

export function repairOrphanDollarLines(text) {
  return String(text || "")
    .split("\n")
    .filter((line) => !ORPHAN_DOLLAR_LINE.test(line))
    .join("\n");
}

function collapseMultilineMathDelimiters(text) {
  let value = String(text || "");

  value = value.replace(/\$\$\s*\n([\s\S]*?)\n\s*\$\$/g, (_, inner) => {
    const collapsed = inner.replace(/\s*\n\s*/g, " ").trim();
    return collapsed ? `$$${collapsed}$$` : "";
  });

  value = value.replace(/\$\$([\s\S]*?)\$\$/g, (_, inner) => {
    const collapsed = inner.replace(/\s*\n\s*/g, " ").trim();
    return collapsed ? `$$${collapsed}$$` : "";
  });

  value = value.replace(/\$\s*\n([\s\S]*?)\n\s*\$/g, (_, inner) => {
    const collapsed = inner.replace(/\s*\n\s*/g, " ").trim();
    return collapsed ? `$${collapsed}$` : "";
  });

  return value;
}

function convertQuizOptionDisplayMathToInline(text) {
  return String(text || "").replace(/\$\$([\s\S]*?)\$\$/g, (_, inner) => {
    const collapsed = inner.replace(/\s*\n\s*/g, " ").trim();
    if (!collapsed) {
      return "";
    }
    if (MATRIX_INLINE_ENVIRONMENTS.test(collapsed)) {
      return `$${collapsed}$`;
    }
    return `$$${collapsed}$$`;
  });
}

function collapseWholeOptionDisplayMath(text) {
  const value = String(text || "").trim();
  if (!value) {
    return value;
  }

  const displayWithExtraClose = value.match(/^\$\$([\s\S]+?)(\$+)$/);
  if (displayWithExtraClose) {
    const inner = displayWithExtraClose[1].trim();
    if (inner) {
      return `$${inner}$`;
    }
  }

  const inlineWithExtraClose = value.match(/^\$([\s\S]+?)(\$\$+)$/);
  if (inlineWithExtraClose) {
    const inner = inlineWithExtraClose[1].trim();
    if (inner) {
      return `$${inner}$`;
    }
  }

  return value;
}

function balanceOrphanDollarDelimiters(text) {
  let value = String(text || "").trim();
  let safety = 0;

  while (safety < 8 && hasUnprotectedMathDollars(value)) {
    safety += 1;

    if (countUnescapedDollars(value) % 2 === 1) {
      const last = findLastUnescapedDollar(value);
      if (last === -1) {
        break;
      }
      value = value.slice(0, last) + value.slice(last + 1);
      continue;
    }

    if (/\$\$[\s\S]+?\$\$/.test(value)) {
      value = value.replace(/\$\$([\s\S]*?)\$\$/g, (_, inner) => {
        const trimmed = inner.trim();
        return trimmed ? `$${trimmed}$` : "";
      });
      continue;
    }

    break;
  }

  return value;
}

/**
 * Repair malformed $ / $$ delimiters in MCQ option text before KaTeX rendering.
 */
export function repairQuizMathDelimiters(text) {
  let value = collapseMultilineMathDelimiters(String(text ?? "")).trim();
  if (!value) {
    return "";
  }

  value = collapseWholeOptionDisplayMath(value);
  value = balanceOrphanDollarDelimiters(value);
  value = convertQuizOptionDisplayMathToInline(value);
  value = repairOrphanDollarLines(value).trim();

  if (hasUnprotectedMathDollars(value)) {
    const stripped = value.replace(/\\\$/g, "").replace(/\$/g, "");
    const plain = latexToPlainText(stripped);
    return plain || stripped.trim();
  }

  return value;
}

export function normalizeQuizOptionMath(text) {
  let value = collapseMultilineMathDelimiters(text);
  value = convertQuizOptionDisplayMathToInline(value);
  return repairOrphanDollarLines(value).trim();
}

const PROSE_MATH_WORD_PATTERN =
  /\b(?:what|is|are|the|of|per|for|monthly|cost|running|this|that|these|those|appliance|household|days?|hours?|given|when|with|and|at|on|in|to|from|if|a|an)\b/i;

const LATEX_COMMAND_PATTERN =
  /\\(?:frac|sqrt|begin|text|sum|int|sin|cos|tan|log|ln|binom|boxed|left|right|mathrm|mathbf|vec|overline|underline|cdot|times|div|pm|mp)/;

/** Remove $...$ wrappers around English prose mistakenly marked as math. */
export function unwrapProseInlineMathDelimiters(text) {
  return String(text || "").replace(/\$([^$\n]+)\$/g, (match, inner) => {
    const body = inner.trim();
    if (!body) {
      return match;
    }

    if (LATEX_COMMAND_PATTERN.test(body)) {
      return match;
    }

    if (/\\[a-zA-Z]+/.test(body)) {
      return match;
    }

    const hasStructure = /[_^{}]/.test(body);
    const englishWords = body.match(/\b[A-Za-z]{2,}\b/g) || [];
    const proseWords = englishWords.filter((word) => PROSE_MATH_WORD_PATTERN.test(word));

    if (proseWords.length >= 2 || (proseWords.length >= 1 && englishWords.length >= 4)) {
      return body;
    }

    if (!hasStructure && englishWords.length >= 3 && /[,;:?]/.test(body)) {
      return body;
    }

    if (/^\d+(?:\.\d+)?(?:\s*(?:%|Ω|ohm|kWh|W|A|V|Hz|kg|m\/s)\b)?$/i.test(body)) {
      return match;
    }

    if (hasStructure && englishWords.length <= 2 && !/\s{2,}/.test(body)) {
      return match;
    }

    return match;
  });
}

function repairQuadrupleDollarDelimiters(text) {
  return String(text || "").replace(QUADRUPLE_DOLLAR, (match) => {
    const pairs = Math.floor(match.length / 2);
    return pairs % 2 === 0 ? "$$".repeat(pairs / 2) : "$".repeat(match.length - 1);
  });
}

function fallbackPlainTextWithoutMath(text) {
  const stripped = String(text || "")
    .replace(BRACKET_MATH_PLACEHOLDER, " ")
    .replace(UNICODE_MATH_PLACEHOLDER, " ")
    .replace(INTERNAL_CONTENT_MARKER, " ")
    .replace(/\\\$/g, "")
    .replace(/\$/g, " ");
  const plain = latexToPlainText(stripped);
  return fixGluedWordProblemSpacing(plain || stripped).replace(/\s+/g, " ").trim();
}

function scrubUnresolvedPlaceholders(text, { expressions = [] } = {}) {
  let value = stripQuizMathPlaceholders(String(text || ""), { expressions });
  if (BRACKET_MATH_PLACEHOLDER.test(value) || UNICODE_MATH_PLACEHOLDER.test(value)) {
    value = value
      .replace(BRACKET_MATH_PLACEHOLDER, " ")
      .replace(UNICODE_MATH_PLACEHOLDER, " ")
      .replace(INTERNAL_CONTENT_MARKER, " ");
    value = fallbackPlainTextWithoutMath(value) || value;
  }
  return value;
}

export function stripQuizMathPlaceholders(text, { expressions = [] } = {}) {
  let value = String(text || "");

  value = value.replace(BRACKET_MATH_PLACEHOLDER, (_, index) => {
    const slot = Number(index);
    const entry = expressions[slot];
    const expression = String(entry?.expression ?? entry ?? "").trim();
    return expression ? `$${expression}$` : " ";
  });

  value = value.replace(UNICODE_MATH_PLACEHOLDER, (_, index) => {
    const slot = Number(index);
    const entry = expressions[slot];
    const expression = String(entry?.expression ?? entry ?? "").trim();
    return expression ? `$${expression}$` : " ";
  });

  value = value.replace(INTERNAL_CONTENT_MARKER, " ");
  return value.replace(/[ \t]{2,}/g, " ");
}

export function sanitizeQuizText(text, { expressions = [] } = {}) {
  let value = normalizeStudyMessageContent(text);
  if (!value) {
    return "";
  }

  value = scrubUnresolvedPlaceholders(value, { expressions });
  value = repairQuadrupleDollarDelimiters(value);
  value = stripAsciiDiagramArtifacts(value);
  value = fixGluedWordProblemSpacing(value);
  value = convertLatexDelimiters(value);
  value = repairMalformedMathDelimiters(value);
  value = stripEscapedDollarArtifacts(value);
  value = unwrapProseInlineMathDelimiters(value);

  value = normalizeMathRegionsOnly(value, (region) => {
    let math = normalizeMangledBackslashes(region);
    math = normalizeMangledLatexCommands(math);
    math = repairMalformedMathDelimiters(math);
    return math;
  });

  value = wrapInlineLatex(value);
  value = repairMalformedMathDelimiters(value);
  value = unwrapProseInlineMathDelimiters(value);
  value = repairQuizMathDelimiters(value);
  value = unwrapProseInlineMathDelimiters(value);
  value = stripInternalContentMarkers(value.trim());

  if (BRACKET_MATH_PLACEHOLDER.test(value) || QUADRUPLE_DOLLAR.test(value)) {
    return fallbackPlainTextWithoutMath(value);
  }

  return value;
}

export function prepareQuizQuestionMarkdown(text, { expressions = [] } = {}) {
  return sanitizeQuizText(text, { expressions });
}

export function isPlainQuizOptionText(text) {
  const value = stripQuizMathPlaceholders(String(text || "")).trim();
  if (!value) {
    return true;
  }
  return !PLAIN_QUIZ_OPTION_MATH_PATTERN.test(value);
}

function unwrapPlainNumericMathDelimiters(text) {
  const trimmed = String(text || "").trim();
  const inline = trimmed.match(/^\$([^$\n]+)\$$/);
  if (inline && NUMERIC_ONLY_OPTION.test(inline[1].trim())) {
    return inline[1].trim();
  }

  const display = trimmed.match(/^\$\$([\s\S]+?)\$\$$/);
  if (display && NUMERIC_ONLY_OPTION.test(display[1].trim())) {
    return display[1].trim();
  }

  return trimmed;
}

function isNumericOnlyQuizOption(text) {
  const value = unwrapPlainNumericMathDelimiters(
    scrubUnresolvedPlaceholders(String(text || "")).trim(),
  );
  return Boolean(value) && NUMERIC_ONLY_OPTION.test(value);
}

export function prepareQuizOptionMarkdown(text, { expressions = [] } = {}) {
  let value = scrubUnresolvedPlaceholders(String(text ?? ""), { expressions });
  if (!value) {
    return "";
  }

  value = fixGluedWordProblemSpacing(value);

  if (isNumericOnlyQuizOption(value)) {
    return stripInternalContentMarkers(unwrapPlainNumericMathDelimiters(value.trim()));
  }

  value = repairQuadrupleDollarDelimiters(value);
  value = repairQuizMathDelimiters(value);
  value = unwrapPlainNumericMathDelimiters(value);
  if (isPlainQuizOptionText(value)) {
    return stripInternalContentMarkers(fixGluedWordProblemSpacing(value).trim());
  }

  value = normalizeQuizOptionMath(value);
  value = repairQuizMathDelimiters(value);
  value = stripInternalContentMarkers(value);

  if (BRACKET_MATH_PLACEHOLDER.test(value) || QUADRUPLE_DOLLAR.test(value)) {
    return fallbackPlainTextWithoutMath(value);
  }

  return value;
}

export function prepareQuizDisplayText(question, options) {
  const source = question && typeof question === "object" ? question : { question };
  const expressions = Array.isArray(source.mathExpressions) ? source.mathExpressions : [];
  const optionList = Array.isArray(options)
    ? options
    : Array.isArray(source.options)
      ? source.options
      : [];

  return {
    question: prepareQuizQuestionMarkdown(String(source.question || ""), { expressions }),
    options: optionList.map((option) => prepareQuizOptionMarkdown(String(option), { expressions })),
  };
}

export function normalizeQuizQuestionFields(question) {
  const expressions = Array.isArray(question?.mathExpressions) ? question.mathExpressions : [];
  const prepared = prepareQuizDisplayText(question, question?.options);

  return {
    ...question,
    question: prepared.question,
    options: prepared.options,
    answer: prepareQuizOptionMarkdown(String(question.answer || ""), { expressions }),
    explanation:
      typeof question.explanation === "string"
        ? sanitizeQuizText(question.explanation, { expressions })
        : question.explanation,
  };
}
