import { getDb } from "./db.js";
import { validateQuizData } from "./curriculum.js";
import { ensureQuestionVisuals } from "./question-display.js";
import { normalizeQuizQuestionFields, repairQuizMathDelimiters } from "./quiz-display-text.js";
import { enrichQuizWithClarity } from "./quiz-quality.js";
import { attachDiagramsToQuizQuestions, buildQuizDiagramReport } from "./quiz-diagrams.js";
import { distributeQuestionCounts } from "./quiz-distribution.js";
import { searchQuestionBank } from "./question-bank-retrieve.js";

function questionBankError(message, statusCode = 503) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function normalizeBankQuestion(raw) {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const repaired = {
    ...raw,
    question: repairQuizMathDelimiters(String(raw.question || "")),
    options: Array.isArray(raw.options)
      ? raw.options.map((option) => repairQuizMathDelimiters(String(option)))
      : raw.options,
    ...(raw.answer != null ? { answer: repairQuizMathDelimiters(String(raw.answer)) } : {}),
    ...(typeof raw.explanation === "string"
      ? { explanation: repairQuizMathDelimiters(String(raw.explanation)) }
      : {}),
  };

  const normalized = normalizeQuizQuestionFields(repaired);
  if (!normalized.question || !Array.isArray(normalized.options) || normalized.options.length < 2) {
    return null;
  }
  if (!normalized.answer) {
    return null;
  }
  return normalized;
}

function shuffleInPlace(items) {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [items[index], items[swapIndex]] = [items[swapIndex], items[index]];
  }
  return items;
}

function sampleRows(rows, limit, excludeIds = new Set()) {
  const eligible = rows.filter((row) => !excludeIds.has(row.id));
  shuffleInPlace(eligible);
  return eligible.slice(0, Math.max(0, limit));
}

function fetchPublishedQuestionsByFocus({
  yearLevel,
  subject,
  focusLabel,
  difficulty,
  limit = 40,
}) {
  const db = getDb();
  const filters = ["quality_status = 'published'", "year_level = ?", "subject = ?"];
  const params = [yearLevel, subject];

  if (focusLabel) {
    filters.push("focus_label = ?");
    params.push(focusLabel);
  }
  if (difficulty && difficulty !== "mixed") {
    filters.push("difficulty = ?");
    params.push(difficulty);
  }

  params.push(Math.max(limit, 1));

  return db
    .prepare(
      `
      SELECT id, focus_label, question_json, difficulty
      FROM question_bank_items
      WHERE ${filters.join(" AND ")}
      ORDER BY RANDOM()
      LIMIT ?
    `,
    )
    .all(...params);
}

async function retrieveQuestionsForFocus(request, { count, excludeIds = new Set(), fetchImpl = fetch } = {}) {
  const yearLevel = request.yearLevel || "Year 7";
  const subject = request.subject || "Science";
  const focusLabel = String(request.focus || "").trim();
  const difficulty = String(request.difficulty || "mixed");

  let rows = fetchPublishedQuestionsByFocus({
    yearLevel,
    subject,
    focusLabel,
    difficulty,
    limit: Math.max(count * 4, 12),
  });

  if (rows.length < count && difficulty !== "mixed") {
    rows = fetchPublishedQuestionsByFocus({
      yearLevel,
      subject,
      focusLabel,
      difficulty: "mixed",
      limit: Math.max(count * 4, 12),
    });
  }

  if (rows.length > 0 && rows.length < count && focusLabel) {
    const query = `${yearLevel} ${subject} ${focusLabel}`;
    const hits = await searchQuestionBank({
      query,
      yearLevel,
      subject,
      focusLabel,
      limit: Math.max(count * 3, 10),
      fetchImpl,
    });
    for (const hit of hits) {
      if (!hit.questionId || excludeIds.has(hit.questionId)) {
        continue;
      }
      rows.push({
        id: hit.questionId,
        focus_label: hit.focusLabel,
        question_json: JSON.stringify(hit.question || {}),
        difficulty: hit.difficulty,
      });
    }
  }

  if (rows.length < count) {
    rows = [
      ...rows,
      ...fetchPublishedQuestionsByFocus({
        yearLevel,
        subject,
        focusLabel: "",
        difficulty: "mixed",
        limit: Math.max(count * 4, 12),
      }),
    ];
  }

  const seen = new Set(excludeIds);
  const unique = [];
  for (const row of rows) {
    if (seen.has(row.id)) {
      continue;
    }
    seen.add(row.id);
    unique.push(row);
  }

  return sampleRows(unique, count, excludeIds);
}

