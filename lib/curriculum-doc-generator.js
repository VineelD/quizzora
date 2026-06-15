import { getDb } from "./db.js";
import { chunkCurriculumText } from "./curriculum-doc-chunk.js";
import { buildOpenAiFailure, fetchOpenAiWithRetry, resolveOpenAiRetryOptions } from "./openai-errors.js";

export function resolveCurriculumDocModel() {
  return String(process.env.CURRICULUM_DOC_MODEL || process.env.OPENAI_MODEL || "gpt-4.1-mini").trim();
}

/** Phrases that indicate syllabus/overview tone rather than teachable content. */
export const CURRICULUM_DOC_SYLLABUS_PHRASES = [
  "students will",
  "students learn",
  "students explore",
  "learning outcome",
  "learning intention",
  "in this unit",
  "by the end of",
  "this study aligns",
  "curriculum focus",
];

/** Subjects where formulae must use LaTeX delimiters. */
export const CURRICULUM_DOC_MATH_SUBJECTS = ["Mathematics", "Science"];

/** Word-count targets for standard vs enriched learning guides. */
export const CURRICULUM_DOC_DEPTH_STANDARD = {
  minWords: 500,
  maxWords: 1400,
  label: "600–1000",
};

export const CURRICULUM_DOC_DEPTH_ENRICHED = {
  minWords: 1000,
  maxWords: 2200,
  label: "1200–2000",
};

const INLINE_LATEX_PATTERN = /\$[^$\n]+\$/;
const DISPLAY_LATEX_PATTERN = /\$\$[\s\S]+?\$\$/;
const RAW_MATH_PATTERN =
  /(?:\b[A-Za-z]\s*=\s*[^$\n]{2,}|[\^²³]|\\(?:frac|sqrt|times|cdot|leq|geq|sum|int|alpha|beta|theta|pi)\b)/;

export function curriculumDocRequiresLatex(subject) {
  return CURRICULUM_DOC_MATH_SUBJECTS.includes(String(subject || "").trim());
}

export function curriculumDocHasLatexDelimiters(text) {
  const source = String(text || "");
  return INLINE_LATEX_PATTERN.test(source) || DISPLAY_LATEX_PATTERN.test(source);
}

export function resolveCurriculumDocDepth({ enriched = false } = {}) {
  return enriched ? CURRICULUM_DOC_DEPTH_ENRICHED : CURRICULUM_DOC_DEPTH_STANDARD;
}

export function validateCurriculumLearningMaterial(text, { subject = "", enriched = false } = {}) {
  const source = String(text || "").trim();
  const words = source.split(/\s+/).filter(Boolean);
  const lower = source.toLowerCase();
  const depth = resolveCurriculumDocDepth({ enriched });
  const issues = [];

  if (words.length < depth.minWords) {
    issues.push(`too short (${words.length} words; target ${depth.label})`);
  } else if (words.length > depth.maxWords) {
    issues.push(`too long (${words.length} words; target ${depth.label})`);
  }

  for (const phrase of CURRICULUM_DOC_SYLLABUS_PHRASES) {
    if (lower.includes(phrase)) {
      issues.push(`syllabus-style phrase: "${phrase}"`);
    }
  }

  const yearStudentPattern = /\bin year \d+, students\b/i;
  if (yearStudentPattern.test(source)) {
    issues.push('syllabus-style phrase: "In Year X, students"');
  }

  if (curriculumDocRequiresLatex(subject) && RAW_MATH_PATTERN.test(source) && !curriculumDocHasLatexDelimiters(source)) {
    issues.push("math/formulae must use $...$ inline or $$...$$ display LaTeX delimiters");
  }

  if (enriched) {
    if (!/worked examples?/i.test(source)) {
      issues.push('missing "Worked examples" section');
    }
    if (!/common mistakes?|common misconceptions?/i.test(source)) {
      issues.push('missing "Common mistakes" or "Common misconceptions" section');
    }
    if (!/practice questions?/i.test(source)) {
      issues.push('missing "Practice questions" section');
    }
    if (!/answer key|answers?:|solution:/i.test(source)) {
      issues.push("practice questions must include an answer key or labelled answers");
    }
    const exampleLabels =
      (source.match(/(?:^|\n)(?:Example|Worked example)\s*\d+/gi) || []).length;
    const stepBlocks = (source.match(/(?:^|\n)Step\s+[1-9]/gi) || []).length;
    if (exampleLabels < 2 && stepBlocks < 4) {
      issues.push("expected at least two step-by-step worked examples");
    }
  }

  return { ok: issues.length === 0, wordCount: words.length, issues, enriched };
}

