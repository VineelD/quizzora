import { createHash } from "node:crypto";
import { getDb } from "./db.js";
import {
  blobToEmbedding,
  checkOllamaEmbeddingsAvailable,
  embedText,
  embedTexts,
  embeddingToBlob,
  resolveOllamaEmbedModel,
} from "./ollama-embeddings.js";
import { buildQuestionBankEmbedText } from "./question-bank-embed-text.js";

export function hashEmbedText(text) {
  return createHash("sha256").update(String(text || "")).digest("hex");
}

export function getCurrentEmbedModel() {
  return resolveOllamaEmbedModel();
}

export function getQuestionEmbeddingStats() {
  const db = getDb();
  const model = getCurrentEmbedModel();
  const published = db
    .prepare(
      "SELECT COUNT(*) AS count FROM question_bank_items WHERE quality_status = 'published'",
    )
    .get();
  const embedded = db
    .prepare(
      `
      SELECT COUNT(*) AS count
      FROM question_embeddings e
      JOIN question_bank_items q ON q.id = e.question_id
      WHERE q.quality_status = 'published' AND e.model = ?
    `,
    )
    .get(model);

  const stale = db
    .prepare(
      `
      SELECT COUNT(*) AS count
      FROM question_embeddings e
      JOIN question_bank_items q ON q.id = e.question_id
      WHERE q.quality_status = 'published' AND e.model != ?
    `,
    )
    .get(model);

  return {
    model,
    published: Number(published?.count || 0),
    embedded: Number(embedded?.count || 0),
    staleModel: Number(stale?.count || 0),
    pending: Math.max(0, Number(published?.count || 0) - Number(embedded?.count || 0)),
  };
}

export function listQuestionsNeedingEmbedding({ limit = 100, model = getCurrentEmbedModel() } = {}) {
  const db = getDb();
  return db
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
        e.model AS embed_model,
        e.text_hash AS embed_text_hash
      FROM question_bank_items q
      LEFT JOIN question_embeddings e ON e.question_id = q.id
      WHERE q.quality_status = 'published'
        AND (
          e.question_id IS NULL
          OR e.model != ?
        )
      ORDER BY q.id
      LIMIT ?
    `,
    )
    .all(model, limit);
}

export function upsertQuestionEmbedding({ questionId, embedding, model, textHash }) {
  const dimensions = embedding.length;
  const blob = embeddingToBlob(embedding);
  getDb()
    .prepare(
      `
      INSERT INTO question_embeddings (question_id, embedding, model, dimensions, text_hash)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(question_id) DO UPDATE SET
        embedding = excluded.embedding,
        model = excluded.model,
        dimensions = excluded.dimensions,
        text_hash = excluded.text_hash,
        created_at = CURRENT_TIMESTAMP
    `,
    )
    .run(questionId, blob, model, dimensions, textHash);
}

function needsReembed(row, textHash, model) {
  if (!row.embed_model) {
    return true;
  }
  if (row.embed_model !== model) {
    return true;
  }
  return row.embed_text_hash !== textHash;
}

/**
 * Embed published question-bank items that are missing or stale for the current model.
 */
export async function embedQuestionBankItems({
  limit = 500,
  model = getCurrentEmbedModel(),
  fetchImpl = fetch,
  onProgress,
} = {}) {
  const availability = await checkOllamaEmbeddingsAvailable({ fetchImpl });
  if (!availability.ok) {
    throw new Error(availability.error || "Ollama embeddings are not available.");
  }

  const rows = listQuestionsNeedingEmbedding({ limit, model });
  const work = [];

  for (const row of rows) {
    let question;
    try {
      question = JSON.parse(row.question_json || "{}");
    } catch {
      continue;
    }

    const text = buildQuestionBankEmbedText({
      focusLabel: row.focus_label,
      question,
      mode: "coach",
    });
    const textHash = hashEmbedText(text);
    if (!needsReembed(row, textHash, model)) {
      continue;
    }
    work.push({ row, text, textHash });
  }

  if (!work.length) {
    return { embedded: 0, skipped: rows.length, errors: [] };
  }

  const embeddings = await embedTexts(
    work.map((item) => item.text),
    { fetchImpl, model },
  );

  const errors = [];
  let embedded = 0;

  for (let index = 0; index < work.length; index += 1) {
    const item = work[index];
    const vector = embeddings[index];
    if (!Array.isArray(vector) || !vector.length) {
      errors.push({ questionId: item.row.id, error: "empty_embedding" });
      continue;
    }

    try {
      upsertQuestionEmbedding({
        questionId: item.row.id,
        embedding: vector,
        model,
        textHash: item.textHash,
      });
      embedded += 1;
      onProgress?.({ questionId: item.row.id, embedded, total: work.length });
    } catch (error) {
      errors.push({ questionId: item.row.id, error: error?.message || "upsert_failed" });
    }
  }

  return {
    embedded,
    skipped: rows.length - work.length,
    attempted: work.length,
    errors,
    model,
  };
}

/**
 * Embed a single query string (used by retrieval).
 */
export async function embedQuestionBankQuery(query, options = {}) {
  return embedText(query, options);
}
