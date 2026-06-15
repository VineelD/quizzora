import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getDb } from "./db.js";
import { blobToEmbedding, cosineSimilarity, embedText } from "./ollama-embeddings.js";
import { parseFocusLabel } from "./curriculum-topics.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_CURRICULUM_EXPORT_DIR = path.join(__dirname, "..", "data", "curriculum-docs-export");

export function isStudyCoachRagEnabled() {
  return process.env.STUDY_COACH_RAG_ENABLED === "true";
}

function loadCandidateChunks({ focusLabel, yearLevel, subject }) {
  const db = getDb();
  const cleanFocus = String(focusLabel || "").trim();

  if (cleanFocus) {
    const exact = db
      .prepare(
        `
        SELECT id, focus_label, year_level, subject, subtopic, chunk_index, content, embedding
        FROM curriculum_doc_chunks
        WHERE focus_label = ? AND embedding IS NOT NULL
        ORDER BY chunk_index
        `,
      )
      .all(cleanFocus);
    if (exact.length > 0) {
      return exact;
    }
  }

  const parsed = parseFocusLabel(cleanFocus);
  const year = yearLevel || null;
  const subj = subject || null;

  if (year && subj) {
    return db
      .prepare(
        `
        SELECT id, focus_label, year_level, subject, subtopic, chunk_index, content, embedding
        FROM curriculum_doc_chunks
        WHERE year_level = ? AND subject = ? AND embedding IS NOT NULL
        ORDER BY focus_label, chunk_index
        `,
      )
      .all(year, subj);
  }

  if (parsed.subtopic) {
    return db
      .prepare(
        `
        SELECT id, focus_label, year_level, subject, subtopic, chunk_index, content, embedding
        FROM curriculum_doc_chunks
        WHERE subtopic = ? AND embedding IS NOT NULL
        ORDER BY focus_label, chunk_index
        LIMIT 200
        `,
      )
      .all(parsed.subtopic);
  }

  return [];
}

function mapChunkRow(row, { score = 1 } = {}) {
  return {
    id: row.id,
    focusLabel: row.focus_label,
    yearLevel: row.year_level,
    subject: row.subject,
    subtopic: row.subtopic,
    chunkIndex: row.chunk_index,
    content: row.content,
    score,
  };
}

export function rankChunksBySimilarity(chunks, queryEmbedding) {
  return chunks
    .map((row) => {
      const embedding = blobToEmbedding(row.embedding);
      return mapChunkRow(row, { score: cosineSimilarity(queryEmbedding, embedding) });
    })
    .filter((row) => row.score > -1)
    .sort((left, right) => right.score - left.score);
}

export async function searchCurriculumDocs(
  { focusLabel, query, limit = 4, yearLevel, subject },
  { fetchImpl = fetch } = {},
) {
  const cleanQuery = String(query || "").trim();
  if (!cleanQuery) {
    return [];
  }

  const candidates = loadCandidateChunks({ focusLabel, yearLevel, subject });
  if (candidates.length === 0) {
    return [];
  }

  const topK = Math.max(1, Number(limit) || 4);
  if (candidates.length <= topK) {
    return candidates
      .slice()
      .sort((left, right) => left.chunk_index - right.chunk_index)
      .map((row) => mapChunkRow(row));
  }

  const queryEmbedding = await embedText(cleanQuery, { fetchImpl });
  const ranked = rankChunksBySimilarity(candidates, queryEmbedding);
  return ranked.slice(0, topK);
}

export function formatRagChunksForPrompt(chunks, { maxChars = 6000 } = {}) {
  if (!Array.isArray(chunks) || chunks.length === 0) {
    return "";
  }

  let text =
    "Curriculum reference excerpts (Australian curriculum study material — use to ground explanations; do not present as quiz answers):\n";

  for (const chunk of chunks) {
    const header = chunk.subtopic || chunk.focusLabel || "Reference";
    const section = `\n### ${header}\n${chunk.content}\n`;
    if (text.length + section.length > maxChars) {
      break;
    }
    text += section;
  }

  return text.trim();
}

export function resolveRagTopK({ forOllama = false } = {}) {
  const configured = Number(process.env.STUDY_COACH_RAG_TOP_K);
  if (Number.isFinite(configured) && configured > 0) {
    return configured;
  }
  return forOllama ? 1 : 4;
}

export function resolveRagMaxChars({ forOllama = false } = {}) {
  const configured = Number(process.env.STUDY_COACH_RAG_MAX_CHARS);
  if (Number.isFinite(configured) && configured > 0) {
    return configured;
  }
  return forOllama ? 1600 : 6000;
}

function truncateCurriculumText(text, maxChars) {
  const clean = String(text || "").trim();
  if (!clean || !maxChars || clean.length <= maxChars) {
    return clean;
  }
  return `${clean.slice(0, maxChars).trimEnd()}\n\n[truncated for prompt limit]`;
}

export function resolveOnyxLocalCurriculumMaxChars() {
  const configured = Number(process.env.STUDY_COACH_ONYX_LOCAL_CURRICULUM_MAX_CHARS);
  if (Number.isFinite(configured) && configured > 0) {
    return configured;
  }
  return 12000;
}

export function resolveOnyxLocalCurriculumMaxDocs() {
  const configured = Number(process.env.STUDY_COACH_ONYX_LOCAL_CURRICULUM_MAX_DOCS);
  if (Number.isFinite(configured) && configured > 0) {
    return configured;
  }
  return 20;
}