function buildCurriculumDocFormulaRules(subject) {
  const latexRequired = curriculumDocRequiresLatex(subject);
  const latexBlock = latexRequired
    ? `
Mathematics and formulae:
- Include every important formula for this subtopic in LaTeX before you use it in examples.
- Wrap only formulae, equations, fractions, exponents, unit expressions, and substituted numeric values in LaTeX: inline $...$ or display $$...$$ on its own line.
- Use $...$ for variables and expressions only (e.g. $a$, $A$, $F = ma$, $\\sin\\theta$) — never wrap full sentences, vocabulary definitions, or plain English phrases in math delimiters.
- Write definitions in plain text with variables in math: "side $a$ is opposite angle $A$", not "$a is opposite angle A$" or "$a$is$opposite$angle$A$".
- Examples: $F = ma$, $V = IR$, $A = \\frac{1}{2}bh$, $E = mc^2$, $\\sin\\theta = \\frac{\\text{opposite}}{\\text{hypotenuse}}$.
- In worked examples, show each step's formula in LaTeX before explaining it in words (e.g. "Substitute $I = 2\\,\\text{A}$ and $R = 5\\,\\Omega$ into $V = IR$, so $V = 10\\,\\text{V}$.").
- Do not write raw ASCII math like x^2, a/b, or V=IR without LaTeX delimiters.
- Chemical formulae may stay plain (e.g. H2O, CO2) unless they appear inside an equation.`
    : `
Formulae and notation:
- If this subtopic uses symbols, ratios, or shorthand, define them clearly when first introduced.
- Use LaTeX only when a formula genuinely helps (e.g. $a^2 + b^2 = c^2$); keep prose readable.`;

  return latexBlock;
}

function buildCurriculumDocStyleRules({ year, enriched = false } = {}) {
  const practiceRule = enriched
    ? "- Practice questions are allowed in the dedicated Practice questions section only — include full worked answers or an Answer key subsection."
    : '- No quiz questions, no multiple-choice items, no "Question 1" prompts, no markdown tables.';

  return `Style rules:
- Australian English spelling and units.
- Second person ("you") or neutral instructional prose — never "students will", "students explore", "learning outcomes", or "In ${year}, students…".
${practiceRule}
- Substantive paragraphs under each heading; avoid bare keyword lists.
- Use plain section headings on their own line — not numbered syllabus bullets.`;
}

