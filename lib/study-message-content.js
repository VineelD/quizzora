const LATEX_BLOCK_ENVIRONMENTS = [
  "cases",
  "align",
  "align*",
  "aligned",
  "aligned*",
  "equation",
  "equation*",
  "gather",
  "gather*",
  "gathered",
  "array",
  "matrix",
  "pmatrix",
  "bmatrix",
  "vmatrix",
  "Bmatrix",
];

const LATEX_DOUBLE_BACKSLASH_COMMANDS = [
  "begin",
  "end",
  "text",
  "quad",
  "frac",
  "geq",
  "leq",
  "times",
  "cdot",
  "ldots",
  "sum",
  "sqrt",
  "alpha",
  "beta",
  "gamma",
  "theta",
  "pi",
  "sigma",
  "mu",
  "infty",
  "pm",
  "neq",
  "approx",
  "equiv",
  "rightarrow",
  "leftarrow",
  "Rightarrow",
  "Leftarrow",
  "forall",
  "exists",
  "partial",
  "nabla",
  "int",
  "lim",
  "log",
  "ln",
  "sin",
  "cos",
  "tan",
  "binom",
  "boxed",
  "mathbf",
  "mathrm",
  "mathit",
  "mathcal",
  "mathbb",
  "vec",
  "hat",
  "bar",
  "tilde",
  "left",
  "right",
  "displaystyle",
  "textstyle",
];

const INLINE_LATEX_COMMAND =
  /(?<!\$)(\\(?!begin\{|end\{|n(?![a-zA-Z])|t(?![a-zA-Z])|r(?![a-zA-Z]))(?:[a-zA-Z]{2,}(?:\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\})*|[a-zA-Z]+))(?!\$)/g;

const LINE_BREAK_PLACEHOLDER = "\uE002LINEBREAK\uE003";

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const ESCAPED_N_EXCEPTIONS =
  "eq|abla|ot|u|ear|ewline|egative|Leftrightarrow|otimes|uplus|warrow|leftarrow|rightarrow";
const ESCAPED_T_EXCEPTIONS =
  "ext|imes|heta|au|an|o|op|riangle|ilde|woheadrightarrow|frac|oday|ag|iny|itle";

function replaceLiteralEscapeSequences(text) {
  let value = String(text || "");

  for (let pass = 0; pass < 3 && /\\[nrt]/.test(value); pass += 1) {
    value = value
      .replace(/\\r\\n/g, "\n")
      .replace(new RegExp(`\\\\n(?!${ESCAPED_N_EXCEPTIONS})`, "g"), "\n")
      .replace(/\\r(?![a-zA-Z])/g, "\n")
      .replace(new RegExp(`\\\\t(?!${ESCAPED_T_EXCEPTIONS})`, "g"), "\t");
  }

  return value;
}

export function normalizeStudyMessageContent(text) {
  let value = String(text ?? "");
  if (!value) {
    return "";
  }

  value = replaceLiteralEscapeSequences(value);
  value = value.replace(/\\(?=\n)/g, "");
  value = value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  return value.trim();
}

const MATH_REGION_TOKEN = /\uE000MATH(\d+)\uE001/g;
const CODE_FENCE_TOKEN = /\uE004CODE(\d+)\uE005/g;
const INTERNAL_CONTENT_MARKER = /\uE000MATH\s*\d+\uE001|\uE004CODE\s*\d+\uE005/g;
const MATH_REGION_TOKEN_LITERAL = /\uE000MATH\d+\uE001/g;

export function stripInternalContentMarkers(text) {
  return String(text || "")
    .replace(INTERNAL_CONTENT_MARKER, "")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

/**
 * Insert spaces where word problems glue digits to letters (e.g. "10,000withanannual").
 */
const GLUED_WORD_BOUNDARIES = [
  "population",
  "compound",
  "interest",
  "repayments",
  "repayment",
  "percentage",
  "percent",
  "increase",
  "decrease",
  "principal",
  "balance",
  "formula",
  "annual",
  "growth",
  "given",
  "month",
  "months",
  "years",
  "year",
  "calculate",
  "determine",
  "between",
  "before",
  "after",
  "every",
  "each",
  "with",
  "from",
  "that",
  "which",
  "when",
  "then",
  "have",
  "were",
  "was",
  "are",
  "has",
  "had",
  "the",
  "and",
  "for",
  "not",
  "you",
  "can",
  "per",
  "rate",
  "loan",
  "find",
  "is",
  "of",
  "in",
  "on",
  "at",
  "to",
  "by",
  "an",
  "a",
  "if",
];

function splitGluedEnglishWords(segment) {
  let value = String(segment || "");
  if (!value || !/[a-z]{4,}[a-z]{4,}/i.test(value)) {
    return value;
  }

  const sortedWords = [...GLUED_WORD_BOUNDARIES].sort((left, right) => right.length - left.length);
  let output = "";
  let index = 0;

  while (index < value.length) {
    const char = value[index];
    if (!/[A-Za-z]/.test(char)) {
      output += char;
      index += 1;
      continue;
    }

    let start = index;
    while (index < value.length && /[A-Za-z]/.test(value[index])) {
      index += 1;
    }

    const run = value.slice(start, index);
    if (run.length < 8 || /\s/.test(run)) {
      output += run;
      continue;
    }

    let cursor = 0;
    let rebuilt = "";
    while (cursor < run.length) {
      let matched = false;
      for (const word of sortedWords) {
        const slice = run.slice(cursor, cursor + word.length);
        if (slice.toLowerCase() === word.toLowerCase()) {
          if (rebuilt && !rebuilt.endsWith(" ")) {
            rebuilt += " ";
          }
          rebuilt += slice;
          cursor += word.length;
          matched = true;
          break;
        }
      }
      if (!matched) {
        if (rebuilt && !rebuilt.endsWith(" ") && rebuilt.length > 0) {
          rebuilt += " ";
        }
        rebuilt += run[cursor];
        cursor += 1;
      }
    }

    if (output && rebuilt && !/\s$/.test(output) && !/^[,.;:!?)}\]]/.test(rebuilt)) {
      output += " ";
    }
    output += rebuilt.trim();
  }

  return output.replace(/\s{2,}/g, " ");
}

