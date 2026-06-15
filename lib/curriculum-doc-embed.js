import { getDb } from "./db.js";
import { blobToEmbedding, embedText, embeddingToBlob, resolveOllamaEmbedModel } from "./ollama-embeddings.js";

export function listChunksNeedingEmbedding({ limit = 50, model = resolveOllamaEmbedModel() } = {}) {
  return getDb()
    .prepare(
      `
      SELECT id, focus_label, content
      FROM curriculum_doc_chunks
      WHERE embedding IS NULL OR model IS NULL OR model != ?
      ORDER BY focus_label, chunk_index
      LIMIT ?
      `,
    )
    .all(model, Math.max(1, Number(limit) || 50));
}

export async function embedCurriculumChunkRow(row, { fetchImpl = fetch, model = resolveOllamaEmbedModel() } = {}) {
  const embedding = await embedText(row.content, { fetchImpl, model });
  const blob = embeddingToBlob(embedding);
  const db = getDb();

  db.prepare(
    `
    UPDATE curriculum_doc_chunks
    SET embedding = ?, model = ?
    WHERE id = ?
    `,
  ).run(blob, model, row.id);

  return { id: row.id, focusLabel: row.focus_label, dimensions: embedding.length };
}

export async function embedCurriculumChunksBatch({ limit = 50, fetchImpl = fetch } = {}) {
  const rows = listChunksNeedingEmbedding({ limit });
  const results = [];

  for (const row of rows) {
    try {
      results.push({ ...(await embedCurriculumChunkRow(row, { fetchImpl })), ok: true });
    } catch (error) {
      results.push({
        id: row.id,
        focusLabel: row.focus_label,
        ok: false,
        error: error?.message || "Embedding failed.",
      });
    }
  }

  markEmbeddedJobs();
  return results;
}

export function markEmbeddedJobs() {
  const db = getDb();
  const now = new Date().toISOString();

  db.prepare(
    `
    UPDATE curriculum_doc_jobs
    SET status = 'embedded', embedded_at = ?
    WHERE focus_label IN (
      SELECT j.focus_label
      FROM curriculum_doc_jobs j
      WHERE j.status IN ('generated', 'embedded')
        AND j.chunk_count > 0
        AND NOT EXISTS (
          SELECT 1
          FROM curriculum_doc_chunks c
          WHERE c.focus_label = j.focus_label
            AND c.embedding IS NULL
        )
    )
    `,
  ).run(now);
}

export function countEmbeddedChunks() {
  const row = getDb()
    .prepare("SELECT COUNT(*) AS count FROM curriculum_doc_chunks WHERE embedding IS NOT NULL")
    .get();
  return Number(row?.count || 0);
}

export { blobToEmbedding };
