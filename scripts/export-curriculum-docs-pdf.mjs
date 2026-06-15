/**
 * Export curriculum reference docs as PDF (one per subtopic).
 * Plain-text PDF only — LaTeX is not rendered. Prefer HTML export for formatted math:
 *   node scripts/export-curriculum-docs-html.mjs
 *
 *   node scripts/export-curriculum-docs-pdf.mjs
 *   node scripts/export-curriculum-docs-pdf.mjs --out C:\LittleCode\data\curriculum-docs-export-pdf
 *   node scripts/export-curriculum-docs-pdf.mjs --from-export
 *   node scripts/export-curriculum-docs-pdf.mjs --no-chunk-boundaries
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import PDFDocument from "pdfkit";
import { getDb } from "../lib/db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_OUT = path.join(__dirname, "..", "data", "curriculum-docs-export-pdf");
const DEFAULT_MARKDOWN_EXPORT = path.join(__dirname, "..", "data", "curriculum-docs-export");

const INVALID_WIN_CHARS = /[<>:"/\\|?*\u0000-\u001f]/g;
const TRAILING_DOTS = /\.+$/;

function parseArgs(argv) {
  const options = {
    out: DEFAULT_OUT,
    fromExport: false,
    markdownRoot: DEFAULT_MARKDOWN_EXPORT,
    chunkBoundaries: true,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--out") {
      options.out = path.resolve(argv[index + 1] || DEFAULT_OUT);
      index += 1;
    } else if (arg === "--from-export") {
      options.fromExport = true;
    } else if (arg === "--markdown-root") {
      options.markdownRoot = path.resolve(argv[index + 1] || DEFAULT_MARKDOWN_EXPORT);
      index += 1;
    } else if (arg === "--no-chunk-boundaries") {
      options.chunkBoundaries = false;
    }
  }

  return options;
}

function sanitizePathSegment(value, { fallback = "unknown" } = {}) {
  const trimmed = String(value || "")
    .trim()
    .replace(INVALID_WIN_CHARS, " ")
    .replace(/\s+/g, " ")
    .trim();
  const withoutTrailingDots = trimmed.replace(TRAILING_DOTS, "").trim();
  const clipped = withoutTrailingDots.slice(0, 120).trim();
  return clipped || fallback;
}

function sanitizePdfFileName(value, { fallback = "subtopic" } = {}) {
  const base = sanitizePathSegment(value, { fallback });
  return `${base}.pdf`;
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function parseAcaraCodes(raw) {
  if (raw == null || raw === "") {
    return null;
  }
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function formatAcaraCodes(acaraCodes) {
  const parsed = parseAcaraCodes(acaraCodes);
  if (Array.isArray(parsed)) {
    return parsed.join(", ");
  }
  return String(parsed || "").trim();
}

function normalizeDocText(value) {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

function isSectionHeading(line) {
  const text = String(line || "").trim();
  if (!text || text.length > 80) {
    return false;
  }
  if (/^[-*\d.]/.test(text)) {
    return false;
  }
  if (/[.!?;:]$/.test(text)) {
    return false;
  }
  return true;
}

function writeMetadataLine(doc, label, value) {
  const text = String(value || "").trim();
  if (!text) {
    return;
  }
  doc
    .font("Helvetica-Bold")
    .fontSize(9)
    .fillColor("#334155")
    .text(`${label}: `, { continued: true });
  doc.font("Helvetica").fillColor("#475569").text(text);
  doc.fillColor("#000000");
}

function writeBodyBlock(doc, block) {
  const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
  if (!lines.length) {
    return;
  }

  const isBulletList = lines.every((line) => /^[-*]\s+/.test(line));
  if (isBulletList) {
    for (const line of lines) {
      doc
        .font("Helvetica")
        .fontSize(10)
        .text(`• ${line.replace(/^[-*]\s+/, "")}`, { indent: 12, paragraphGap: 2, lineGap: 1 });
    }
    doc.moveDown(0.35);
    return;
  }

  if (lines.length === 1 && isSectionHeading(lines[0])) {
    doc.moveDown(0.15);
    doc.font("Helvetica-Bold").fontSize(12).fillColor("#0f172a").text(lines[0]);
    doc.fillColor("#000000");
    doc.moveDown(0.25);
    return;
  }

  doc
    .font("Helvetica")
    .fontSize(10)
    .text(lines.join(" "), { align: "left", paragraphGap: 3, lineGap: 1.5 });
  doc.moveDown(0.35);
}

function writeFullDocBody(doc, fullDoc) {
  const normalized = normalizeDocText(fullDoc);
  if (!normalized) {
    doc.font("Helvetica-Oblique").fontSize(10).fillColor("#64748b").text("(empty document)");
    doc.fillColor("#000000");
    return;
  }

  const blocks = normalized.split(/\n\s*\n/);
  for (const block of blocks) {
    writeBodyBlock(doc, block);
  }
}

function writeChunkBoundaries(doc, chunks) {
  if (!Array.isArray(chunks) || !chunks.length) {
    return;
  }

  doc.moveDown(0.5);
  doc
    .strokeColor("#cbd5e1")
    .moveTo(doc.page.margins.left, doc.y)
    .lineTo(doc.page.width - doc.page.margins.right, doc.y)
    .stroke();
  doc.moveDown(0.5);

  doc.font("Helvetica-Bold").fontSize(11).fillColor("#0f172a").text("Chunk boundaries");
  doc.fillColor("#000000");
  doc.moveDown(0.25);

  for (const chunk of chunks) {
    const index = String(chunk.chunk_index ?? 0).padStart(2, "0");
    const preview = normalizeDocText(chunk.content).split("\n").find(Boolean) || "(empty chunk)";
    const clippedPreview = preview.length > 120 ? `${preview.slice(0, 117)}...` : preview;

    doc
      .font("Helvetica-Bold")
      .fontSize(9)
      .fillColor("#334155")
      .text(`Chunk ${index}`, { continued: true });
    doc.font("Helvetica").fillColor("#64748b").text(` — ${clippedPreview}`);
    doc.fillColor("#000000");
    doc.moveDown(0.15);
  }
}

function renderCurriculumPdf({ job, chunks, includeChunkBoundaries }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: "A4", autoFirstPage: true });
    const buffers = [];

    doc.on("data", (chunk) => buffers.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(buffers)));
    doc.on("error", reject);

    const title = String(job.subtopic || job.focus_label || "Curriculum reference").trim();

    doc.font("Helvetica-Bold").fontSize(18).fillColor("#0f172a").text(title);
    doc.fillColor("#000000");
    doc.moveDown(0.35);

    writeMetadataLine(doc, "Focus", job.focus_label);
    writeMetadataLine(doc, "Year level", job.year_level);
    writeMetadataLine(doc, "Subject", job.subject);
    writeMetadataLine(doc, "Topic", job.topic_key);
    writeMetadataLine(doc, "ACARA", formatAcaraCodes(job.acara_codes));
    writeMetadataLine(doc, "Status", job.status);
    if (job.generated_at) {
      writeMetadataLine(doc, "Generated", new Date(job.generated_at).toLocaleString("en-AU"));
    }
    if (job.embedded_at) {
      writeMetadataLine(doc, "Embedded", new Date(job.embedded_at).toLocaleString("en-AU"));
    }

    doc.moveDown(0.45);
    doc
      .strokeColor("#cbd5e1")
      .moveTo(doc.page.margins.left, doc.y)
      .lineTo(doc.page.width - doc.page.margins.right, doc.y)
      .stroke();
    doc.moveDown(0.45);

    writeFullDocBody(doc, job.full_doc);

    if (includeChunkBoundaries) {
      writeChunkBoundaries(doc, chunks);
    }

    doc.moveDown(0.75);
    doc
      .font("Helvetica")
      .fontSize(8)
      .fillColor("#94a3b8")
      .text("LittleCode curriculum reference — exported for verification.", { align: "center" });

    doc.end();
  });
}

function loadJobsFromDb() {
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

  return jobs.map((job) => ({
    job,
    chunks: chunksByFocus.get(job.focus_label) || [],
  }));
}

function walkMarkdownExport(rootDir) {
  const results = [];

  function walk(currentDir) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    const metadataPath = path.join(currentDir, "metadata.json");
    const fullDocPath = path.join(currentDir, "full-doc.md");

    if (fs.existsSync(metadataPath) && fs.existsSync(fullDocPath)) {
      const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf8"));
      const fullDoc = fs.readFileSync(fullDocPath, "utf8");
      const chunksDir = path.join(currentDir, "chunks");
      const chunks = [];

      if (fs.existsSync(chunksDir)) {
        for (const fileName of fs.readdirSync(chunksDir).sort()) {
          const match = fileName.match(/^chunk-(\d+)\.md$/);
          if (!match) {
            continue;
          }
          chunks.push({
            chunk_index: Number(match[1]),
            content: fs.readFileSync(path.join(chunksDir, fileName), "utf8"),
          });
        }
      }

      results.push({
        job: {
          focus_label: metadata.focus_label,
          year_level: metadata.year_level,
          subject: metadata.subject,
          topic_key: metadata.topic_key,
          subtopic: metadata.subtopic,
          acara_codes: metadata.acara_codes,
          status: metadata.status,
          full_doc: fullDoc,
          generated_at: metadata.generated_at,
          embedded_at: metadata.embedded_at,
        },
        chunks,
        exportPath: metadata.export_path,
      });
      return;
    }

    for (const entry of entries) {
      if (entry.isDirectory()) {
        walk(path.join(currentDir, entry.name));
      }
    }
  }

  walk(rootDir);
  return results.sort((a, b) => {
    const left = `${a.job.year_level}/${a.job.subject}/${a.job.subtopic}`;
    const right = `${b.job.year_level}/${b.job.subject}/${b.job.subtopic}`;
    return left.localeCompare(right);
  });
}

function resolveOutputPaths(job, options, usedSubtopicDirs) {
  const yearDir = sanitizePathSegment(job.year_level, { fallback: "unknown-year" });
  const subjectDir = sanitizePathSegment(job.subject, { fallback: "unknown-subject" });
  const baseSubtopic = sanitizePathSegment(job.subtopic, { fallback: "unknown-subtopic" });

  const dirKey = `${yearDir}/${subjectDir}/${baseSubtopic.toLowerCase()}`;
  const seen = usedSubtopicDirs.get(dirKey) || 0;
  usedSubtopicDirs.set(dirKey, seen + 1);
  const subtopicDir = seen === 0 ? baseSubtopic : `${baseSubtopic} (${seen + 1})`;

  const outDir = path.join(options.out, yearDir, subjectDir, subtopicDir);
  const pdfPath = path.join(outDir, sanitizePdfFileName(subtopicDir));

  return { outDir, pdfPath, relativeDir: path.relative(options.out, outDir) };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.fromExport && !fs.existsSync(options.markdownRoot)) {
    console.error(`Markdown export not found at ${options.markdownRoot}`);
    console.error("Run: node scripts/export-curriculum-docs.mjs");
    process.exit(1);
  }

  const records = options.fromExport ? walkMarkdownExport(options.markdownRoot) : loadJobsFromDb();

  if (!records.length) {
    console.error("No curriculum docs found to export.");
    process.exit(1);
  }

  ensureDir(options.out);

  const usedSubtopicDirs = new Map();
  const exported = [];
  let failures = 0;

  for (const record of records) {
    const { job, chunks } = record;
    const { outDir, pdfPath, relativeDir } = resolveOutputPaths(job, options, usedSubtopicDirs);

    try {
      ensureDir(outDir);
      const pdfBuffer = await renderCurriculumPdf({
        job,
        chunks,
        includeChunkBoundaries: options.chunkBoundaries,
      });

      if (!pdfBuffer?.length || pdfBuffer.subarray(0, 4).toString("utf8") !== "%PDF") {
        throw new Error("Generated output is not a valid PDF");
      }

      fs.writeFileSync(pdfPath, pdfBuffer);
      exported.push({
        relativeDir,
        pdfFile: path.basename(pdfPath),
        bytes: pdfBuffer.length,
        chunkCount: chunks.length,
      });
    } catch (error) {
      failures += 1;
      console.error(`Failed ${relativeDir}: ${error.message}`);
    }
  }

  console.log(`Exported ${exported.length} PDF(s) to ${options.out}`);
  if (failures) {
    console.log(`Failures: ${failures}`);
  }
  console.log(`Total size: ${(exported.reduce((sum, row) => sum + row.bytes, 0) / (1024 * 1024)).toFixed(2)} MB`);

  const sample = exported.slice(0, 8);
  if (sample.length) {
    console.log("\nSample PDFs:");
    for (const row of sample) {
      console.log(`  ${row.relativeDir}\\${row.pdfFile} (${row.bytes} bytes, ${row.chunkCount} chunks)`);
    }
  }

  if (failures) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