function resolveCurriculumExportDir() {
  const configured = String(process.env.CURRICULUM_DOCS_EXPORT_DIR || "").trim();
  return configured ? path.resolve(configured) : DEFAULT_CURRICULUM_EXPORT_DIR;
}

function sanitizeExportPathSegment(value, { fallback = "unknown" } = {}) {
  const trimmed = String(value || "")
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\.+$/, "")
    .slice(0, 120)
    .trim();
  return trimmed || fallback;
}

function readCurriculumExportFullDoc({ yearLevel, subject, subtopic }) {
  const exportDir = resolveCurriculumExportDir();
  const subtopicDir = path.join(
    exportDir,
    sanitizeExportPathSegment(yearLevel),
    sanitizeExportPathSegment(subject),
    sanitizeExportPathSegment(subtopic),
  );
  const fullDocPath = path.join(subtopicDir, "full-doc.md");
  try {
    if (fs.existsSync(fullDocPath)) {
      return fs.readFileSync(fullDocPath, "utf8").trim();
    }
  } catch {
    // fall through
  }
  return "";
}

/**
 * Load full subtopic curriculum text from SQLite (preferred) or export files.
 * Used to skip Onyx internal_search when the subtopic is already scoped.
 */
export function loadLocalCurriculumDocText(
  { focusLabel, yearLevel, subject, subtopic, maxChars = resolveOnyxLocalCurriculumMaxChars() } = {},
) {
  const cleanFocus = String(focusLabel || "").trim();
  const db = getDb();

  if (cleanFocus) {
    const row = db
      .prepare(
        `
        SELECT full_doc
        FROM curriculum_doc_jobs
        WHERE focus_label = ? AND full_doc IS NOT NULL AND TRIM(full_doc) != ''
        `,
      )
      .get(cleanFocus);
    if (row?.full_doc) {
      return truncateCurriculumText(row.full_doc, maxChars);
    }
  }

  const chunks = loadCandidateChunks({ focusLabel: cleanFocus, yearLevel, subject });
  if (chunks.length > 0) {
    const merged = chunks
      .slice()
      .sort((left, right) => left.chunk_index - right.chunk_index)
      .map((row) => String(row.content || "").trim())
      .filter(Boolean)
      .join("\n\n");
    if (merged) {
      return truncateCurriculumText(merged, maxChars);
    }
  }

  const parsed = parseFocusLabel(cleanFocus);
  const resolvedSubtopic = subtopic || parsed.subtopic;
  if (yearLevel && subject && resolvedSubtopic) {
    const fromExport = readCurriculumExportFullDoc({
      yearLevel,
      subject,
      subtopic: resolvedSubtopic,
    });
    if (fromExport) {
      return truncateCurriculumText(fromExport, maxChars);
    }
  }

  return "";
}

/**
 * Load curriculum full-doc text for every subtopic in a year + subject (SQLite preferred).
 * Used when Onyx skip-search injects local curriculum instead of internal_search.
 */
export function loadLocalCurriculumDocsForYearSubject(
  { yearLevel, subject, maxDocs = resolveOnyxLocalCurriculumMaxDocs(), maxCharsPerDoc } = {},
) {
  const year = String(yearLevel || "").trim();
  const subj = String(subject || "").trim();
  if (!year || !subj) {
    return [];
  }

  const limit = Math.max(1, Number(maxDocs) || resolveOnyxLocalCurriculumMaxDocs());
  const perDocMax = Math.max(
    500,
    Number(maxCharsPerDoc) || Math.floor(resolveOnyxLocalCurriculumMaxChars() / limit),
  );
  const db = getDb();
  const rows = db
    .prepare(
      `
      SELECT focus_label, year_level, subject, subtopic, full_doc
      FROM curriculum_doc_jobs
      WHERE year_level = ? AND subject = ? AND full_doc IS NOT NULL AND TRIM(full_doc) != ''
      ORDER BY focus_label
      LIMIT ?
      `,
    )
    .all(year, subj, limit);

  const docs = [];
  for (const row of rows) {
    const text = truncateCurriculumText(row.full_doc, perDocMax);
    if (text) {
      docs.push({
        focusLabel: row.focus_label,
        yearLevel: row.year_level,
        subject: row.subject,
        subtopic: row.subtopic,
        text,
      });
    }
  }
  return docs;
}

export async function retrieveStudyCoachRagContext(
  { context, message },
  { fetchImpl = fetch, forceRag = false, forOllama = false } = {},
) {
  if (!forceRag && !isStudyCoachRagEnabled()) {
    return { chunks: [], promptSection: "" };
  }

  const query = String(message || "").trim() || String(context?.focus || "").trim();
  if (!query) {
    return { chunks: [], promptSection: "" };
  }

  try {
    const chunks = await searchCurriculumDocs(
      {
        focusLabel: context?.focus,
        query,
        limit: resolveRagTopK({ forOllama }),
        yearLevel: context?.yearLevel,
        subject: context?.subject,
      },
      { fetchImpl },
    );
    return {
      chunks,
      promptSection: formatRagChunksForPrompt(chunks, {
        maxChars: resolveRagMaxChars({ forOllama }),
      }),
    };
  } catch {
    return { chunks: [], promptSection: "" };
  }
}
