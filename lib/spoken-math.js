import { latexChunkToUnicode } from "./study-message-content.js";

const TRIG_FUNCTIONS = {
  sin: "\\sin",
  sine: "\\sin",
  cos: "\\cos",
  cosine: "\\cos",
  tan: "\\tan",
  tangent: "\\tan",
};

const GREEK_LETTERS = {
  theta: "\\theta",
  alpha: "\\alpha",
  beta: "\\beta",
  gamma: "\\gamma",
  delta: "\\delta",
  pi: "\\pi",
  sigma: "\\sigma",
  mu: "\\mu",
  lambda: "\\lambda",
};

const GREEK_UNICODE = {
  theta: "θ",
  alpha: "α",
  beta: "β",
  gamma: "γ",
  delta: "δ",
  pi: "π",
  sigma: "σ",
  mu: "μ",
  lambda: "λ",
};

const TRIG_MISHEARINGS = [
  [/\bsign\s+(?=square|squared)/gi, "sin "],
  [/\bcause\s+(?=square|squared)/gi, "cos "],
  [/\bsine\s+square\s+data\b/gi, "sin square theta"],
  [/\bsin\s+square\s+data\b/gi, "sin square theta"],
  [/\bcos\s+square\s+data\b/gi, "cos square theta"],
  [/\bcosine\s+square\s+data\b/gi, "cos square theta"],
];

function collapseWhitespace(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim();
}

function wrapInlineLatex(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) {
    return "";
  }
  if (trimmed.startsWith("$") && trimmed.endsWith("$")) {
    return trimmed;
  }
  return `$${trimmed}$`;
}

function formatMathOutput(latexInner, format = "unicode") {
  const trimmed = String(latexInner || "").trim();
  if (!trimmed) {
    return "";
  }
  if (format === "latex") {
    return wrapInlineLatex(trimmed);
  }
  return latexChunkToUnicode(trimmed);
}

function replaceTrigSquared(text, format = "unicode") {
  const pattern =
    /\b(sine|sin|cosine|cos|tangent|tan)\s+(?:squared|square)\s+(theta|alpha|beta|gamma|delta|pi|sigma|mu|lambda|x|y|n|t)\b/gi;

  return String(text || "").replace(pattern, (_, fn, variable) => {
    const latexFn = TRIG_FUNCTIONS[String(fn).toLowerCase()] || fn;
    const latexVar = GREEK_LETTERS[String(variable).toLowerCase()] || variable;
    return formatMathOutput(`${latexFn}^2${latexVar}`, format);
  });
}

function replaceVariableSquared(text, format = "unicode") {
  return String(text || "").replace(/\b([a-z])\s+(?:squared|square)\b/gi, (_, variable) =>
    formatMathOutput(`${variable}^2`, format),
  );
}

function replaceSquareRoot(text, format = "unicode") {
  return String(text || "").replace(/\bsquare root of\s+(.+?)(?=\s+(?:plus|minus|times|over|equals|equal)\b|$)/gi, (_, inner) => {
    const normalizedInner = toMathToken(String(inner || "").trim(), format);
    return formatMathOutput(`\\sqrt{${normalizedInner}}`, format);
  });
}

function toMathToken(token, format = "unicode") {
  const trimmed = String(token || "").trim();
  if (!trimmed) {
    return "";
  }
  if (format === "latex") {
    return GREEK_LETTERS[trimmed.toLowerCase()] || trimmed;
  }
  return GREEK_UNICODE[trimmed.toLowerCase()] || trimmed;
}

function replaceFractions(text, format = "unicode") {
  return String(text || "").replace(/\b([a-z0-9]+)\s+over\s+([a-z0-9]+)\b/gi, (_, numerator, denominator) =>
    formatMathOutput(`\\frac{${toMathToken(numerator, format)}}{${toMathToken(denominator, format)}}`, format),
  );
}

function replacePowerPhrases(text, format = "unicode") {
  let value = String(text || "");
  value = value.replace(/\b([a-z0-9])\s+to the power of\s+([a-z0-9]+)\b/gi, (_, base, exponent) =>
    formatMathOutput(`${base}^{${exponent}}`, format),
  );
  value = value.replace(/\b([a-z0-9])\s+cubed\b/gi, (_, base) => formatMathOutput(`${base}^3`, format));
  return value;
}

function replaceFactorials(text, format = "unicode") {
  return String(text || "").replace(/\b([a-z0-9]+)\s+factorial\b/gi, (_, value) => formatMathOutput(`${value}!`, format));
}

function replaceGreekLetters(text, format = "unicode") {
  let value = String(text || "");
  for (const [spoken, latex] of Object.entries(GREEK_LETTERS)) {
    const pattern = new RegExp(`(?<!\\\\)\\b${spoken}\\b`, "gi");
    const replacement = format === "latex" ? latex : GREEK_UNICODE[spoken] || spoken;
    value = value.replace(pattern, replacement);
  }
  return value;
}

function replaceOperators(text, format = "unicode") {
  let value = String(text || "");
  value = value.replace(/\bplus\b/gi, "+");
  value = value.replace(/\bminus\b/gi, "-");
  value = value.replace(/\btimes\b/gi, format === "latex" ? "\\times " : "×");
  value = value.replace(/\b(divided by|over)\b/gi, "/");
  value = value.replace(/\bequals?\b/gi, "=");
  return value;
}

function normalizeSpokenMathTokens(text, format = "unicode") {
  let value = collapseWhitespace(text);
  if (!value) {
    return "";
  }

  for (const [pattern, replacement] of TRIG_MISHEARINGS) {
    value = value.replace(pattern, replacement);
  }

  value = replaceTrigSquared(value, format);
  value = replaceSquareRoot(value, format);
  value = replaceFractions(value, format);
  value = replaceVariableSquared(value, format);
  value = replacePowerPhrases(value, format);
  value = replaceFactorials(value, format);
  value = replaceGreekLetters(value, format);
  value = replaceOperators(value, format);

  return collapseWhitespace(value);
}

/**
 * Convert common spoken math phrases into readable math for Study Coach input.
 * Defaults to unicode (no $ delimiters); pass format: "latex" for $...$ wrappers.
 */
export function normalizeSpokenMath(text, { format = "unicode" } = {}) {
  return normalizeSpokenMathTokens(text, format);
}

export const SPOKEN_MATH_PLACEHOLDER =
  "Math input on — try: sine squared theta plus cos squared theta equals one";
