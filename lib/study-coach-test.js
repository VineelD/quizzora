import { buildCurriculumPromptContext, parseFocusLabel } from "./curriculum-topics.js";
import { retrieveStudyCoachRagContext } from "./curriculum-doc-retrieve.js";
import { enumerateCurriculumCells } from "./question-bank-cells.js";
import { getDb } from "./db.js";
import { callStudyCoachLlm, resolveStudyCoachProvider } from "./study-coach-llm.js";
import { processStudyCoachLlmReply } from "./study-coach.js";

export function listEmbeddedFocusLabels() {
  const db = getDb();
  const rows = db
    .prepare(
      `
      SELECT DISTINCT focus_label, year_level, subject, subtopic
      FROM curriculum_doc_chunks
      WHERE embedding IS NOT NULL
      ORDER BY year_level, subject, focus_label
      `,
    )
    .all();

  return rows.map((row) => ({
    focusLabel: row.focus_label,
    yearLevel: row.year_level,
    subject: row.subject,
    subtopic: row.subtopic,
  }));
}

export function buildStudyCoachTestContext(focusLabel) {
  const cleanFocus = String(focusLabel || "").trim();
  if (!cleanFocus) {
    throw new Error("focusLabel is required.");
  }

  const cell = enumerateCurriculumCells().find((entry) => entry.focusLabel === cleanFocus);
  const dbRow = getDb()
    .prepare(
      `
      SELECT year_level, subject, subtopic
      FROM curriculum_doc_chunks
      WHERE focus_label = ?
      LIMIT 1
      `,
    )
    .get(cleanFocus);

  const parsed = parseFocusLabel(cleanFocus);
  const yearLevel = cell?.yearLevel || dbRow?.year_level || "Year 7";
  const subject = cell?.subject || dbRow?.subject || "Science";

  return {
    yearLevel,
    subject,
    focus: cleanFocus,
    curriculumSummary: buildCurriculumPromptContext({
      yearLevel,
      subject,
      focus: cleanFocus,
    }),
    learningIntentions: [],
    selectedTopicKeys: cell?.topicKey ? [cell.topicKey] : [],
    selectedSubtopics: [cleanFocus],
  };
}

function serializeRagChunks(chunks) {
  return (chunks || []).map((chunk) => ({
    id: chunk.id,
    focusLabel: chunk.focusLabel,
    yearLevel: chunk.yearLevel,
    subject: chunk.subject,
    subtopic: chunk.subtopic,
    chunkIndex: chunk.chunkIndex,
    score: chunk.score,
    excerpt: String(chunk.content || "").slice(0, 500),
  }));
}

export async function runStudyCoachRagTest(
  { message, focusLabel, history = [] },
  { fetchImpl = fetch } = {},
) {
  const trimmed = String(message || "").trim();
  if (!trimmed) {
    throw new Error("Message is required.");
  }
  if (trimmed.length > 2000) {
    throw new Error("Message is too long.");
  }

  const context = buildStudyCoachTestContext(focusLabel);
  const cleanHistory = (Array.isArray(history) ? history : [])
    .map((entry) => ({
      role: entry.role === "assistant" ? "assistant" : "user",
      content: String(entry.content || "").trim(),
    }))
    .filter((entry) => entry.content)
    .slice(-12);

  const { chunks, promptSection } = await retrieveStudyCoachRagContext(
    { context, message: trimmed },
    { fetchImpl, forceRag: true },
  );

  const llmResult = await callStudyCoachLlm(
    { context, history: cleanHistory, message: trimmed },
    { fetchImpl, ragContext: promptSection },
  );

  if (!llmResult) {
    throw new Error("Study Coach LLM is not configured (check OPENAI_API_KEY or Ollama).");
  }

  const reply = processStudyCoachLlmReply({
    rawReply: llmResult.rawReply,
    context,
    message: trimmed,
    source: llmResult.source,
  });

  return {
    reply: reply.content,
    payload: reply.payload,
    rawReply: reply.rawReply,
    onTopic: reply.onTopic,
    followUps: reply.followUps,
    flagged: reply.flagged,
    source: reply.source,
    provider: resolveStudyCoachProvider(),
    ragChunks: serializeRagChunks(chunks),
    ragEnabled: true,
    focusLabel: context.focus,
    responseKind: llmResult.onyx?.responseKind || classifyProcessedReply(reply.rawReply),
    onyx: llmResult.onyx || null,
    context: {
      yearLevel: context.yearLevel,
      subject: context.subject,
      focus: context.focus,
    },
  };
}

function classifyProcessedReply(rawReply) {
  const text = String(rawReply || "").trim();
  if (!text) {
    return "empty";
  }
  if (text.trimStart().startsWith("{") && text.includes('"portions"')) {
    return "json_tutor";
  }
  if (/learning guide/i.test(text) && /###\s+introduction/i.test(text)) {
    return "search_dump";
  }
  return "reasoned_prose";
}
