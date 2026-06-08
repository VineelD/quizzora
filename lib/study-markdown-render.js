import katex from "katex";
import { isPlainQuizOptionText, prepareQuizOptionMarkdown } from "./quiz-display-text.js";
import { latexToUnicode, prepareStudyMessageMarkdown } from "./study-message-content.js";

function stripHtmlTags(html) {
  return String(html || "").replace(/<[^>]+>/g, "");
}

function renderKatexChunk(tex, { displayMode = false } = {}) {
  const trimmed = String(tex || "").trim();
  const html = katex.renderToString(trimmed, {
    displayMode,
    throwOnError: false,
    strict: "ignore",
  });

  if (html.includes("katex-error")) {
    return latexToUnicode(trimmed) || trimmed.replace(/[$\\]/g, "").trim();
  }

  return stripHtmlTags(html)
    .replace(/&#x27;|&apos;|&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Approximate the visible text users see after StudyCoachMarkdown renders coach content.
 * Used in tests to ensure math delimiters never leak as literal "$" characters.
 */
export function renderStudyCoachMarkdownText(markdown) {
  const source = prepareStudyMessageMarkdown(markdown);
  if (!source) {
    return "";
  }

  let output = source;
  output = output.replace(/\$\$([\s\S]+?)\$\$/g, (_, tex) => renderKatexChunk(tex, { displayMode: true }));
  output = output.replace(/\$([^$\n]+)\$/g, (_, tex) => renderKatexChunk(tex));
  return output;
}

function renderPreparedQuizMarkdownText(source) {
  if (!source) {
    return "";
  }

  let output = source;
  output = output.replace(/\$\$([\s\S]+?)\$\$/g, (_, tex) => renderKatexChunk(tex, { displayMode: true }));
  output = output.replace(/\$([^$\n]+)\$/g, (_, tex) => renderKatexChunk(tex));
  return output;
}

export function renderQuizOptionMarkdownText(option) {
  const source = prepareQuizOptionMarkdown(option);
  if (!source) {
    return "";
  }

  if (isPlainQuizOptionText(source)) {
    return source;
  }

  return renderPreparedQuizMarkdownText(source);
}

export function renderedStudyCoachMarkdownHasVisibleDollar(markdown) {
  return renderStudyCoachMarkdownText(markdown).includes("$");
}
