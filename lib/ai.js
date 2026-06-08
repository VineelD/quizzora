import { normalizeQuizQuestionFields, repairQuizMathDelimiters } from "./quiz-display-text.js";
import { ensureQuestionVisuals } from "./question-display.js";
import { attachDiagramsToQuizQuestions, buildQuizDiagramReport, maxDiagramsPerQuiz } from "./quiz-diagrams.js";
import {
  applyQuizQuestionClarityFixes,
  enrichQuizWithClarity,
  questionNeedsRegeneration,
  quizQualityFirstEnabled,
  validateQuizQuestionClarity,
} from "./quiz-quality.js";
import { distributeQuestionCounts } from "./quiz-distribution.js";
import {
  buildCurriculumPromptContext,
  fallbackCurriculum,
  getFocusesForYear,
  validateQuizData,
} from "./curriculum.js";
import { buildOpenAiFailure, fetchOpenAiWithRetry, resolveOpenAiRetryOptions } from "./openai-errors.js";

export class AiServiceError extends Error {
  constructor(message, statusCode = 502) {
    super(message);
    this.name = "AiServiceError";
    this.statusCode = statusCode;
  }
}

export function buildOpenAiPrompt(
  { subject, focus, questionCount, difficulty, yearLevel = "Year 7", questionStyle = "worded" },
  { includeDiagramMarking = true } = {},
) {
  const subjectData = fallbackCurriculum[subject] || fallbackCurriculum.Science;
  const focusAreas = getFocusesForYear(subject, yearLevel);
  const curriculumContext = buildCurriculumPromptContext({ yearLevel, subject, focus });
  const diagramCap = maxDiagramsPerQuiz();
  const diagramCapRule =
    diagramCap === 0
      ? `- Mark every visual question with needsDiagram true and provide diagramPrompt (or diagramSpec / diagramMermaid) so each illustration can be generated.`
      : `- At most ${diagramCap} questions may use a non-empty "diagramPrompt" (AI-generated images). Prioritize the highest-need visual questions. Additional visual questions should use diagramSpec or diagramMermaid instead.`;
  const diagramRules = includeDiagramMarking
    ? `
- For Science, Mathematics (geometry and graphing), Biology, Physics, Geography, and similar visual subjects, mark questions that benefit from illustration with "needsDiagram": true.
- Worded problems involving cells, graphs, geometric shapes, circuits, maps, apparatus, or data displays MUST set needsDiagram true when a visual would help students interpret the scenario.
- Use "diagramSpec" for number_line and recursion_tree when a spec diagram is enough — include exact numeric values from the question text.
- Use "diagramMermaid" for flowcharts and process diagrams when steps or pathways must be shown — leave "diagramPrompt" empty.
- Use "diagramPrompt" for labelled biology diagrams, equipment, geographic features, physics circuits, geometry figures, and similar images — copy exact measurements, labels, units, and values from the question text. Never invent or round differently.
${diagramCapRule}
- The question must remain fully solvable from the written text alone if the diagram were missing.
- Do not call image_generation tools — diagrams are generated in a separate step after quiz text is produced.`
    : `
- Set "needsDiagram": false, leave "diagramPrompt" empty, and omit diagramSpec and diagramMermaid on every question.`;

  return `
Create polished Australian ${yearLevel} curriculum-aligned quiz data for a teacher-delivered assignment.

Subject: ${subject}
Focus area: ${focus}
Year level: ${yearLevel}
Difficulty: ${difficulty}
Question style: ${questionStyle}
Question count: ${questionCount}

Curriculum path (topic → subtopic):
${curriculumContext}

Broader ${yearLevel} focus options for this subject: ${(focusAreas.length ? focusAreas : subjectData.focuses).join("; ")}

Return only valid JSON with this exact shape:
{
  "subject": string,
  "focus": string,
  "yearLevel": "${yearLevel}",
  "curriculumSummary": string,
  "learningIntentions": string[],
  "questions": [
    {
      "question": string,
      "options": string[],
      "answer": string,
      "explanation": string,
      "needsDiagram": boolean,
      "diagramPrompt": string,
      "diagramSpec": { "diagramType": "number_line", "min": number, "max": number, "points": number[], "intervals": [{ "from": number, "to": number, "label": string }] } | { "diagramType": "recursion_tree", "root": number, "depth": number, "labels": string[] } | null,
      "diagramMermaid": string
    }
  ]
}

Requirements:
- Use Australian English.
- Keep content age-appropriate for ${yearLevel} students in Australia.
- Include exactly ${questionCount} multiple-choice questions.
- Include four options for every question.
- Make sure each answer exactly matches one option.
- If question style is "multiple-choice", use concise but challenging curriculum questions with strong distractors.
- If question style is "worded", every question must be a worded scenario or real-life problem, not a direct recall question.
- If question style is "mixed", include a balanced mix of concise multiple-choice questions and worded scenario problems.
- Make the problems challenging enough that a ${yearLevel} student must reason, interpret information, calculate, compare evidence, or eliminate distractors.
- Avoid yes/no questions, one-word fact recall, and questions that can be answered without applying the focus area.
- Write plausible distractor options that reflect common misconceptions or calculation mistakes — distractors must be wrong but readable, never trick wording or ambiguous duplicates.
- Put the final answer only in "answer"; it must exactly match one option.
- Format "explanation" as 2-5 short steps separated by newline characters (\\n). Each step is one calculation or reasoning move. End with a final step that states the answer.
- Do not include self-correction, option checking, or phrases like "none of the options match" in explanations.
- For mathematical notation in questions, use $...$ for inline math (for example $a_n = 2^n - 1$) and $$...$$ for display math when needed.
- For MCQ options, wrap each option in exactly one inline $...$ pair on a single line (for example $f'(x) = \\frac{a}{b}$ or $\\begin{pmatrix} 0.43 \\\\ 0.57 \\end{pmatrix}$). Never use $$ display math in options, never add extra trailing $ characters, and never put $ delimiters on separate lines. Keep minus signs and subscripts inside math delimiters; never start option text with "- " as plain text.
- Never use placeholder tokens such as [MATH0] or internal math markers — write the full expression inside $...$ delimiters in the question or option text.
- Word problems MUST use normal English spacing between every word and number (for example "A population of 10,000 with an annual growth rate of 5%" — never "Apopulationof10,000withanannualgrowthrateof5%").
- Ask exactly ONE clear question per stem — students must know precisely what to calculate or choose without re-reading for hidden tasks.
- Keep normal spaces between words and numbers in word problems (for example "loan of 10,000 with an annual" not "10,000withanannual").
- Each question must focus on ONE curriculum topic only — never combine unrelated topics (for example trigonometry + Fibonacci + recurrence) in a single stem.
- Keep question stems concise (under 500 characters), unambiguous, and solvable without guessing what is being asked.
- Write each MCQ option on a single line with plain wording; avoid multi-sentence options.
${quizQualityFirstEnabled() ? "- Quality-first mode: prefer clarity over brevity; remove any wording that could confuse a student." : ""}${diagramRules}
`.trim();
}

