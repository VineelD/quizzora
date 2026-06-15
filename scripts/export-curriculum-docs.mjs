/**
 * Export curriculum learning guides (full docs + chunks) for local verification.
 *
 *   node scripts/export-curriculum-docs.mjs
 *   node scripts/export-curriculum-docs.mjs --out C:\LittleCode\data\curriculum-docs-export
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getDb } from "../lib/db.js";
import { resolveOllamaEmbedModel } from "../lib/ollama-embeddings.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_OUT = path.join(__dirname, "..", "data", "curriculum-docs-export");

const INVALID_WIN_CHARS = /[<>:"/\\|?*\u0000-\u001f]/g;
const TRAILING_DOTS = /\.+$/;

function parseArgs(argv) {
  const options = { out: DEFAULT_OUT };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--out") {
      options.out = path.resolve(argv[index + 1] || DEFAULT_OUT);
      index += 1;
    }
  }
  return options;
}

function sanitizePathSegment(value, { fallback = "unknown" } = {}) {
  const trimmed = String(value || "").trim().replace(INVALID_WIN_CHARS, " ").replace(/\s+/g, " ").trim();
  const withoutTrailingDots = trimmed.replace(TRAILING_DOTS, "").trim();
  const clipped = withoutTrailingDots.slice(0, 120).trim();
  return clipped || fallback;
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeTextFile(filePath, content) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content ?? "", "utf8");
}

function parseAcaraCodes(raw) {
  if (raw == null || raw === "") {
    return null;
  }
  try {
    const parsed = JSON.parse(raw);
    return parsed;
  } catch {
    return raw;
  }
}

function chunkFileName(chunkIndex) {
  return `chunk-${String(chunkIndex).padStart(2, "0")}.md`;
}

const options = parseArgs(process.argv.slice(2));
getDb();
const db = getDb();

const jobs = db
  .prepare(
    `
    SELECT
      focus_label,
      year_level,
      subject,
      topic_key,
      subtopic,
      acara_codes,
      status,
      full_doc,
      chunk_count,
      generated_at,
      embedded_at
    FROM curriculum_doc_jobs
    WHERE full_doc IS NOT NULL AND TRIM(full_doc) != ''
    ORDER BY year_level, subject, subtopic
    `,
  )
  .all();

const chunksByFocus = db
  .prepare(
    `
    SELECT focus_label, chunk_index, content, model
    FROM curriculum_doc_chunks
    ORDER BY focus_label, chunk_index
    `,
  )
  .all()
  .reduce((map, row) => {
    if (!map.has(row.focus_label)) {
      map.set(row.focus_label, []);
    }
    map.get(row.focus_label).push(row);
    return map;
  }, new Map());

const defaultEmbedModel = resolveOllamaEmbedModel();
const usedSubtopicDirs = new Map();
const exported = [];

for (const job of jobs) {
  const yearDir = sanitizePathSegment(job.year_level, { fallback: "unknown-year" });
  const subjectDir = sanitizePathSegment(job.subject, { fallback: "unknown-subject" });
  const baseSubtopic = sanitizePathSegment(job.subtopic, { fallback: "unknown-subtopic" });

  const dirKey = `${yearDir}/${subjectDir}/${baseSubtopic.toLowerCase()}`;
  const seen = usedSubtopicDirs.get(dirKey) || 0;
  usedSubtopicDirs.set(dirKey, seen + 1);
  const subtopicDir =
    seen === 0 ? baseSubtopic : `${baseSubtopic} (${seen + 1})`;

  const outDir = path.join(options.out, yearDir, subjectDir, subtopicDir);
  const chunks = chunksByFocus.get(job.focus_label) || [];
  const embedModels = [...new Set(chunks.map((row) => row.model).filter(Boolean))];
  const embedModel = embedModels.length === 1 ? embedModels[0] : embedModels.length > 1 ? embedModels : defaultEmbedModel;

  writeTextFile(path.join(outDir, "full-doc.md"), job.full_doc);

  const chunksDir = path.join(outDir, "chunks");
  for (const chunk of chunks) {
    writeTextFile(path.join(chunksDir, chunkFileName(chunk.chunk_index)), chunk.content);
  }

  const metadata = {
    focus_label: job.focus_label,
    year_level: job.year_level,
    subject: job.subject,
    topic_key: job.topic_key,
    subtopic: job.subtopic,
    acara_codes: parseAcaraCodes(job.acara_codes),
    status: job.status,
    chunk_count: chunks.length || Number(job.chunk_count || 0),
    embed_model: embedModel,
    generated_at: job.generated_at,
    embedded_at: job.embedded_at,
    export_path: path.relative(options.out, outDir),
    content_type: "learning_material",
    depth: "enriched",
  };

  writeTextFile(path.join(outDir, "metadata.json"), `${JSON.stringify(metadata, null, 2)}\n`);

  exported.push({
    focusLabel: job.focus_label,
    outDir: path.relative(options.out, outDir),
    chunkCount: chunks.length,
  });
}

console.log(`Exported ${exported.length} subtopic(s) to ${options.out}`);
console.log(`Total chunks written: ${exported.reduce((sum, row) => sum + row.chunkCount, 0)}`);

const sample = exported.slice(0, 8).map((row) => row.outDir);
if (sample.length > 0) {
  console.log("\nSample folders:");
  for (const folder of sample) {
    console.log(`  ${folder}`);
  }
}