function rowsToQuestions(rows) {
  const questions = [];
  for (const row of rows) {
    let parsed;
    try {
      parsed = JSON.parse(row.question_json || "{}");
    } catch {
      parsed = null;
    }
    const normalized = normalizeBankQuestion(parsed);
    if (normalized) {
      questions.push(normalized);
    }
  }
  return questions;
}

async function finalizeBankQuiz(questions, request) {
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

async function generateQuizBatchFromQuestionBank(request, { fetchImpl = fetch } = {}) {
  const count = Math.max(1, Number(request.questionCount) || 5);
  const rows = await retrieveQuestionsForFocus(request, { count, fetchImpl });
  const questions = rowsToQuestions(rows);

  if (questions.length < count) {
    throw questionBankError(
      `Question bank has only ${questions.length} published question(s) for ${request.yearLevel} ${request.subject} — ${request.focus || "all topics"}. Need ${count}.`,
      503,
    );
  }

  const quiz = validateQuizData({
    subject: request.subject,
    focus: request.focus,
    yearLevel: request.yearLevel,
    curriculumSummary: `Curriculum-aligned ${request.subject} quiz from the local question bank.`,
    learningIntentions: [],
    questions: ensureQuestionVisuals(questions.slice(0, count)),
  });

  const finalized = await finalizeBankQuiz(quiz.questions, request);
  quiz.questions = finalized.questions;
  quiz.clarityReport = finalized.clarityReport;
  quiz.diagramReport = finalized.diagramReport;

  return {
    source: "Question bank",
    quiz,
    clarityReport: finalized.clarityReport,
    diagramReport: finalized.diagramReport,
  };
}

export async function generateQuizFromQuestionBank(request, { onProgress, fetchImpl = fetch } = {}) {
  const subtopics = Array.isArray(request.selectedSubtopics)
    ? request.selectedSubtopics.filter(Boolean)
    : [];

  if (subtopics.length <= 1) {
    const singleRequest =
      subtopics.length === 1 ? { ...request, focus: subtopics[0] } : request;
    return generateQuizBatchFromQuestionBank(singleRequest, { fetchImpl });
  }

  const distribution =
    request.distribution && typeof request.distribution === "object"
      ? request.distribution
      : distributeQuestionCounts(request.questionCount, subtopics);

  const mergedQuestions = [];
  const usedIds = new Set();
  const totalBatches = subtopics.length;

  for (let index = 0; index < subtopics.length; index += 1) {
    const focus = subtopics[index];
    const batchCount = Math.max(0, Number(distribution[focus]) || 0);
    if (batchCount <= 0) {
      continue;
    }

    onProgress?.(`Selecting ${index + 1}/${totalBatches} subtopics from question bank…`);

    const rows = await retrieveQuestionsForFocus(
      { ...request, focus, questionCount: batchCount },
      { count: batchCount, excludeIds: usedIds, fetchImpl },
    );
    for (const row of rows) {
      usedIds.add(row.id);
    }
    mergedQuestions.push(...rowsToQuestions(rows));
  }

  if (!mergedQuestions.length) {
    throw questionBankError("No questions were found in the question bank for the selected subtopics.", 503);
  }

  const quiz = validateQuizData({
    subject: request.subject,
    focus: request.focus,
    yearLevel: request.yearLevel,
    curriculumSummary: `Multi-topic ${request.subject} quiz from the local question bank.`,
    learningIntentions: [],
    questions: mergedQuestions.slice(0, request.questionCount),
  });

  const finalized = await finalizeBankQuiz(quiz.questions, request);
  quiz.questions = finalized.questions;
  quiz.clarityReport = finalized.clarityReport;
  quiz.diagramReport = finalized.diagramReport;

  return {
    source: "Question bank",
    quiz,
    clarityReport: finalized.clarityReport,
    diagramReport: finalized.diagramReport,
  };
}
