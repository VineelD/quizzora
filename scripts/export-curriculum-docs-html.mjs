/**
 * Export curriculum learning guides as self-contained HTML with KaTeX-rendered math.
 *
 *   node scripts/export-curriculum-docs-html.mjs
 *   node scripts/export-curriculum-docs-html.mjs --out C:\LittleCode\data\curriculum-docs-export
 *   node scripts/export-curriculum-docs-html.mjs --from-export
 *   node scripts/export-curriculum-docs-html.mjs --focus "Trigonometry and measurement — Sine and cosine rules"
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { renderCurriculumDocHtml } from "../lib/curriculum-doc-html.js";
import { getDb } from "../lib/db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_OUT = path.join(__dirname, "..", "data", "curriculum-docs-export");
const DEFAULT_MARKDOWN_EXPORT = DEFAULT_OUT;

const INVALID_WIN_CHARS = /[<>:"/\\|?*\u0000-\u001f]/g;
const TRAILING_DOTS = /\.+$/;

function parseArgs(argv) {
  const options = {
    out: DEFAULT_OUT,
    fromExport: false,
    markdownRoot: DEFAULT_MARKDOWN_EXPORT,
    focusLabels: [],
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
    } else if (arg === "--focus") {
      options.focusLabels.push(String(argv[index + 1] || "").trim());
      index += 1;
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

function loadJobsFromDb(focusLabels = []) {
  getDb();
  const db = getDb();
  const focusFilter = focusLabels.filter(Boolean);

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
        generated_at
      FROM curriculum_doc_jobs
      WHERE full_doc IS NOT NULL AND TRIM(full_doc) != ''
      ORDER BY year_level, subject, subtopic
      `,
    )
    .all()
    .filter((job) => !focusFilter.length || focusFilter.includes(job.focus_label));

  return jobs;
}

function walkMarkdownExport(rootDir, focusLabels = []) {
  const results = [];
  const focusFilter = focusLabels.filter(Boolean);

  function walk(currentDir) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    const metadataPath = path.join(currentDir, "metadata.json");
    const fullDocPath = path.join(currentDir, "full-doc.md");

    if (fs.existsSync(metadataPath) && fs.existsSync(fullDocPath)) {
      const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf8"));
      if (focusFilter.length && !focusFilter.includes(metadata.focus_label)) {
        return;
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
          full_doc: fs.readFileSync(fullDocPath, "utf8"),
          generated_at: metadata.generated_at,
        },
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

function resolveOutputDir(job, options, usedSubtopicDirs) {
  const yearDir = sanitizePathSegment(job.year_level, { fallback: "unknown-year" });
  const subjectDir = sanitizePathSegment(job.subject, { fallback: "unknown-subject" });
  const baseSubtopic = sanitizePathSegment(job.subtopic, { fallback: "unknown-subtopic" });

  const dirKey = `${yearDir}/${subjectDir}/${baseSubtopic.toLowerCase()}`;
  const seen = usedSubtopicDirs.get(dirKey) || 0;
  usedSubtopicDirs.set(dirKey, seen + 1);
  const subtopicDir = seen === 0 ? baseSubtopic : `${baseSubtopic} (${seen + 1})`;

  const outDir = path.join(options.out, yearDir, subjectDir, subtopicDir);
  return { outDir, relativeDir: path.relative(options.out, outDir) };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.fromExport && !fs.existsSync(options.markdownRoot)) {
    console.error(`Markdown export not found at ${options.markdownRoot}`);
    console.error("Run: node scripts/export-curriculum-docs.mjs");
    process.exit(1);
  }

  const records = options.fromExport
    ? walkMarkdownExport(options.markdownRoot, options.focusLabels)
    : loadJobsFromDb(options.focusLabels).map((job) => ({ job }));

  if (!records.length) {
    console.error("No curriculum docs found to export.");
    process.exit(1);
  }

  ensureDir(options.out);

  const usedSubtopicDirs = new Map();
  const exported = [];
  let failures = 0;

  for (const record of records) {
    const { job } = record;
    const { outDir, relativeDir } = resolveOutputDir(job, options, usedSubtopicDirs);

    try {
      ensureDir(outDir);
      const html = await renderCurriculumDocHtml({
        title: job.subtopic,
        yearLevel: job.year_level,
        subject: job.subject,
        topicKey: job.topic_key,
        subtopic: job.subtopic,
        acaraCodes: formatAcaraCodes(job.acara_codes),
        generatedAt: job.generated_at,
        markdown: job.full_doc,
      });

      const indexPath = path.join(outDir, "index.html");
      fs.writeFileSync(indexPath, html, "utf8");
      exported.push({
        relativeDir,
        htmlFile: "index.html",
        bytes: Buffer.byteLength(html, "utf8"),
        focusLabel: job.focus_label,
      });
    } catch (error) {
      failures += 1;
      console.error(`Failed ${relativeDir}: ${error.message}`);
    }
  }

  console.log(`Exported ${exported.length} HTML file(s) to ${options.out}`);
  if (failures) {
    console.log(`Failures: ${failures}`);
  }
  console.log(`Total size: ${(exported.reduce((sum, row) => sum + row.bytes, 0) / (1024 * 1024)).toFixed(2)} MB`);

  const sample = exported.slice(0, 8);
  if (sample.length) {
    console.log("\nSample HTML files:");
    for (const row of sample) {
      console.log(`  ${row.relativeDir}\\${row.htmlFile} (${row.bytes} bytes)`);
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
