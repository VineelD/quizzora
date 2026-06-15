import { getDb } from "./db.js";
import {
  blobToEmbedding,
  cosineSimilarity,
  embedText,
  resolveOllamaEmbedModel,
} from "./ollama-embeddings.js";

/**
 * Vector search over published question_bank_items.
 * Uses Float32 BLOB storage + in-process cosine similarity (no sqlite-vec native extension).
 *
 * @param {{
 *   query: string,
 *   yearLevel?: string,
 *   subject?: string,
 *   focusLabel?: string,
 *   limit?: number,
 *   model?: string,
 *   fetchImpl?: typeof fetch,
 * }} params
 */
export async function searchQuestionBank({
  query,
  yearLevel,
  subject,
  focusLabel,
  limit = 8,
  model = resolveOllamaEmbedModel(),
  fetchImpl = fetch,
}) {
  const cleanQuery = String(query || "").trim();
  if (!cleanQuery) {
    return [];
  }

  const queryEmbedding = await embedText(cleanQuery, { fetchImpl, model });
  if (!queryEmbedding.length) {
    return [];
  }

  const db = getDb();
  const filters = ["q.quality_status = 'published'", "e.model = ?"];
  const params = [model];

  if (yearLevel) {
    filters.push("q.year_level = ?");
    params.push(yearLevel);
  }
  if (subject) {
    filters.push("q.subject = ?");
    params.push(subject);
  }
  if (focusLabel) {
    filters.push("q.focus_label = ?");
    params.push(focusLabel);
  }

  const rows = db
    .prepare(
      `
      SELECT
        q.id,
        q.focus_label,
        q.year_level,
        q.subject,
        q.topic_key,
        q.subtopic,
        q.difficulty,
        q.question_json,
        e.embedding,
        e.dimensions
      FROM question_bank_items q
      JOIN question_embeddings e ON e.question_id = q.id
      WHERE ${filters.join(" AND ")}
    `,
    )
    .all(...params);

  const scored = rows
    .map((row) => {
      const vector = blobToEmbedding(row.embedding);
      const score = cosineSimilarity(queryEmbedding, vector);
      let question = null;
      try {
        question = JSON.parse(row.question_json || "{}");
      } catch {
        question = null;
      }
      return {
        questionId: row.id,
        score,
        focusLabel: row.focus_label,
        yearLevel: row.year_level,
        subject: row.subject,
        topicKey: row.topic_key,
        subtopic: row.subtopic,
        difficulty: row.difficulty,
        question,
      };
    })
    .filter((item) => item.score > -1)
    .sort((left, right) => right.score - left.score)
    .slice(0, Math.max(1, limit));

  return scored;
}

/**
 * Format top question-bank hits for Study Coach / quiz-generation prompts.
 */
export function formatQuestionBankHitsForPrompt(hits, { maxChars = 4000 } = {}) {
  if (!Array.isArray(hits) || hits.length === 0) {
    return "";
  }

  let text =
    "Similar published quiz questions from the local question bank (use as style/curriculum reference; do not copy verbatim):\n";

  for (const hit of hits) {
    const stem = hit.question?.question || "";
    const options = Array.isArray(hit.question?.options) ? hit.question.options.join(" | ") : "";
    const section = `\n- [${hit.focusLabel}] ${stem}\n  Options: ${options}\n`;
    if (text.length + section.length > maxChars) {
      break;
    }
    text += section;
  }

  return text.trim();
}
