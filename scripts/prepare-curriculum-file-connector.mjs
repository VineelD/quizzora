/**
 * Convert LittleCode curriculum exports into an Onyx File connector bundle.
 *
 *   node scripts/prepare-curriculum-file-connector.mjs
 *   node scripts/prepare-curriculum-file-connector.mjs --export-dir C:\LittleCode\data\curriculum-docs-export
 *   node scripts/prepare-curriculum-file-connector.mjs --out-dir C:\LittleCode\data\curriculum-file-connector
 *
 * Output:
 *   <out-dir>/files/*.md          — one markdown file per subtopic with #ONYX_METADATA front line
 *   <out-dir>/.onyx_metadata.json — zip-sidecar metadata (filename-keyed)
 *   <out-dir>/quizzora-curriculum.zip
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_EXPORT = path.join(__dirname, "..", "data", "curriculum-docs-export");
const DEFAULT_OUT = path.join(__dirname, "..", "data", "curriculum-file-connector");
const ZIP_NAME = "quizzora-curriculum.zip";

function parseArgs(argv) {
  const options = {
    exportDir: DEFAULT_EXPORT,
    outDir: DEFAULT_OUT,
    skipZip: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--export-dir") {
      options.exportDir = path.resolve(argv[index + 1] || DEFAULT_EXPORT);
      index += 1;
    } else if (arg === "--out-dir") {
      options.outDir = path.resolve(argv[index + 1] || DEFAULT_OUT);
      index += 1;
    } else if (arg === "--skip-zip") {
      options.skipZip = true;
    }
  }

  return options;
}

import { slugifyOnyxPathSegment } from "../lib/curriculum-onyx-filename.js";

function buildFileSlug(exportRoot, subtopicDir) {
  const relative = path.relative(exportRoot, subtopicDir);
  const parts = relative.split(path.sep).map(slugifyOnyxPathSegment).filter(Boolean);
  return parts.join("-");
}

function buildSemanticIdentifier(meta) {
  return `${meta.year_level} ${meta.subject}: ${meta.subtopic}`;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function discoverSubtopics(exportDir) {
  const results = [];

  function walk(currentDir) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    const hasFullDoc = entries.some((entry) => entry.isFile() && entry.name === "full-doc.md");
    if (hasFullDoc) {
      results.push(currentDir);
      return;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        walk(path.join(currentDir, entry.name));
      }
    }
  }

  walk(exportDir);
  results.sort((a, b) => a.localeCompare(b, "en"));
  return results;
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeText(filePath, content) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content, "utf8");
}

function buildOnyxMetadata(meta, semanticId, docUpdatedAt) {
  const acaraCodes = Array.isArray(meta.acara_codes)
    ? meta.acara_codes.join(", ")
    : String(meta.acara_codes || "");

  return {
    file_display_name: semanticId,
    doc_updated_at: docUpdatedAt,
    year_level: meta.year_level,
    year_band: "7-12",
    subject: meta.subject,
    subtopic: meta.subtopic,
    topic_key: meta.topic_key,
    focus_label: meta.focus_label,
    acara_codes: acaraCodes,
    source: "quizzora-curriculum",
    content_type: "learning_material",
    depth: meta.depth || "enriched",
  };
}

function buildMarkdownFile(content, metadata) {
  const metadataLine = `#ONYX_METADATA=${JSON.stringify(metadata)}`;
  return `${metadataLine}\n${content.trim()}\n`;
}

function createZipWindows(sourceDir, zipPath) {
  if (fs.existsSync(zipPath)) {
    fs.unlinkSync(zipPath);
  }

  const zipInputs = [
    path.join(sourceDir, "files"),
    path.join(sourceDir, ".onyx_metadata.json"),
  ]
    .map((entry) => `'${entry.replace(/'/g, "''")}'`)
    .join(",");

  const command = [
    "Compress-Archive",
    "-Path",
    zipInputs,
    "-DestinationPath",
    `'${zipPath.replace(/'/g, "''")}'`,
    "-Force",
  ].join(" ");

  const result = spawnSync(
    "powershell",
    ["-NoProfile", "-Command", command],
    { encoding: "utf8" },
  );

  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "Compress-Archive failed");
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2));

  if (!fs.existsSync(options.exportDir)) {
    console.error(`Export directory not found: ${options.exportDir}`);
    process.exit(1);
  }

  const subtopics = discoverSubtopics(options.exportDir);
  if (subtopics.length === 0) {
    console.error(`No subtopics with full-doc.md found under ${options.exportDir}`);
    process.exit(1);
  }

  const filesDir = path.join(options.outDir, "files");
  const usedSlugs = new Map();
  const zipMetadata = [];
  const prepared = [];

  for (const subtopicDir of subtopics) {
    const meta = readJson(path.join(subtopicDir, "metadata.json"));
    const content = fs.readFileSync(path.join(subtopicDir, "full-doc.md"), "utf8").trim();
    if (!content) {
      console.warn(`Skipping empty full-doc.md: ${subtopicDir}`);
      continue;
    }

    const baseSlug = buildFileSlug(options.exportDir, subtopicDir);
    const seen = usedSlugs.get(baseSlug) || 0;
    usedSlugs.set(baseSlug, seen + 1);
    const slug = seen === 0 ? baseSlug : `${baseSlug}-${seen + 1}`;
    const filename = `${slug}.md`;

    const semanticId = buildSemanticIdentifier(meta);
    const docUpdatedAt = meta.embedded_at || meta.generated_at || new Date().toISOString();
    const onyxMetadata = buildOnyxMetadata(meta, semanticId, docUpdatedAt);

    writeText(path.join(filesDir, filename), buildMarkdownFile(content, onyxMetadata));

    zipMetadata.push({
      filename,
      ...onyxMetadata,
    });

    prepared.push({
      filename,
      semanticId,
      exportPath: path.relative(options.exportDir, subtopicDir),
    });
  }

  writeText(path.join(options.outDir, ".onyx_metadata.json"), `${JSON.stringify(zipMetadata, null, 2)}\n`);

  const manifest = {
    prepared_at: new Date().toISOString(),
    export_dir: options.exportDir,
    out_dir: options.outDir,
    file_count: prepared.length,
    zip_name: ZIP_NAME,
    files: prepared,
  };
  writeText(path.join(options.outDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

  let zipPath = null;
  if (!options.skipZip) {
    zipPath = path.join(options.outDir, ZIP_NAME);
    createZipWindows(options.outDir, zipPath);
  }

  console.log(`Prepared ${prepared.length} markdown files for Onyx File connector`);
  console.log(`  export:   ${options.exportDir}`);
  console.log(`  out dir:  ${options.outDir}`);
  console.log(`  metadata: ${path.join(options.outDir, ".onyx_metadata.json")}`);
  if (zipPath) {
    const zipSize = fs.statSync(zipPath).size;
    console.log(`  zip:      ${zipPath} (${(zipSize / 1024 / 1024).toFixed(2)} MB)`);
  }

  const sample = prepared.slice(0, 5).map((row) => row.filename);
  if (sample.length > 0) {
    console.log("Sample files:");
    for (const name of sample) {
      console.log(`  - ${name}`);
    }
  }
}

main();