export function fixGluedWordProblemSpacing(text) {
  let value = String(text || "");
  if (!value) {
    return "";
  }

  const { text: protectedText, regions } = protectMathRegions(value);
  const parts = protectedText.split(MATH_REGION_TOKEN_LITERAL);
  const tokens = protectedText.match(MATH_REGION_TOKEN_LITERAL) || [];

  const transformSegment = (segment) => {
    let outside = segment;
    outside = outside.replace(/(?<=[\d,])(?=[A-Za-z])/g, " ");
    outside = outside.replace(/(?<=[A-Za-z])(?=[\d])/g, " ");
    outside = outside.replace(/(?<=[a-z])(?=[A-Z])/g, " ");
    return splitGluedEnglishWords(outside);
  };

  let rebuilt = "";
  for (let index = 0; index < parts.length; index += 1) {
    rebuilt += transformSegment(parts[index]);
    if (index < tokens.length) {
      rebuilt += tokens[index];
    }
  }

  return unprotectMathRegions(rebuilt, regions);
}

function protectBareBlockEnvironments(text, regions) {
  let value = String(text || "");

  for (const env of LATEX_BLOCK_ENVIRONMENTS) {
    const envPattern = escapeRegExp(env);
    const pattern = new RegExp(`\\\\begin\\{${envPattern}\\}[\\s\\S]*?\\\\end\\{${envPattern}\\}`, "g");
    value = value.replace(pattern, (match) => {
      const token = `\uE000MATH${regions.length}\uE001`;
      regions.push(match);
      return token;
    });
  }

  return value;
}

export function protectMathRegions(text) {
  const regions = [];
  let value = String(text || "");

  value = value.replace(/\$\$[\s\S]*?\$\$/g, (match) => {
    const token = `\uE000MATH${regions.length}\uE001`;
    regions.push(match);
    return token;
  });

  value = value.replace(/\$[^$\n]+\$/g, (match) => {
    const token = `\uE000MATH${regions.length}\uE001`;
    regions.push(match);
    return token;
  });

  value = value.replace(/\\\[[\s\S]*?\\\]/g, (match) => {
    const token = `\uE000MATH${regions.length}\uE001`;
    regions.push(match);
    return token;
  });

  value = value.replace(/\\\([\s\S]*?\\\)/g, (match) => {
    const token = `\uE000MATH${regions.length}\uE001`;
    regions.push(match);
    return token;
  });

  value = protectBareBlockEnvironments(value, regions);

  return { text: value, regions };
}

export function unprotectMathRegions(text, regions) {
  return String(text || "").replace(MATH_REGION_TOKEN, (_, index) => regions[Number(index)] ?? _);
}

export function protectCodeFences(text) {
  const regions = [];
  let value = String(text || "");
  value = value.replace(/```[\s\S]*?```/g, (match) => {
    const token = `\uE004CODE${regions.length}\uE005`;
    regions.push(match);
    return token;
  });
  return { text: value, regions };
}

export function unprotectCodeFences(text, regions) {
  return String(text || "").replace(CODE_FENCE_TOKEN, (_, index) => regions[Number(index)] ?? _);
}

function formatStudyMessageListSegment(segment) {
  let value = String(segment || "");
  if (!value) {
    return "";
  }

  value = value.replace(/(?<=[^\n])\s+(?=\d+\.\s+\S)/g, "\n\n");
  value = value.replace(/(?<=[^\n])\s+(?=-\s+\S)/g, "\n");
  return value;
}

export function formatStudyMessageLists(text) {
  let value = String(text || "");
  if (!value) {
    return "";
  }

  return transformOutsideMathBlocks(value, formatStudyMessageListSegment);
}

function splitCasesEquations(inner) {
  let value = String(inner || "").trim();
  if (!value || value.includes("\\\\")) {
    return value;
  }

  value = value.replace(
    /(?<=\S)\s+(?=[A-Za-z](?:_\{[^}]+\}|_[A-Za-z0-9])\s*=)/g,
    " \\\\ ",
  );
  value = value.replace(
    /,\s*(?=[A-Za-z](?:_\{[^}]+\}|_[A-Za-z0-9])\s*=)/g,
    " \\\\ ",
  );
  value = value.replace(/,\s*(?=\\text\{)/g, " \\\\ ");
  value = value.replace(/,\s*(?=\\\\)/g, "");
  value = value.replace(/\s+,/g, ",");
  return value;
}