async function finalizeQuizQuestions(questions, request) {
  const withDiagrams = await attachDiagramsToQuizQuestions(questions, {
    subject: request.subject,
    yearLevel: request.yearLevel,
    focus: request.focus,
  });
  const { questions: clarified, clarityReport } = enrichQuizWithClarity(withDiagrams, {
    focus: request.focus,
    subject: request.subject,
  });
  return {
    questions: clarified,
    clarityReport,
    diagramReport: buildQuizDiagramReport(clarified),
  };
}

export async function generateQuiz(request, { onProgress } = {}) {
  const subtopics = Array.isArray(request.selectedSubtopics)
    ? request.selectedSubtopics.filter(Boolean)
    : [];

  if (subtopics.length <= 1) {
    const singleRequest =
      subtopics.length === 1 ? { ...request, focus: subtopics[0] } : request;
    const result = await generateQuizBatch(singleRequest);
    const finalized = await finalizeQuizQuestions(result.quiz.questions, singleRequest);
    result.quiz.questions = finalized.questions;
    result.quiz.clarityReport = finalized.clarityReport;
    result.quiz.diagramReport = finalized.diagramReport;
    return result;
  }

  const distribution =
    request.distribution && typeof request.distribution === "object"
      ? request.distribution
      : distributeQuestionCounts(request.questionCount, subtopics);

  const mergedQuestions = [];
  const learningIntentions = new Set();
  let curriculumSummary = "";
  const totalBatches = subtopics.length;

  for (let index = 0; index < subtopics.length; index += 1) {
    const focus = subtopics[index];
    const batchCount = Math.max(0, Number(distribution[focus]) || 0);
    if (batchCount <= 0) {
      continue;
    }

    onProgress?.(`Generating ${index + 1}/${totalBatches} subtopics…`);

    const batchResult = await generateQuizBatch({
      ...request,
      focus,
      questionCount: batchCount,
    });

    mergedQuestions.push(...batchResult.quiz.questions);
    for (const intention of batchResult.quiz.learningIntentions || []) {
      learningIntentions.add(intention);
    }
    if (!curriculumSummary && batchResult.quiz.curriculumSummary) {
      curriculumSummary = batchResult.quiz.curriculumSummary;
    }
  }

  if (!mergedQuestions.length) {
    throw new AiServiceError("No questions were generated for the selected subtopics.", 502);
  }

  const quiz = validateQuizData({
    subject: request.subject,
    focus: request.focus,
    yearLevel: request.yearLevel,
    curriculumSummary: curriculumSummary || `Multi-topic ${request.subject} quiz.`,
    learningIntentions: [...learningIntentions].slice(0, 8),
    questions: mergedQuestions.slice(0, request.questionCount),
  });

  const finalized = await finalizeQuizQuestions(quiz.questions, request);
  quiz.questions = finalized.questions;
  quiz.clarityReport = finalized.clarityReport;
  quiz.diagramReport = finalized.diagramReport;

  return {
    source: "OpenAI generated",
    quiz,
    clarityReport: finalized.clarityReport,
    diagramReport: finalized.diagramReport,
  };
}