export function buildCurriculumDocPrompt(cell, { enriched = false } = {}) {
  const year = String(cell.yearLevel || "").trim();
  const subject = String(cell.subject || "").trim();
  const subtopic = String(cell.subtopic || "").trim();
  const codes = String(cell.acaraCodes || "Australian Curriculum").trim();
  const depth = resolveCurriculumDocDepth({ enriched });
  const formulaRules = buildCurriculumDocFormulaRules(subject);
  const styleRules = buildCurriculumDocStyleRules({ year, enriched });

  if (enriched) {
    return `Write an enriched student learning guide for ${year} ${subject} on "${subtopic}".

Audience and purpose:
- Write directly for a ${year} student who is learning this subtopic for the first time.
- Teach the ideas deeply so the student can read this page, understand the topic, and practise independently — not a syllabus overview, teacher plan, or list of what they "will learn".
- Align content to ACARA/VCAA (${codes}) but explain concepts in plain language; do not quote or paraphrase curriculum outcome statements.

Length and structure (${depth.label} words, use these headings):
1. Introduction — hook the topic in 3–5 sentences; say what it is, why it matters, and what you will cover.
2. Key concepts — explain each important idea in depth with cause-and-effect reasoning and connections between ideas; use full paragraphs, not bare bullet lists.
3. Essential vocabulary — define each term when you first use it; give a short example for tricky words.
4. Formulae and rules — list the key formulae or rules for this subtopic with a one-line explanation of when to use each one${curriculumDocRequiresLatex(subject) ? " (use LaTeX for every formula)" : ""}.
5. Worked examples — provide at least two step-by-step examples labelled Example 1 and Example 2. Number each step (Step 1, Step 2, …), show the thinking, and use realistic ${year} ${subject} scenarios. Show every formula and numeric substitution using LaTeX where applicable.
6. Common mistakes — name 3–4 mistakes learners make and explain how to avoid each one.
7. Practice questions — provide 3–4 short practice questions the student can try alone, then an Answer key with full worked solutions (not one-word answers).
8. Real-world connections — 2–3 links to everyday Australian contexts (sport, environment, technology, etc.).

${formulaRules}

${styleRules}

Return only the learning guide text.`;
  }

  return `Write a student learning guide for ${year} ${subject} on "${subtopic}".

Audience and purpose:
- Write directly for a ${year} student who is learning this subtopic for the first time.
- Teach the ideas clearly so the student can read this page and understand the topic — not a syllabus overview, teacher plan, or list of what they "will learn".
- Align content to ACARA/VCAA (${codes}) but explain concepts in plain language; do not quote or paraphrase curriculum outcome statements.

Length and structure (${depth.label} words, use these headings):
1. Introduction — hook the topic in 2–3 sentences; say what it is and why it matters.
2. Key concepts — explain each important idea in full sentences with cause-and-effect reasoning, not bullet lists of topics.
3. Essential vocabulary — define each term when you first use it; give a short example for tricky words.
4. Worked examples — at least one step-by-step example that walks through the thinking (use realistic ${year} ${subject} scenarios). Show every formula and numeric substitution using LaTeX.
5. Common misconceptions — name 2–3 mistakes students make and correct each one.
6. Real-world connections — 2–3 links to everyday Australian contexts (sport, environment, technology, etc.).

${formulaRules}

${styleRules}

Return only the learning guide text.`;
}

function extractResponseText(payload) {
  if (typeof payload.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  const fromOutput = payload.output
    ?.flatMap((item) => item.content || [])
    ?.map((item) => item.text || "")
    ?.join("")
    ?.trim();

  if (fromOutput) {
    return fromOutput;
  }

  const chatContent = payload?.choices?.[0]?.message?.content;
  if (typeof chatContent === "string" && chatContent.trim()) {
    return chatContent.trim();
  }

  return "";
}

export function resolveCurriculumDocMaxOutputTokens({ enriched = false } = {}) {
  if (enriched) {
    return Number(process.env.CURRICULUM_DOC_ENRICHED_MAX_OUTPUT_TOKENS || 4500);
  }
  return Number(process.env.CURRICULUM_DOC_MAX_OUTPUT_TOKENS || 2400);
}

export async function generateCurriculumDocText(cell, { fetchImpl = fetch, enriched = false } = {}) {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }

  const body = {
    model: resolveCurriculumDocModel(),
    input: buildCurriculumDocPrompt(cell, { enriched }),
    temperature: enriched ? 0.4 : 0.35,
    max_output_tokens: resolveCurriculumDocMaxOutputTokens({ enriched }),
  };

  const endpoint = process.env.OPENAI_ENDPOINT || "https://api.openai.com/v1/responses";
  const response = await fetchOpenAiWithRetry(
    endpoint,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
    { ...resolveOpenAiRetryOptions(), fetchImpl },
  );

  if (!response.ok) {
    const failure = buildOpenAiFailure(response.status, response.errorText, response.statusText);
    throw new Error(failure.message || `OpenAI curriculum doc request failed (${response.status}).`);
  }

  const payload = await response.json();
  const text = extractResponseText(payload);
  if (!text) {
    throw new Error("OpenAI returned an empty curriculum document.");
  }

  return text;
}

