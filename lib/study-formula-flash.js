import katex from "katex";
import { latexToUnicode, sanitizeStudyMathContent } from "./study-message-content.js";

export function normalizeFlashFormula(item) {
  if (!item) {
    return null;
  }
  const label = String(item.label || item.name || "").trim();
  const expression = sanitizeStudyMathContent(
    String(item.expression || item.formula || item.text || "").trim(),
  );
  if (!label && !expression) {
    return null;
  }
  return { label, expression };
}

export function normalizeFlashFormulas(formulas) {
  if (!Array.isArray(formulas)) {
    return [];
  }
  return formulas.map(normalizeFlashFormula).filter(Boolean).slice(0, 3);
}

export function hasFlashableFormulas(formulas) {
  return normalizeFlashFormulas(formulas).length > 0;
}

function wrapLatexDelimiters(expression) {
  const trimmed = String(expression || "").trim();
  if (!trimmed) {
    return "";
  }
  if (trimmed.startsWith("$$") || trimmed.startsWith("$")) {
    return trimmed;
  }
  if (/[\\^_{}]/.test(trimmed) || /[=+\-*/]/.test(trimmed)) {
    return `$$${trimmed}$$`;
  }
  return trimmed;
}

export function renderFormulaFlashHtml(expression, { displayMode = true } = {}) {
  const wrapped = wrapLatexDelimiters(expression);
  const match = wrapped.match(/^\$\$([\s\S]+)\$\$$/) || wrapped.match(/^\$([^$\n]+)\$$/);
  const latex = match ? match[1].trim() : wrapped;

  if (!latex) {
    return "";
  }

  try {
    return katex.renderToString(latex, {
      displayMode,
      throwOnError: false,
      strict: "ignore",
    });
  } catch {
    const plain = latexToUnicode(latex) || latex.replace(/[$\\]/g, "").trim();
    return `<span class="study-formula-flash-fallback">${plain}</span>`;
  }
}