function buildQuizSelfReviewPrompt(questions, request) {
  const compact = questions.map((question, index) => ({
    index,
    question: question.question,
    options: question.options,
    answer: question.answer,
    explanation: question.explanation,
    needsDiagram: question.needsDiagram,
    diagramPrompt: question.diagramPrompt,
    diagramSpec: question.diagramSpec,
    diagramMermaid: question.diagramMermaid,
  }));

  return `
Review these ${questions.length} Australian ${request.yearLevel || "Year 7"} ${request.subject || "subject"} multiple-choice questions for student confusion.

Fix every issue before returning:
- Glued words or numbers without spaces in stems and options.
- Placeholder math tokens such as [MATH0] — replace with full $...$ expressions.
- Malformed dollar delimiters ($$$$, unpaired $, $$ in options).
- Ambiguous or multi-part stems — rewrite to ONE clear question.
- MCQ options must stay on a single line; math options use inline $...$ only.

Do not change correct answers. Preserve needsDiagram, diagramPrompt, diagramSpec, and diagramMermaid unless fixing a typo in labels or values.

Return only valid JSON:
{
  "questions": [
    {
      "question": string,
      "options": string[],
      "answer": string,
      "explanation": string,
      "needsDiagram": boolean,
      "diagramPrompt": string,
      "diagramSpec": object | null,
      "diagramMermaid": string
    }
  ]
}

Questions to review:
${JSON.stringify(compact)}
`.trim();
}