export function normalizeMangledLatexCommands(text) {
  return String(text || "").replace(/(?<![\\a-zA-Z])ext\{/g, "\\text{");
}

export function normalizeMangledBackslashes(text) {
  let value = String(text || "");
  if (!value.includes("\\")) {
    return value;
  }

  value = value.replace(/\\\\(?![a-zA-Z])/g, LINE_BREAK_PLACEHOLDER);
  value = value.replace(/\\\\begin\{/g, "\\begin{");
  value = value.replace(/\\\\end\{/g, "\\end{");

  for (const command of LATEX_DOUBLE_BACKSLASH_COMMANDS) {
    if (command === "begin" || command === "end") {
      continue;
    }
    const pattern = new RegExp(`\\\\\\\\${command}(?=[\\{\\s]|$)`, "g");
    value = value.replace(pattern, `\\${command}`);
  }

  return value.replaceAll(LINE_BREAK_PLACEHOLDER, "\\\\");
}

function protectExistingDisplayMath(text, regions) {
  return String(text || "").replace(/\$\$[\s\S]*?\$\$/g, (match) => {
    const token = `\uE000MATH${regions.length}\uE001`;
    regions.push(match);
    return token;
  });
}

function transformBareBlockEnvironments(text, transform) {
  const regions = [];
  let value = protectExistingDisplayMath(text, regions);

  for (const env of LATEX_BLOCK_ENVIRONMENTS) {
    const envPattern = escapeRegExp(env);
    const pattern = new RegExp(`\\\\begin\\{${envPattern}\\}[\\s\\S]*?\\\\end\\{${envPattern}\\}`, "g");
    value = value.replace(pattern, (match) => transform(match, env));
  }

  return unprotectMathRegions(value, regions);
}

export function repairUnclosedMathDelimiters(text) {
  let value = String(text || "");
  if (!value.includes("$")) {
    return value;
  }

  const trimmed = value.trim();
  const displayDelimiterCount = (trimmed.match(/\$\$/g) || []).length;
  if (
    displayDelimiterCount === 2 &&
    trimmed.startsWith("$$") &&
    trimmed.endsWith("$$") &&
    trimmed.indexOf("$$", 2) === trimmed.length - 2
  ) {
    const { text: protectedText, regions } = protectMathRegions(value);
    let outside = protectedText;
    let dollarCount = 0;
    for (const char of outside) {
      if (char === "$") {
        dollarCount += 1;
      }
    }
    if (dollarCount % 2 === 1) {
      outside = `${outside}$`;
    }
    return unprotectMathRegions(outside, regions);
  }

  const displayParts = value.split("$$");
  if (displayParts.length % 2 === 0) {
    value = `${value}$$`;
  }

  const { text: protectedText, regions } = protectMathRegions(value);
  let outside = protectedText;
  let dollarCount = 0;
  for (const char of outside) {
    if (char === "$") {
      dollarCount += 1;
    }
  }
  if (dollarCount % 2 === 1) {
    outside = `${outside}$`;
  }

  return unprotectMathRegions(outside, regions);
}

export function repairCasesEnvironmentTypos(text) {
  return String(text || "")
    .replace(/\\begin\{case\}(?!s)/g, "\\begin{cases}")
    .replace(/\\end\{case\}(?!s)/g, "\\end{cases}");
}

export function stripLeadingPartialMath(text) {
  let value = String(text || "").trimStart();

  for (let pass = 0; pass < 8; pass += 1) {
    const before = value;
    const endMatch = value.match(/^\\end\{[a-zA-Z*]+\}\s*/);
    if (endMatch) {
      value = value.slice(endMatch[0].length);
      value = value.replace(/^\$\$\s*/, "");
      continue;
    }
    value = value.replace(/^\\\]\s*/, "");
    value = value.replace(/^\\\)\s*/, "");
    if (value === before) {
      break;
    }
  }

  return value;
}

export function separateMathFromMarkdownHeaders(text) {
  let value = String(text || "");

  value = value.replace(/(\$\$)[ \t]+(###\s)/g, "$1\n\n$2");
  value = value.replace(/\\end\{cases\}[ \t]*\$\$[ \t]+(###\s)/g, "\\end{cases}\n$$\n\n$1");

  return value;
}

const ASCII_DIAGRAM_BODY_PATTERN = /-->|\|{2,}|\+-+|\*{2,}|_{2,}|\\\/\\\/|(?:^|\n)\s*[A-Z][0-9]?\s*[=:]/m;

const ASCII_TEXT_FENCE_PATTERN = /(?:^|\n)```text[\s\S]*?```/g;

const ASCII_ARROW_FLOW_LINE = /^\s*.+\s*-->\s*.+$/m;

const ASCII_DIAGRAM_HEADER =
  /^###\s*(?:Diagram|Labels|Flow|Tree|Structure|Visual):[^\n]*$/i;

function isAsciiDiagramLine(line) {
  const trimmed = String(line || "").trim();
  if (!trimmed) {
    return false;
  }
  if (ASCII_ARROW_FLOW_LINE.test(trimmed)) {
    return true;
  }
  if (/^-\s+[A-Za-z0-9_()[\]+-]+(?:,\s*[A-Za-z0-9_()[\]+-]+)*$/.test(trimmed)) {
    return true;
  }
  if (/^[A-Za-z]\d?\s*[=:]\s*[A-Za-z0-9_()+ ]+$/.test(trimmed)) {
    return true;
  }
  return false;
}

function stripDiagramSectionBody(body) {
  const lines = String(body || "").split("\n");
  const kept = [];
  let seenDiagramLine = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    if (isAsciiDiagramLine(trimmed)) {
      seenDiagramLine = true;
      continue;
    }

    if (!seenDiagramLine && trimmed.startsWith("```")) {
      continue;
    }

    kept.push(trimmed);
  }

  return kept.join("\n\n");
}

export function stripAsciiDiagramArtifacts(text) {
  let value = String(text || "");
  if (!value.trim()) {
    return "";
  }

  const lines = value.split("\n");
  const output = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (ASCII_DIAGRAM_HEADER.test(line.trim())) {
      index += 1;
      const bodyLines = [];
      while (index < lines.length && !ASCII_DIAGRAM_HEADER.test(lines[index].trim())) {
        bodyLines.push(lines[index]);
        index += 1;
      }
      const body = bodyLines.join("\n");
      if (/```\s*mermaid/i.test(body)) {
        output.push(line, ...bodyLines);
      } else {
        const preserved = stripDiagramSectionBody(body);
        if (preserved) {
          output.push(preserved);
        }
      }
      continue;
    }

    if (isAsciiDiagramLine(line)) {
      index += 1;
      continue;
    }

    output.push(line);
    index += 1;
  }

  value = output.join("\n");
  value = value.replace(ASCII_TEXT_FENCE_PATTERN, "");
  return value.replace(/\n{3,}/g, "\n\n").trim();
}

const SUPERSCRIPT_DIGITS = {
  0: "⁰",
  1: "¹",
  2: "²",
  3: "³",
  4: "⁴",
  5: "⁵",
  6: "⁶",
  7: "⁷",
  8: "⁸",
  9: "⁹",
};

function toSuperscriptDigits(value) {
  return String(value || "")
    .split("")
    .map((char) => SUPERSCRIPT_DIGITS[char] || char)
    .join("");
}

const LATEX_TO_PLAIN_REPLACEMENTS = [
  [/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, "($1)/($2)"],
  [/\\sqrt\{([^{}]+)\}/g, "square root of ($1)"],
  [/\\text\{([^{}]+)\}/g, "$1"],
  [/\\sin\b/g, "sin"],
  [/\\cos\b/g, "cos"],
  [/\\tan\b/g, "tan"],
  [/\\quad/g, " "],
  [/\\cdot/g, "·"],
  [/\\times/g, "×"],
  [/\\pm/g, "±"],
  [/\\geq/g, "≥"],
  [/\\leq/g, "≤"],
  [/\\neq/g, "≠"],
  [/\\approx/g, "≈"],
  [/\\infty/g, "∞"],
  [/\\pi\b/g, "π"],
  [/\\alpha\b/g, "α"],
  [/\\beta\b/g, "β"],
  [/\\gamma\b/g, "γ"],
  [/\\theta\b/g, "θ"],
  [/\\mu\b/g, "μ"],
  [/\\sigma\b/g, "σ"],
  [/\\lambda\b/g, "λ"],
  [/\\Delta\b/g, "Δ"],
  [/_\{([^{}]+)\}/g, "_$1"],
  [/\^\{([^{}]+)\}/g, "^$1"],
  [/\^2\b/g, " squared"],
  [/\^3\b/g, " cubed"],
  [/\\[a-zA-Z]+/g, " "],
];

const LATEX_TO_UNICODE_REPLACEMENTS = [
  [/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, "$1⁄$2"],
  [/\\sqrt\{([^{}]+)\}/g, "√($1)"],
  [/\\text\{([^{}]+)\}/g, "$1"],
  [/\\sin\b/g, "sin"],
  [/\\cos\b/g, "cos"],
  [/\\tan\b/g, "tan"],
  [/\\cdot/g, "·"],
  [/\\times/g, "×"],
  [/\\pm/g, "±"],
  [/\\geq/g, "≥"],
  [/\\leq/g, "≤"],
  [/\\neq/g, "≠"],
  [/\\approx/g, "≈"],
  [/\\infty/g, "∞"],
  [/\\pi\b/g, "π"],
  [/\\alpha\b/g, "α"],
  [/\\beta\b/g, "β"],
  [/\\gamma\b/g, "γ"],
  [/\\theta\b/g, "θ"],
  [/\\mu\b/g, "μ"],
  [/\\sigma\b/g, "σ"],
  [/\\lambda\b/g, "λ"],
  [/\\Delta\b/g, "Δ"],
  [/\\delta\b/g, "δ"],
  [/\^\{([0-9]+)\}/g, (_, digits) => toSuperscriptDigits(digits)],
  [/\^([0-9]+)/g, (_, digits) => toSuperscriptDigits(digits)],
  [/_\{([^{}]+)\}/g, "₍$1₎"],
  [/\\[a-zA-Z]+/g, ""],
  [/[{}]/g, ""],
];

export function latexChunkToPlainText(latex) {
  let value = String(latex || "").trim();
  if (!value) {
    return "";
  }

  for (const [pattern, replacement] of LATEX_TO_PLAIN_REPLACEMENTS) {
    value = value.replace(pattern, replacement);
  }

  return value.replace(/\s+/g, " ").trim();
}

export function latexChunkToUnicode(latex) {
  let value = String(latex || "").trim();
  if (!value) {
    return "";
  }

  for (const [pattern, replacement] of LATEX_TO_UNICODE_REPLACEMENTS) {
    value = value.replace(pattern, replacement);
  }

  value = value.replace(/\s*([+=\-*/])\s*/g, " $1 ");
  return value.replace(/\s+/g, " ").trim();
}

export function latexToUnicode(text) {
  let value = stripEscapedDollarArtifacts(String(text || ""));
  if (!value.trim()) {
    return "";
  }

  value = value.replace(/\$\$([\s\S]+?)\$\$/g, (_, inner) => latexChunkToUnicode(inner));
  value = value.replace(/\$([^$\n]+)\$/g, (_, inner) => latexChunkToUnicode(inner));
  value = value.replace(/\\\$/g, "");
  value = value.replace(/\$/g, "");
  return value.replace(/\s+/g, " ").trim();
}

export function latexToPlainText(text) {
  let value = stripEscapedDollarArtifacts(String(text || ""));
  if (!value.trim()) {
    return "";
  }

  value = value.replace(/\$\$([\s\S]+?)\$\$/g, (_, inner) => latexChunkToPlainText(inner));
  value = value.replace(/\$([^$\n]+)\$/g, (_, inner) => latexChunkToPlainText(inner));
  value = value.replace(/\\\$/g, "");
  value = value.replace(/\$/g, "");
  value = value.replace(/\*\*([^*]+)\*\*/g, "$1");
  value = value.replace(/\*([^*]+)\*/g, "$1");
  value = value.replace(/`([^`]+)`/g, "$1");
  return value.replace(/\s+/g, " ").trim();
}

export function stripEscapedDollarArtifacts(text) {
  let value = String(text || "");
  if (!value.includes("$") && !value.includes("\\$")) {
    return value;
  }

  value = value.replace(/\$\\\$/g, "$");
  value = value.replace(/\\\$/g, "");
  return value;
}

function wrapAsciiDiagramBody(header, body) {
  const trimmed = String(body || "").trim();
  if (!trimmed || trimmed.startsWith("```")) {
    return `${header}${body}`;
  }

  if (!ASCII_DIAGRAM_BODY_PATTERN.test(trimmed)) {
    return `${header}${body}`;
  }

  return `${header}\n\`\`\`text\n${trimmed}\n\`\`\`\n`;
}

export function wrapAsciiDiagramSections(text) {
  let value = String(text || "");
  if (!/###\s*(?:Diagram|Labels|Flow|Tree|Structure|Visual):/i.test(value)) {
    return value;
  }

  const sectionPattern =
    /(###\s*(?:Diagram|Labels|Flow|Tree|Structure|Visual):[^\n]*\n)([\s\S]*?)(?=\n###\s|\n\n###\s|$)/gi;

  value = value.replace(sectionPattern, (match, header, body) => wrapAsciiDiagramBody(header, body));
  return value;
}

export function repairOrphanEndCases(text) {
  let value = String(text || "");
  if (!/\\end\{cases\}/.test(value)) {
    return value;
  }

  let safety = 0;
  while (safety < 32) {
    safety += 1;
    const tokens = [];
    const pattern = /\\begin\{cases\}|\\end\{cases\}/g;
    let match;
    while ((match = pattern.exec(value)) !== null) {
      tokens.push({ type: match[0], index: match.index });
    }

    let balance = 0;
    let orphanIndex = -1;
    for (const token of tokens) {
      if (token.type === "\\begin{cases}") {
        balance += 1;
      } else if (balance === 0) {
        orphanIndex = token.index;
        break;
      } else {
        balance -= 1;
      }
    }

    if (orphanIndex === -1) {
      break;
    }

    const prevEnd = value.lastIndexOf("\\end{cases}", orphanIndex - 1);
    const blockStart = prevEnd === -1 ? 0 : prevEnd + "\\end{cases}".length;
    const inner = value.slice(blockStart, orphanIndex).trim();
    value = `${value.slice(0, blockStart)}\\begin{cases}${inner}${value.slice(orphanIndex)}`;
  }

  return value;
}

export function repairOrphanDisplayDelimiters(text) {
  let value = String(text || "");

  value = value.replace(
    /(^|[^\$])([^\n$]*\\end\{cases\})\$\$(?!\$)/g,
    (_, prefix, block) => {
      if (block.includes("$$")) {
        return `${prefix}${block}$$`;
      }
      const trimmed = block.trim();
      if (!trimmed.includes("\\end{cases}")) {
        return `${prefix}${block}$$`;
      }
      return `${prefix}$$\n${trimmed}\n$$`;
    },
  );

  value = value.replace(/\$\$\s*\\begin\{cases\}\s*\\end\{cases\}\s*\$\$/g, "");

  return value;
}

function sanitizeMathChunk(text) {
  let chunk = String(text || "").trim();
  if (!chunk) {
    return "";
  }

  chunk = repairMalformedMathQuickFixes(chunk);
  chunk = repairCasesEnvironmentTypos(chunk);
  chunk = convertLatexDelimiters(chunk);
  chunk = repairOrphanEndCases(chunk);
  chunk = fixMalformedCasesEnvironments(chunk);
  chunk = repairOrphanDisplayDelimiters(chunk);
  chunk = convertBlockLatexEnvironments(chunk);
  chunk = repairUnclosedMathDelimiters(chunk);
  chunk = wrapInlineLatex(chunk);
  chunk = repairMalformedMathDelimiters(chunk);
  return chunk;
}

export function splitAndSanitizeMathChunks(text) {
  let value = separateMathFromMarkdownHeaders(String(text || "").trim());
  if (!value) {
    return "";
  }

  const pieces = value.split(/(?:^|\n)(?=###\s)/);
  const sanitized = pieces
    .map((piece) => {
      const trimmed = piece.trim();
      if (!trimmed) {
        return "";
      }

      if (trimmed.startsWith("###")) {
        const newline = trimmed.indexOf("\n");
        if (newline === -1) {
          return trimmed;
        }
        const header = trimmed.slice(0, newline);
        const body = sanitizeMathChunk(trimmed.slice(newline + 1));
        return body ? `${header}\n${body}` : header;
      }

      return sanitizeMathChunk(trimmed);
    })
    .filter(Boolean);

  return stripAsciiDiagramArtifacts(sanitized.join("\n\n"));
}

const ORPHAN_FORMULA_LINE =
  /^(?:\$\$[\s\S]+\$\$|\$[^$\n]+\$|(?:\\(?:frac|sqrt|sum|int|binom|boxed)\{[^{}]*\}(?:\{[^{}]*\})?[^$\n]*))$/;

const ORPHAN_FORMULA_INLINE =
  /(?:^|[\s(])((?:\\(?:frac|sqrt|sum|int|binom|boxed)\{[^{}]*\}(?:\{[^{}]*\})?|[A-Za-z](?:_\{[^}]+\}|_[A-Za-z0-9])?\s*=\s*[^.\n]+))/g;

export function extractOrphanLatexFormulas(text, existingFormulas = []) {
  const formulas = Array.isArray(existingFormulas) ? [...existingFormulas] : [];
  const seen = new Set(
    formulas
      .map((item) => sanitizeStudyMathContent(String(item?.expression || "").trim()))
      .filter(Boolean),
  );

  let content = String(text || "").trim();
  if (!content) {
    return { content: "", formulas };
  }

  const paragraphs = content.split(/\n{2,}/);
  const kept = [];

  for (const paragraph of paragraphs) {
    const trimmed = paragraph.trim();
    if (!trimmed) {
      continue;
    }

    if (ORPHAN_FORMULA_LINE.test(trimmed)) {
      const expression = sanitizeStudyMathContent(trimmed.replace(/^\$\$|\$\$$/g, "").replace(/^\$|\$$/g, ""));
      if (expression && !seen.has(expression)) {
        seen.add(expression);
        formulas.push({ label: "", expression });
      }
      continue;
    }

    kept.push(trimmed);
  }

  content = kept.join("\n\n");

  for (const match of content.matchAll(ORPHAN_FORMULA_INLINE)) {
    const candidate = sanitizeStudyMathContent(String(match[1] || "").trim());
    if (!candidate || !/[=\\^_]/.test(candidate) || seen.has(candidate)) {
      continue;
    }
    seen.add(candidate);
    formulas.push({ label: "", expression: candidate });
  }

  return { content: content.trim(), formulas };
}

export function repairPartialCasesBlocks(text) {
  let value = repairCasesEnvironmentTypos(String(text || ""));

  if (/^\\end\{cases\}/.test(value.trimStart())) {
    value = stripLeadingPartialMath(value);
  }

  return repairOrphanEndCases(value);
}

export function fixMalformedCasesEnvironments(text) {
  const regions = [];
  let value = protectExistingDisplayMath(repairCasesEnvironmentTypos(String(text || "")), regions);
  const pattern = /\\begin\{cases\}([\s\S]*?)\\end\{cases\}/g;

  value = value.replace(pattern, (_, inner) => {
    let fixed = inner.replace(/\$/g, "");
    fixed = normalizeMangledLatexCommands(fixed);
    fixed = splitCasesEquations(fixed);
    return `\\begin{cases}${fixed}\\end{cases}`;
  });

  return unprotectMathRegions(value, regions);
}

export function convertBlockLatexEnvironments(text) {
  return transformBareBlockEnvironments(String(text || ""), (match) => `\n\n$$\n${match.trim()}\n$$\n\n`);
}

export function convertLatexDelimiters(text) {
  return String(text || "")
    .replace(/\\\[([\s\S]*?)\\\]/g, (_, math) => `\n\n$$${math.trim()}$$\n\n`)
    .replace(/\\\(([\s\S]*?)\\\)/g, (_, math) => `$${math.trim()}$`);
}

function transformOutsideMathBlocks(text, transform) {
  const blockParts = String(text || "").split(/(\$\$[\s\S]*?\$\$)/g);

  return blockParts
    .map((blockPart) => {
      if (blockPart.startsWith("$$") && blockPart.endsWith("$$")) {
        return blockPart;
      }

      const inlineParts = blockPart.split(/(\$[^$\n]+\$)/g);
      return inlineParts
        .map((inlinePart) => {
          if (inlinePart.startsWith("$") && inlinePart.endsWith("$") && inlinePart.length > 1) {
            return inlinePart;
          }
          return transform(inlinePart);
        })
        .join("");
    })
    .join("");
}

function mergeAdjacentInlineMath(text) {
  return text.replace(/(?<!\$)\$(?!\$)\s*\$(?!\$)/g, " ");
}

function collapseNestedInlineMath(text) {
  let value = String(text || "");
  let previous = null;

  while (previous !== value) {
    previous = value;
    value = value.replace(/\$([^$\n]*)\$([^$\n]+)\$([^$\n]*)\$/g, (_, before, middle, after) => {
      const inner = `${before}${middle}${after}`.replace(/\s+/g, " ").trim();
      return `$${inner}$`;
    });
  }

  return value;
}

function mergeAdjacentInlineMathExpressions(text) {
  let value = String(text || "");
  let previous = null;

  while (previous !== value) {
    previous = value;
    value = value.replace(
      /\$([^$\n]+)\$\s*([+\-*/])\s*\$([^$\n]+)\$(\s*=\s*[^$\n]+)?(?=\s|[,.;:!?)]|$)/g,
      (_, left, operator, right, eqPart) => {
        const merged = eqPart
          ? `${left.trim()} ${operator} ${right.trim()} ${eqPart.trim()}`
          : `${left.trim()} ${operator} ${right.trim()}`;
        return `$${merged}$`;
      },
    );
  }

  value = value.replace(/\$([^$\n]+)\$(\s*=\s*[^$\n]+)(?=\s|[,.;:!?)]|$)/g, (_, inner, eqPart) => {
    return `$${inner.trim()} ${eqPart.trim()}$`;
  });

  return value;
}

function repairMalformedMathQuickFixes(text) {
  let value = stripEscapedDollarArtifacts(String(text || ""));
  if (!value.includes("$")) {
    return value;
  }

  value = value.replace(/---\$\$/g, "---");
  value = value.replace(/\$\$---/g, "---");
  value = value.replace(/\$\\\$/g, "$");
  value = value.replace(/(\d)\s*\}\s*\$\$/g, "$1$$");
  value = value.replace(/=\s*([^$\n{}]+?)\s*\}\s*\$\$/g, "= $1$");

  value = transformOutsideDisplayMathOnly(value, (segment) =>
    segment.replace(/(?<!\$)(\$[^$\n]*=\s*[^$\n]+)\$\$/g, "$1$"),
  );

  return value;
}

function needsInlineMathMerge(text) {
  const value = String(text || "");
  if (!value.includes("$")) {
    return false;
  }

  return (
    /\$\\\$/.test(value) ||
    /\d\s*\}\s*\$\$/.test(value) ||
    /(\$[^$\n]+\$)\s*\$\$/.test(value) ||
    (/\$\\(?:sin|cos|tan)/i.test(value) && (value.match(/\$/g) || []).length > 2)
  );
}

function transformOutsideDisplayMathOnly(text, transform) {
  const blockParts = String(text || "").split(/(\$\$[\s\S]*?\$\$)/g);

  return blockParts
    .map((blockPart) => {
      if (blockPart.startsWith("$$") && blockPart.endsWith("$$")) {
        return blockPart;
      }
      return transform(blockPart);
    })
    .join("");
}

export function repairMalformedMathDelimiters(text) {
  let value = repairMalformedMathQuickFixes(text);

  if (!needsInlineMathMerge(value)) {
    return value;
  }

  value = transformOutsideDisplayMathOnly(value, (segment) => {
    let chunk = segment.replace(/\$\\\$/g, "$");
    chunk = chunk.replace(/(\$[^$\n]+\$)\s*\$\$/g, "$1");
    chunk = collapseNestedInlineMath(chunk);
    chunk = mergeAdjacentInlineMathExpressions(chunk);
    return chunk;
  });

  return value;
}

const BRACED_INLINE_LATEX_COMMANDS = [
  "boxed",
  "text",
  "sqrt",
  "mathbf",
  "mathrm",
  "mathit",
  "mathcal",
  "mathbb",
  "vec",
  "hat",
  "bar",
  "tilde",
];

const TWO_ARG_INLINE_LATEX_COMMANDS = ["frac", "binom"];

const UNICODE_MATH_SYMBOLS = {
  "±": "\\pm",
  "∓": "\\mp",
  "∫": "\\int",
  "∑": "\\sum",
  "∏": "\\prod",
  "∞": "\\infty",
  "≈": "\\approx",
  "≠": "\\neq",
  "≡": "\\equiv",
  "≤": "\\leq",
  "≥": "\\geq",
  "×": "\\times",
  "÷": "\\div",
  "π": "\\pi",
  "α": "\\alpha",
  "β": "\\beta",
  "γ": "\\gamma",
  "δ": "\\delta",
  "θ": "\\theta",
  "μ": "\\mu",
  "σ": "\\sigma",
  "λ": "\\lambda",
  "Δ": "\\Delta",
};

const UNICODE_MATH_PATTERN = /[√±∓∫∑∏∞≈≠≡≤≥×÷παβγδθμσλΔ°]/;
const INLINE_MATH_MARKERS = /\\|_|(?<!\$)\^|[√±∓∫∑∏∞≈≠≡≤≥×÷παβγδθμσλΔ°]/;

function convertSqrtUnicode(text) {
  let value = String(text || "");
  value = value.replace(/√\s*\(([^)]+)\)/g, (_, inner) => `\\sqrt{${inner.trim()}}`);
  value = value.replace(/√\s*([A-Za-z0-9]+(?:\.[0-9]+)?)/g, (_, arg) => `\\sqrt{${arg}}`);
  return value;
}

export function convertUnicodeMathSymbols(text) {
  let value = convertSqrtUnicode(String(text || ""));
  if (!UNICODE_MATH_PATTERN.test(value)) {
    return value;
  }

  value = value.replace(/(\d+)\s*°/g, "$1^{\\circ}");
  for (const [symbol, latex] of Object.entries(UNICODE_MATH_SYMBOLS)) {
    value = value.split(symbol).join(latex);
  }

  return value;
}

function wrapBracedLatexCommands(segment) {
  let value = String(segment || "");

  for (const command of TWO_ARG_INLINE_LATEX_COMMANDS) {
    const pattern = new RegExp(`\\\\${command}\\{[^{}]*\\}\\{[^{}]*\\}`, "g");
    value = value.replace(pattern, (match) => `$${match}$`);
  }

  for (const command of BRACED_INLINE_LATEX_COMMANDS) {
    const pattern = new RegExp(`\\\\${command}\\{[^{}]*\\}`, "g");
    value = value.replace(pattern, (match) => `$${match}$`);
  }

  return value;
}

function wrapSegmentWithInlineMath(segment) {
  if (!segment) {
    return segment;
  }

  let value = wrapBracedLatexCommands(segment);
  const protectedParts = value.split(/(\$[^$\n]+\$)/g);

  return protectedParts
    .map((part) => {
      if (part.startsWith("$") && part.endsWith("$") && part.length > 1) {
        return part;
      }

      let chunk = part;
      chunk = chunk.replace(
        /\b([A-Za-z](?:_\{[^}]+\}|_[A-Za-z0-9])(?:\s*[=+\-*/]\s*(?:[A-Za-z](?:_\{[^}]+\}|_[A-Za-z0-9])|[0-9]+(?:\.[0-9]+)?|\([^)]+\)|\\[a-zA-Z]+(?:\{[^{}]*\})?))+)/g,
        (match) => `$${match.trim()}$`,
      );

      const inlineParts = chunk.split(/(\$[^$\n]+\$)/g);
      return inlineParts
        .map((inlinePart) => {
          if (inlinePart.startsWith("$") && inlinePart.endsWith("$") && inlinePart.length > 1) {
            return inlinePart;
          }

          let inner = inlinePart;
          inner = inner.replace(/(\\[a-zA-Z]{2,})(\^(?:\{[^{}]+\}|\d+))/g, (match) => `$${match}$`);
          inner = inner.replace(INLINE_LATEX_COMMAND, (match) => `$${match}$`);
          inner = inner.replace(
            /(?<![\\a-zA-Z$\\^])([A-Za-z0-9])(\^(?:\{[^{}]+\}|\d+))(?![$\\w])/g,
            (match) => `$${match}$`,
          );
          inner = inner.replace(
            /(?<![$\\w])([A-Za-z](?:_\{[^}]+\}|_[A-Za-z0-9]))(?![$\\w])/g,
            (match) => `$${match}$`,
          );
          return inner;
        })
        .join("");
    })
    .join("");
}

