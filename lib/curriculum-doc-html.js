import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkRehype from "remark-rehype";
import rehypeKatex from "rehype-katex";
import rehypeStringify from "rehype-stringify";
import { normalizeStudyMessageContent } from "./study-message-content.js";

const KATEX_VERSION = "0.17.0";
const KATEX_CSS_URL = `https://cdn.jsdelivr.net/npm/katex@${KATEX_VERSION}/dist/katex.min.css`;

const SECTION_HEADINGS = [
  "Introduction",
  "Key concepts",
  "Essential vocabulary",
  "Worked examples",
  "Common misconceptions",
  "Real-world connections",
];

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function normalizeSectionHeadings(text) {
  let output = String(text || "");

  for (const heading of SECTION_HEADINGS) {
    const numbered = new RegExp(`^\\s*\\d+\\.\\s*${heading}\\b[^\\n]*$`, "gim");
    output = output.replace(numbered, `\n## ${heading}\n`);

    const plain = new RegExp(`^\\s*${heading}\\s*$`, "gim");
    output = output.replace(plain, `\n## ${heading}\n`);
  }

  return output.replace(/\n{3,}/g, "\n\n").trim();
}

const PROSE_WORD_PATTERN =
  /\b(?:is|are|the|a|an|and|or|of|to|in|for|between|side|sides|angle|angles|opposite|included|example|gives|ratio|length|right|triangle|trigonometric|function|that|with|from|known|find|use|when|each|other|directly|across|formed|meeting|vertex|measured|degrees|connecting|vertices|straight|line|segment|amount|turn|two|three|one|important|using|rule|rules|adjacent|hypotenuse|imagine|suppose|want|calculate|substitute|values|lengths)\b/i;