async function reviewQuizQuestionsWithLlm(questions, request) {
  if (!Array.isArray(questions) || questions.length === 0) {
    return questions;
  }
  if (process.env.QUIZ_LLM_SELF_REVIEW === "false") {
    return questions;
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return questions;
  }

  const body = {
    model: process.env.OPENAI_QUIZ_REVIEW_MODEL || "gpt-4o-mini",
    input: buildQuizSelfReviewPrompt(questions, request),
    temperature: 0.2,
  };

  const endpoint = process.env.OPENAI_ENDPOINT || "https://api.openai.com/v1/responses";
  const openAiResponse = await fetchOpenAiWithRetry(
    endpoint,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
    resolveOpenAiRetryOptions(),
  );

  if (!openAiResponse.ok) {
    return questions;
  }

  const payload = await openAiResponse.json();
  let text;
  try {
    text = extractResponseText(payload);
  } catch {
    return questions;
  }

  let parsed;
  try {
    parsed = JSON.parse(stripCodeFence(text));
  } catch {
    return questions;
  }

  const reviewed = Array.isArray(parsed.questions) ? parsed.questions : [];
  if (reviewed.length !== questions.length) {
    return questions;
  }

  return questions.map((original, index) => {
    const patch = reviewed[index] || {};
    return {
      ...original,
      question: patch.question ?? original.question,
      options: Array.isArray(patch.options) ? patch.options : original.options,
      answer: patch.answer ?? original.answer,
      explanation: patch.explanation ?? original.explanation,
      needsDiagram: patch.needsDiagram ?? original.needsDiagram,
      diagramPrompt: patch.diagramPrompt ?? original.diagramPrompt,
      diagramSpec: patch.diagramSpec ?? original.diagramSpec,
      diagramMermaid: patch.diagramMermaid ?? original.diagramMermaid,
    };
  });
}

function normalizeGeneratedQuestions(questions) {
  return (questions || []).map((question) => {
    const repaired = {
      ...question,
      question: repairQuizMathDelimiters(String(question.question || "")),
      options: Array.isArray(question.options)
        ? question.options.map((option) => repairQuizMathDelimiters(String(option)))
        : question.options,
      ...(question.answer != null
        ? { answer: repairQuizMathDelimiters(String(question.answer)) }
        : {}),
      ...(typeof question.explanation === "string"
        ? { explanation: repairQuizMathDelimiters(String(question.explanation)) }
        : {}),
    };
    return normalizeQuizQuestionFields(repaired);
  });
}

const MAX_QUESTION_REGENERATION_ATTEMPTS = 2;

function buildSingleQuestionRegenerationPrompt(request, { index, issues = [] } = {}) {
  const issueBlock = issues.length
    ? `\nFix these problems from the previous attempt:\n${issues.map((item) => `- ${item}`).join("\n")}\n`
    : "";

  return `
Create ONE replacement multiple-choice question for an Australian ${request.yearLevel || "Year 7"} ${request.subject || "subject"} quiz.

Focus area: ${request.focus}
Difficulty: ${request.difficulty || "mixed"}
Question style: ${request.questionStyle || "worded"}
${issueBlock}
Return only valid JSON:
{
  "question": string,
  "options": string[],
  "answer": string,
  "explanation": string,
  "needsDiagram": boolean,
  "diagramPrompt": string,
  "diagramSpec": object | null,
  "diagramMermaid": string
}

Requirements:
- Use Australian English; four distinct options; answer must exactly match one option.
- Word problems MUST use normal spaces between every word and number.
- Ask exactly ONE clear question per stem.
- MCQ options use inline $...$ math on a single line when needed — no [MATH0], no $$$$, no glued words.
- Write plausible distractors — wrong but clear, never identical options.
- Set needsDiagram false unless a visual is essential.
`.trim();
}