export function wrapInlineLatex(text) {
  const source = String(text || "");
  if (!INLINE_MATH_MARKERS.test(source)) {
    return source;
  }

  const outsideExistingMath = source
    .replace(/\$\$[\s\S]*?\$\$/g, "")
    .replace(/\$[^$\n]+\$/g, "");
  if (!INLINE_MATH_MARKERS.test(outsideExistingMath)) {
    return mergeAdjacentInlineMath(source);
  }

  const wrapped = transformOutsideMathBlocks(source, wrapSegmentWithInlineMath);
  return mergeAdjacentInlineMath(wrapped);
}

export function sanitizeStudyMathContent(text) {
  const normalized = normalizeStudyMessageContent(text);
  if (!normalized) {
    return "";
  }

  const { text: fencedText, regions: codeFenceRegions } = protectCodeFences(normalized);

  let prepared = normalizeMangledBackslashes(fencedText);
  prepared = convertUnicodeMathSymbols(prepared);
  prepared = normalizeMangledLatexCommands(prepared);
  prepared = prepared.replace(/^OFF-TOPIC:\s*/im, "");
  prepared = convertLatexDelimiters(prepared);
  prepared = repairPartialCasesBlocks(prepared);
  prepared = fixMalformedCasesEnvironments(prepared);
  prepared = separateMathFromMarkdownHeaders(prepared);

  if (/(?:^|\n|(?<=\$\$\s*))###\s/.test(prepared)) {
    prepared = splitAndSanitizeMathChunks(prepared);
  } else {
    prepared = convertBlockLatexEnvironments(prepared);
    prepared = repairMalformedMathQuickFixes(prepared);
    prepared = repairUnclosedMathDelimiters(prepared);
    prepared = separateMathFromMarkdownHeaders(prepared);
    prepared = stripAsciiDiagramArtifacts(prepared);
  }

  const { text: protectedText, regions } = protectMathRegions(prepared);
  prepared = unprotectMathRegions(
    normalizeMangledLatexCommands(formatStudyMessageListSegment(protectedText)),
    regions,
  );

  prepared = fixMalformedCasesEnvironments(prepared);
  prepared = repairOrphanEndCases(prepared);
  prepared = repairOrphanDisplayDelimiters(prepared);
  prepared = separateMathFromMarkdownHeaders(prepared);
  prepared = repairMalformedMathDelimiters(prepared);
  prepared = stripEscapedDollarArtifacts(prepared);
  prepared = wrapInlineLatex(prepared);
  prepared = repairMalformedMathDelimiters(prepared);
  prepared = stripEscapedDollarArtifacts(prepared);
  prepared = stripAsciiDiagramArtifacts(prepared);
  prepared = prepared.replace(/\n{3,}/g, "\n\n");
  prepared = unprotectCodeFences(prepared, codeFenceRegions);
  prepared = prepared.replace(/([^\n#])\s*(#{1,6}\s)/g, "$1\n\n$2");
  prepared = stripInternalContentMarkers(prepared.trim());

  return prepared;
}

export function prepareStudyMessageMarkdown(text) {
  return sanitizeStudyMathContent(text);
}