function looksLikeProseInMath(inner) {
  const trimmed = String(inner || "").trim();
  if (!trimmed.includes(" ")) {
    return false;
  }

  if (!PROSE_WORD_PATTERN.test(trimmed)) {
    return false;
  }

  if (/\\(?:frac|sqrt|sum|int)\b/.test(trimmed)) {
    return false;
  }

  if (/\\(?:sin|cos|tan)\b/.test(trimmed) && /=/.test(trimmed)) {
    return false;
  }

  if (/\\text\{/.test(trimmed) && (trimmed.match(/=/g) || []).length >= 1 && /\d/.test(trimmed)) {
    return /,\s*side\s+[a-z]\s*=/i.test(trimmed);
  }

  return true;
}

function splitProseMathSpan(inner) {
  let plain = String(inner || "");

  plain = plain.replace(/\\[a-zA-Z]+(?:\^\{?[^{}\s]+\}?|\{[^{}]*\})*/g, (command) => `$${command}$`);

  plain = plain.replace(/(?<![A-Za-z$])([A-Za-z])(?![A-Za-z$])/g, (match, letter, offset, source) => {
    if (letter === "a") {
      const before = source[offset - 1] || " ";
      const after = source[offset + 1] || " ";
      if (/\s/.test(before) && /[b-hj-z]/i.test(after)) {
        return match;
      }
    }

    return `$${letter}$`;
  });

  return plain;
}

function fixMergedSideEquations(inner) {
  return inner.replace(
    /([A-Za-z])\s*=\s*([^,]+),\s*side\s+([A-Za-z])\s*=\s*(.+)/i,
    (_, variableOne, equationOne, variableTwo, equationTwo) =>
      `$${variableOne} = ${equationOne}$, side $${variableTwo} = ${equationTwo}$`,
  );
}

export function fixProseWrappedInMath(text) {
  let value = String(text || "");

  value = value.replace(/(?<!\$)\$([^$\n]+)\$(?!\$)/g, (match, inner) => {
    if (!looksLikeProseInMath(inner)) {
      return match;
    }

    if (/\\text\{/.test(inner) && /,\s*side\s+[a-z]\s*=/i.test(inner)) {
      return fixMergedSideEquations(inner);
    }

    return splitProseMathSpan(inner);
  });

  return value;
}

export function prepareCurriculumDocMarkdown(text) {
  const normalized = normalizeStudyMessageContent(text);
  const withHeadings = normalizeSectionHeadings(normalized);
  const withoutProseMath = fixProseWrappedInMath(withHeadings);
  return withoutProseMath.replace(/\n{3,}/g, "\n\n").trim();
}

export async function renderCurriculumDocMarkdownToHtml(markdown) {
  const source = prepareCurriculumDocMarkdown(markdown);
  if (!source.trim()) {
    return "";
  }

  const file = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkMath)
    .use(remarkRehype, { allowDangerousHtml: false })
    .use(rehypeKatex)
    .use(rehypeStringify)
    .process(source);

  return String(file.value || "").trim();
}

export async function renderCurriculumDocHtml({
  title,
  yearLevel = "",
  subject = "",
  topicKey = "",
  subtopic = "",
  acaraCodes = "",
  generatedAt = "",
  markdown = "",
} = {}) {
  const bodyHtml = await renderCurriculumDocMarkdownToHtml(markdown);
  const pageTitle = escapeHtml(String(subtopic || title || "Curriculum learning guide").trim());

  const metaRows = [
    ["Year level", yearLevel],
    ["Subject", subject],
    ["Topic", topicKey],
    ["ACARA", acaraCodes],
    ["Generated", generatedAt ? new Date(generatedAt).toLocaleString("en-AU") : ""],
  ].filter(([, value]) => String(value || "").trim());

  const metaHtml = metaRows
    .map(
      ([label, value]) =>
        `<div class="meta-row"><span class="meta-label">${escapeHtml(label)}</span><span class="meta-value">${escapeHtml(value)}</span></div>`,
    )
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en-AU">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${pageTitle}</title>
  <link rel="stylesheet" href="${KATEX_CSS_URL}" crossorigin="anonymous" />
  <style>
    :root {
      color-scheme: light;
      --text: #0f172a;
      --muted: #64748b;
      --border: #e2e8f0;
      --surface: #f8fafc;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "Segoe UI", system-ui, -apple-system, sans-serif;
      line-height: 1.65;
      color: var(--text);
      background: #fff;
    }
    main {
      max-width: 760px;
      margin: 0 auto;
      padding: 2.5rem 1.5rem 3rem;
    }
    h1 {
      font-size: 1.85rem;
      line-height: 1.2;
      margin: 0 0 0.75rem;
    }
    .meta {
      display: grid;
      gap: 0.35rem;
      margin: 1rem 0 1.5rem;
      padding: 1rem 1.1rem;
      border: 1px solid var(--border);
      border-radius: 0.75rem;
      background: var(--surface);
      font-size: 0.92rem;
    }
    .meta-row { display: flex; flex-wrap: wrap; gap: 0.35rem 0.75rem; }
    .meta-label { font-weight: 600; color: #334155; min-width: 5.5rem; }
    .meta-value { color: var(--muted); }
    .content :is(h2, h3, h4) {
      margin-top: 1.75rem;
      margin-bottom: 0.65rem;
      line-height: 1.25;
    }
    .content h2 { font-size: 1.25rem; border-bottom: 1px solid var(--border); padding-bottom: 0.35rem; }
    .content p { margin: 0 0 1rem; }
    .content ul, .content ol { margin: 0 0 1rem; padding-left: 1.35rem; }
    .content li { margin: 0.25rem 0; }
    .content .katex-display {
      margin: 1rem 0;
      overflow-x: auto;
      overflow-y: hidden;
      padding: 0.35rem 0;
    }
    footer {
      margin-top: 2rem;
      padding-top: 1rem;
      border-top: 1px solid var(--border);
      font-size: 0.82rem;
      color: var(--muted);
      text-align: center;
    }
  </style>
</head>
<body>
  <main>
    <h1>${pageTitle}</h1>
    ${metaHtml ? `<section class="meta">${metaHtml}</section>` : ""}
    <article class="content">${bodyHtml || "<p><em>(empty document)</em></p>"}</article>
    <footer>Quizzora curriculum learning guide — exported for verification.</footer>
  </main>
</body>
</html>
`;
}