async function requestSingleQuestionFromOpenAi(prompt) {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return null;
  }

  const body = {
    model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
    input: prompt,
    temperature: 0.35,
  };

  const endpoint = process.env.OPENAI_ENDPOINT || "https://api.openai.com/v1/responses";
  const openAiResponse = await fetchOpenAiWithRetry(
    endpoint,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
    resolveOpenAiRetryOptions(),
  );

  if (!openAiResponse.ok) {
    return null;
  }

  const payload = await openAiResponse.json();
  const text = extractResponseText(payload);
  let parsed;
  try {
    parsed = JSON.parse(stripCodeFence(text));
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== "object") {
    return null;
  }

  return normalizeGeneratedQuestions([parsed])[0] || null;
}

async function regenerateQuizQuestion(request, { index, issues = [] } = {}) {
  const prompt = buildSingleQuestionRegenerationPrompt(request, { index, issues });
  return requestSingleQuestionFromOpenAi(prompt);
}

export async function ensureQuizQuestionsClarity(questions, request) {
  if (!Array.isArray(questions) || questions.length === 0) {
    return questions;
  }

  const context = { focus: request.focus, subject: request.subject };
  const result = [...questions];

  for (let index = 0; index < result.length; index += 1) {
    let attempts = 0;

    while (attempts < MAX_QUESTION_REGENERATION_ATTEMPTS && questionNeedsRegeneration(result[index], context)) {
      const fixed = applyQuizQuestionClarityFixes(result[index]);
      const review = validateQuizQuestionClarity(fixed, context);
      const replacement = await regenerateQuizQuestion(request, {
        index,
        issues: review.issues.map((issue) => issue.message),
      });
      attempts += 1;
      if (replacement) {
        result[index] = replacement;
      } else {
        break;
      }
    }

    result[index] = normalizeQuizQuestionFields(applyQuizQuestionClarityFixes(result[index]));
  }

  return result;
}

async function generateQuizBatch(request) {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new AiServiceError(
      "AI quiz generation is not configured on the server (OPENAI_API_KEY is missing).",
      503,
    );
  }

  const body = {
    model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
    input: buildOpenAiPrompt(request, { includeDiagramMarking: true }),
    temperature: 0.4,
  };

  const quizMaxTokens = Number(process.env.OPENAI_QUIZ_MAX_OUTPUT_TOKENS || 0);
  if (Number.isFinite(quizMaxTokens) && quizMaxTokens > 0) {
    body.max_output_tokens = Math.round(quizMaxTokens);
  }

  const endpoint = process.env.OPENAI_ENDPOINT || "https://api.openai.com/v1/responses";
  const retryOptions = resolveOpenAiRetryOptions();
  const openAiResponse = await fetchOpenAiWithRetry(
    endpoint,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
    retryOptions,
  );

  if (!openAiResponse.ok) {
    const failure = buildOpenAiFailure(
      openAiResponse.status,
      openAiResponse.errorText,
      openAiResponse.statusText,
    );
    throw new AiServiceError(failure.message, failure.statusCode);
  }

  const payload = await openAiResponse.json();
  const text = extractResponseText(payload);
  let parsed;
  try {
    parsed = JSON.parse(stripCodeFence(text));
  } catch {
    throw new AiServiceError("OpenAI returned quiz data that could not be parsed as JSON.", 502);
  }
  const reviewed = await reviewQuizQuestionsWithLlm(parsed.questions || [], request);
  const clarified = await ensureQuizQuestionsClarity(normalizeGeneratedQuestions(reviewed), request);
  const quiz = validateQuizData({
    ...parsed,
    questions: clarified,
  });
  quiz.questions = ensureQuestionVisuals(quiz.questions);

  return {
    source: "OpenAI generated",
    quiz,
  };
}

function extractResponseText(payload) {
  if (typeof payload.output_text === "string") {
    return payload.output_text;
  }

  const content = payload.output
    ?.flatMap((item) => item.content || [])
    ?.map((item) => item.text || "")
    ?.join("")
    ?.trim();

  if (!content) {
    throw new AiServiceError("OpenAI returned an empty response.", 502);
  }

  return content;
}

function stripCodeFence(text) {
  return text.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
}