export function upsertCurriculumDocJob(cell, { status = "pending", errorMessage = null } = {}) {
  const db = getDb();
  db.prepare(
    `
    INSERT INTO curriculum_doc_jobs (
      focus_label, year_level, subject, topic_key, subtopic, acara_codes, status, error_message
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(focus_label) DO UPDATE SET
      status = excluded.status,
      error_message = excluded.error_message
    `,
  ).run(
    cell.focusLabel,
    cell.yearLevel,
    cell.subject,
    cell.topicKey,
    cell.subtopic,
    cell.acaraCodes || null,
    status,
    errorMessage,
  );
}

export function storeGeneratedCurriculumDoc(cell, fullDoc) {
  const db = getDb();
  const chunks = chunkCurriculumText(fullDoc);
  const now = new Date().toISOString();

  const clearChunks = db.prepare("DELETE FROM curriculum_doc_chunks WHERE focus_label = ?");
  const insertChunk = db.prepare(
    `
    INSERT INTO curriculum_doc_chunks (
      focus_label, year_level, subject, topic_key, subtopic, acara_codes, chunk_index, content
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
  );
  const updateJob = db.prepare(
    `
    UPDATE curriculum_doc_jobs
    SET status = 'generated',
        full_doc = ?,
        chunk_count = ?,
        generated_at = ?,
        error_message = NULL
    WHERE focus_label = ?
    `,
  );

  db.exec("BEGIN");
  try {
    clearChunks.run(cell.focusLabel);
    chunks.forEach((content, chunkIndex) => {
      insertChunk.run(
        cell.focusLabel,
        cell.yearLevel,
        cell.subject,
        cell.topicKey,
        cell.subtopic,
        cell.acaraCodes || null,
        chunkIndex,
        content,
      );
    });
    updateJob.run(fullDoc, chunks.length, now, cell.focusLabel);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  return { chunkCount: chunks.length };
}

export async function generateAndStoreCurriculumDoc(cell, { fetchImpl = fetch, enriched = false } = {}) {
  upsertCurriculumDocJob(cell, { status: "generating" });

  try {
    const fullDoc = await generateCurriculumDocText(cell, { fetchImpl, enriched });
    const validation = validateCurriculumLearningMaterial(fullDoc, {
      subject: cell.subject,
      enriched,
    });
    const stored = storeGeneratedCurriculumDoc(cell, fullDoc);
    return {
      ok: true,
      focusLabel: cell.focusLabel,
      chunkCount: stored.chunkCount,
      wordCount: validation.wordCount,
      validationWarnings: validation.ok ? [] : validation.issues,
      enriched,
    };
  } catch (error) {
    upsertCurriculumDocJob(cell, {
      status: "failed",
      errorMessage: String(error?.message || error).slice(0, 500),
    });
    return { ok: false, focusLabel: cell.focusLabel, error: error?.message || "Generation failed." };
  }
}

export function listCurriculumDocJobsNeedingGeneration() {
  return getDb()
    .prepare(
      `
      SELECT focus_label, year_level, subject, topic_key, subtopic, acara_codes, status
      FROM curriculum_doc_jobs
      WHERE status IN ('pending', 'failed')
      ORDER BY year_level, subject, focus_label
      `,
    )
    .all();
}

export function getCurriculumDocJob(focusLabel) {
  return (
    getDb()
      .prepare(
        `
        SELECT focus_label, year_level, subject, topic_key, subtopic, acara_codes, status, chunk_count
        FROM curriculum_doc_jobs
        WHERE focus_label = ?
        `,
      )
      .get(String(focusLabel || "").trim()) || null
  );
}
