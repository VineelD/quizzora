/**
 * Upload LittleCode curriculum exports to Onyx via the Ingestion API.
 *
 *   node scripts/upload-curriculum-to-onyx.mjs --api-key <ADMIN_KEY>
 *   node scripts/upload-curriculum-to-onyx.mjs --api-key <ADMIN_KEY> --dry-run
 *   node scripts/upload-curriculum-to-onyx.mjs --api-key <ADMIN_KEY> --limit 5
 *
 * Env fallbacks: ONYX_INGESTION_API_KEY, ONYX_API_KEY, ONYX_API_BASE_URL (default http://localhost:3001/api)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, "..");

function loadEnvFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, "utf8");
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }
      const separator = trimmed.indexOf("=");
      if (separator < 1) {
        continue;
      }
      const name = trimmed.slice(0, separator).trim();
      let value = trimmed.slice(separator + 1).trim();
      if (value.startsWith('"') && value.endsWith('"')) {
        value = value.slice(1, -1);
      }
      if (!process.env[name]) {
        process.env[name] = value;
      }
    }
  } catch {
    // optional file
  }
}

loadEnvFile(path.join(projectRoot, ".env.local"));
loadEnvFile(path.join(projectRoot, ".env"));
const DEFAULT_EXPORT = path.join(__dirname, "..", "data", "curriculum-docs-export");
const DEFAULT_BASE_URL = "http://localhost:3001/api";
const DEFAULT_CC_PAIR_ID = 1;
const DEFAULT_DELAY_MS = 250;
const DEFAULT_TIMEOUT_MS = 300_000;

function parseArgs(argv) {
  const options = {
    exportDir: DEFAULT_EXPORT,
    baseUrl: process.env.ONYX_API_BASE_URL || DEFAULT_BASE_URL,
    apiKey: process.env.ONYX_INGESTION_API_KEY || process.env.ONYX_API_KEY || "",
    ccPairId: DEFAULT_CC_PAIR_ID,
    dryRun: false,
    limit: null,
    delayMs: DEFAULT_DELAY_MS,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    resumeFrom: null,
    statusOnly: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--export-dir") {
      options.exportDir = path.resolve(argv[index + 1] || DEFAULT_EXPORT);
      index += 1;
    } else if (arg === "--api-key") {
      options.apiKey = argv[index + 1] || "";
      index += 1;
    } else if (arg === "--base-url") {
      options.baseUrl = (argv[index + 1] || DEFAULT_BASE_URL).replace(/\/$/, "");
      index += 1;
    } else if (arg === "--cc-pair-id") {
      options.ccPairId = Number(argv[index + 1]);
      index += 1;
    } else if (arg === "--delay-ms") {
      options.delayMs = Number(argv[index + 1]);
      index += 1;
    } else if (arg === "--timeout-ms") {
      options.timeoutMs = Number(argv[index + 1]);
      index += 1;
    } else if (arg === "--limit") {
      options.limit = Number(argv[index + 1]);
      index += 1;
    } else if (arg === "--resume-from") {
      options.resumeFrom = argv[index + 1] || null;
      index += 1;
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--status") {
      options.statusOnly = true;
    }
  }

  return options;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function slugifySegment(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function buildDocumentId(exportRoot, subtopicDir) {
  const relative = path.relative(exportRoot, subtopicDir);
  const parts = relative.split(path.sep).map(slugifySegment).filter(Boolean);
  return `curriculum/${parts.join("/")}`;
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

function buildPayload(exportRoot, subtopicDir, ccPairId) {
  const meta = readJson(path.join(subtopicDir, "metadata.json"));
  const content = fs.readFileSync(path.join(subtopicDir, "full-doc.md"), "utf8").trim();
  if (!content) {
    throw new Error("full-doc.md is empty");
  }

  const docUpdatedAt = meta.embedded_at || meta.generated_at || new Date().toISOString();
  const acaraCodes = Array.isArray(meta.acara_codes)
    ? meta.acara_codes.join(", ")
    : String(meta.acara_codes || "");

  return {
    document: {
      id: buildDocumentId(exportRoot, subtopicDir),
      semantic_identifier: buildSemanticIdentifier(meta),
      title: meta.focus_label,
      sections: [{ text: content }],
      source: "ingestion_api",
      metadata: {
        year_level: meta.year_level,
        subject: meta.subject,
        subtopic: meta.subtopic,
        topic_key: meta.topic_key,
        focus_label: meta.focus_label,
        acara_codes: acaraCodes,
        export_path: meta.export_path,
      },
      from_ingestion_api: true,
      doc_updated_at: docUpdatedAt,
    },
    cc_pair_id: ccPairId,
  };
}

async function onyxFetch(baseUrl, apiKey, route, { method = "GET", body, timeoutMs } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${baseUrl}${route}`, {
      method,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    const text = await response.text();
    let parsed = null;
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = text;
      }
    }

    return { ok: response.ok, status: response.status, data: parsed };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchConnectorDocs(options) {
  const route = `/onyx-api/connector-docs/${options.ccPairId}`;
  const result = await onyxFetch(options.baseUrl, options.apiKey, route, {
    timeoutMs: 30_000,
  });
  if (!result.ok) {
    throw new Error(`Failed to fetch connector docs (${result.status}): ${JSON.stringify(result.data)}`);
  }
  return Array.isArray(result.data) ? result.data : [];
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (!options.apiKey) {
    console.error("Missing API key. Pass --api-key or set ONYX_INGESTION_API_KEY / ONYX_API_KEY.");
    console.error("Create an Admin API key in Onyx: Admin Panel -> API Keys.");
    process.exit(1);
  }

  if (!fs.existsSync(options.exportDir)) {
    console.error(`Export directory not found: ${options.exportDir}`);
    process.exit(1);
  }

  if (options.statusOnly) {
    const docs = await fetchConnectorDocs(options);
    console.log(`Connector cc_pair_id=${options.ccPairId}: ${docs.length} documents indexed`);
    for (const doc of docs.slice(0, 10)) {
      console.log(`  - ${doc.semantic_id} (${doc.document_id})`);
    }
    if (docs.length > 10) {
      console.log(`  ... and ${docs.length - 10} more`);
    }
    return;
  }

  const subtopics = discoverSubtopics(options.exportDir);
  let selected = subtopics;
  if (options.resumeFrom) {
    const resumeIndex = subtopics.findIndex((dir) => dir.includes(options.resumeFrom));
    if (resumeIndex < 0) {
      console.error(`Could not find resume marker: ${options.resumeFrom}`);
      process.exit(1);
    }
    selected = subtopics.slice(resumeIndex);
  }
  if (Number.isFinite(options.limit) && options.limit > 0) {
    selected = selected.slice(0, options.limit);
  }

  console.log(`Found ${subtopics.length} subtopics under ${options.exportDir}`);
  console.log(`Uploading ${selected.length} documents to ${options.baseUrl} (cc_pair_id=${options.ccPairId})`);

  const summary = {
    attempted: 0,
    succeeded: 0,
    failed: 0,
    skipped: 0,
    failures: [],
  };

  for (const [index, subtopicDir] of selected.entries()) {
    const label = path.relative(options.exportDir, subtopicDir);
    summary.attempted += 1;

    let payload;
    try {
      payload = buildPayload(options.exportDir, subtopicDir, options.ccPairId);
    } catch (error) {
      summary.failed += 1;
      summary.failures.push({ label, error: error.message });
      console.error(`[${index + 1}/${selected.length}] SKIP ${label}: ${error.message}`);
      continue;
    }

    if (options.dryRun) {
      summary.skipped += 1;
      console.log(`[${index + 1}/${selected.length}] DRY-RUN ${payload.document.semantic_identifier}`);
      continue;
    }

    process.stdout.write(`[${index + 1}/${selected.length}] ${payload.document.semantic_identifier} ... `);
    try {
      const result = await onyxFetch(options.baseUrl, options.apiKey, "/onyx-api/ingestion", {
        method: "POST",
        body: payload,
        timeoutMs: options.timeoutMs,
      });
      if (!result.ok) {
        throw new Error(`${result.status} ${JSON.stringify(result.data)}`);
      }
      summary.succeeded += 1;
      const existed = result.data?.already_existed ? " (updated)" : "";
      console.log(`ok${existed}`);
    } catch (error) {
      summary.failed += 1;
      summary.failures.push({ label, error: error.message });
      console.log(`FAILED`);
      console.error(`  ${error.message}`);
    }

    if (options.delayMs > 0 && index < selected.length - 1) {
      await sleep(options.delayMs);
    }
  }

  console.log("");
  console.log("Upload summary:");
  console.log(`  attempted: ${summary.attempted}`);
  console.log(`  succeeded: ${summary.succeeded}`);
  console.log(`  failed:    ${summary.failed}`);
  if (options.dryRun) {
    console.log(`  dry-run:   ${summary.skipped}`);
  }

  if (!options.dryRun) {
    try {
      const docs = await fetchConnectorDocs(options);
      console.log(`  indexed in Onyx (cc_pair_id=${options.ccPairId}): ${docs.length}`);
    } catch (error) {
      console.warn(`  could not verify connector docs: ${error.message}`);
    }
  }

  if (summary.failures.length > 0) {
    console.log("Failures:");
    for (const failure of summary.failures.slice(0, 20)) {
      console.log(`  - ${failure.label}: ${failure.error}`);
    }
    if (summary.failures.length > 20) {
      console.log(`  ... and ${summary.failures.length - 20} more`);
    }
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
