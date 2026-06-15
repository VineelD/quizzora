/**
 * Upload LittleCode curriculum bundle to Onyx via the File connector API.
 *
 *   node scripts/upload-curriculum-file-connector.mjs --api-key <ADMIN_KEY>
 *   node scripts/upload-curriculum-file-connector.mjs --api-key <ADMIN_KEY> --prepare
 *   node scripts/upload-curriculum-file-connector.mjs --api-key <ADMIN_KEY> --dry-run
 *   node scripts/upload-curriculum-file-connector.mjs --api-key <ADMIN_KEY> --status
 *
 * Env fallbacks: ONYX_INGESTION_API_KEY, ONYX_API_KEY, ONYX_API_BASE_URL (default http://localhost:3001/api)
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
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
const DEFAULT_BUNDLE = path.join(__dirname, "..", "data", "curriculum-file-connector");
const DEFAULT_ZIP = path.join(DEFAULT_BUNDLE, "quizzora-curriculum.zip");
const DEFAULT_BASE_URL = "http://localhost:3001/api";
const DEFAULT_CONNECTOR_NAME = "Quizzora Curriculum Files";
const DEFAULT_DOCUMENT_SET_ID = 1;
const DEFAULT_REPLACE_INGESTION = true;
const DEFAULT_TIMEOUT_MS = 600_000;

function parseArgs(argv) {
  const options = {
    bundleDir: DEFAULT_BUNDLE,
    zipPath: DEFAULT_ZIP,
    baseUrl: process.env.ONYX_API_BASE_URL || DEFAULT_BASE_URL,
    apiKey: process.env.ONYX_INGESTION_API_KEY || process.env.ONYX_API_KEY || "",
    connectorName: DEFAULT_CONNECTOR_NAME,
    documentSetId: DEFAULT_DOCUMENT_SET_ID,
    replaceIngestion: DEFAULT_REPLACE_INGESTION,
    dryRun: false,
    prepare: false,
    statusOnly: false,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    replaceCcPairId: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--bundle-dir") {
      options.bundleDir = path.resolve(argv[index + 1] || DEFAULT_BUNDLE);
      options.zipPath = path.join(options.bundleDir, "quizzora-curriculum.zip");
      index += 1;
    } else if (arg === "--zip") {
      options.zipPath = path.resolve(argv[index + 1] || DEFAULT_ZIP);
      index += 1;
    } else if (arg === "--api-key") {
      options.apiKey = argv[index + 1] || "";
      index += 1;
    } else if (arg === "--base-url") {
      options.baseUrl = (argv[index + 1] || DEFAULT_BASE_URL).replace(/\/$/, "");
      index += 1;
    } else if (arg === "--connector-name") {
      options.connectorName = argv[index + 1] || DEFAULT_CONNECTOR_NAME;
      index += 1;
    } else if (arg === "--document-set-id") {
      options.documentSetId = Number(argv[index + 1]);
      index += 1;
    } else if (arg === "--keep-ingestion") {
      options.replaceIngestion = false;
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--prepare") {
      options.prepare = true;
    } else if (arg === "--status") {
      options.statusOnly = true;
    } else if (arg === "--timeout-ms") {
      options.timeoutMs = Number(argv[index + 1]);
      index += 1;
    } else if (arg === "--replace-cc-pair-id") {
      options.replaceCcPairId = Number(argv[index + 1]);
      index += 1;
    }
  }

  return options;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

async function onyxFetch(baseUrl, apiKey, route, { method = "GET", body, headers = {}, timeoutMs } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${baseUrl}${route}`, {
      method,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        ...headers,
      },
      body,
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

async function fetchConnectorDocs(options, ccPairId) {
  const result = await onyxFetch(options.baseUrl, options.apiKey, `/onyx-api/connector-docs/${ccPairId}`, {
    timeoutMs: 60_000,
  });
  if (!result.ok) {
    throw new Error(`Failed to fetch connector docs (${result.status}): ${JSON.stringify(result.data)}`);
  }
  return Array.isArray(result.data) ? result.data : [];
}

async function fetchDocumentSets(options) {
  const result = await onyxFetch(options.baseUrl, options.apiKey, "/manage/document-set", {
    timeoutMs: 30_000,
  });
  if (!result.ok) {
    throw new Error(`Failed to fetch document sets (${result.status}): ${JSON.stringify(result.data)}`);
  }
  return Array.isArray(result.data) ? result.data : [];
}

async function uploadZip(options) {
  const zipBytes = fs.readFileSync(options.zipPath);
  const form = new FormData();
  form.append("files", new Blob([zipBytes], { type: "application/zip" }), path.basename(options.zipPath));

  const result = await onyxFetch(options.baseUrl, options.apiKey, "/manage/admin/connector/file/upload", {
    method: "POST",
    body: form,
    timeoutMs: options.timeoutMs,
  });

  if (!result.ok) {
    throw new Error(`File upload failed (${result.status}): ${JSON.stringify(result.data)}`);
  }

  return result.data;
}

async function createFileConnector(options, uploadResponse, { connectorName = options.connectorName } = {}) {
  const payload = {
    name: connectorName,
    source: "file",
    input_type: "load_state",
    access_type: "public",
    connector_specific_config: {
      file_locations: uploadResponse.file_paths,
      file_names: uploadResponse.file_names,
      zip_metadata_file_id: uploadResponse.zip_metadata_file_id || null,
    },
    refresh_freq: null,
    prune_freq: 86400,
  };

  const result = await onyxFetch(options.baseUrl, options.apiKey, "/manage/admin/connector-with-mock-credential", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    timeoutMs: options.timeoutMs,
  });

  if (!result.ok) {
    throw new Error(`Connector creation failed (${result.status}): ${JSON.stringify(result.data)}`);
  }

  const ccPairId = Number(result.data?.data ?? result.data?.id ?? result.data);
  if (!Number.isFinite(ccPairId)) {
    throw new Error(`Unexpected connector creation response: ${JSON.stringify(result.data)}`);
  }

  return ccPairId;
}

async function createFileConnectorWithFallback(options, uploadResponse) {
  const duplicateDetail = (data) =>
    String(data?.detail || data?.message || JSON.stringify(data || "")).includes("duplicate naming");

  let connectorName = options.connectorName;
  let result = await onyxFetch(
    options.baseUrl,
    options.apiKey,
    "/manage/admin/connector-with-mock-credential",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: connectorName,
        source: "file",
        input_type: "load_state",
        access_type: "public",
        connector_specific_config: {
          file_locations: uploadResponse.file_paths,
          file_names: uploadResponse.file_names,
          zip_metadata_file_id: uploadResponse.zip_metadata_file_id || null,
        },
        refresh_freq: null,
        prune_freq: 86400,
      }),
      timeoutMs: options.timeoutMs,
    },
  );

  if (!result.ok && duplicateDetail(result.data)) {
    connectorName = `${options.connectorName} (enriched ${new Date().toISOString().slice(0, 10)})`;
    console.log(`  name "${options.connectorName}" taken — trying "${connectorName}"`);
    result = await onyxFetch(
      options.baseUrl,
      options.apiKey,
      "/manage/admin/connector-with-mock-credential",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: connectorName,
          source: "file",
          input_type: "load_state",
          access_type: "public",
          connector_specific_config: {
            file_locations: uploadResponse.file_paths,
            file_names: uploadResponse.file_names,
            zip_metadata_file_id: uploadResponse.zip_metadata_file_id || null,
          },
          refresh_freq: null,
          prune_freq: 86400,
        }),
        timeoutMs: options.timeoutMs,
      },
    );
  }

  if (!result.ok) {
    throw new Error(`Connector creation failed (${result.status}): ${JSON.stringify(result.data)}`);
  }

  const ccPairId = Number(result.data?.data ?? result.data?.id ?? result.data);
  if (!Number.isFinite(ccPairId)) {
    throw new Error(`Unexpected connector creation response: ${JSON.stringify(result.data)}`);
  }

  return { ccPairId, connectorName };
}

async function updateDocumentSet(options, ccPairIds) {
  const sets = await fetchDocumentSets(options);
  const target = sets.find((row) => row.id === options.documentSetId);
  if (!target) {
    throw new Error(`Document set id=${options.documentSetId} not found`);
  }

  const payload = {
    id: target.id,
    name: target.name,
    description: target.description || "LittleCode curriculum docs",
    cc_pair_ids: ccPairIds,
    is_public: target.is_public ?? true,
    users: target.users || [],
    groups: target.groups || [],
    federated_connectors: [],
  };

  const result = await onyxFetch(options.baseUrl, options.apiKey, "/manage/admin/document-set", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    timeoutMs: options.timeoutMs,
  });

  if (!result.ok) {
    throw new Error(`Document set update failed (${result.status}): ${JSON.stringify(result.data)}`);
  }
}

function runPrepareScript() {
  const script = path.join(__dirname, "prepare-curriculum-file-connector.mjs");
  const result = spawnSync(process.execPath, [script], { stdio: "inherit" });
  if (result.status !== 0) {
    throw new Error("prepare-curriculum-file-connector.mjs failed");
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (!options.apiKey) {
    console.error("Missing API key. Pass --api-key or set ONYX_INGESTION_API_KEY / ONYX_API_KEY.");
    console.error("Create an Admin API key in Onyx: Admin Panel -> API Keys.");
    process.exit(1);
  }

  if (options.prepare) {
    runPrepareScript();
  }

  if (!fs.existsSync(options.zipPath)) {
    console.error(`Zip bundle not found: ${options.zipPath}`);
    console.error("Run: node scripts/prepare-curriculum-file-connector.mjs");
    process.exit(1);
  }

  const manifestPath = path.join(options.bundleDir, "manifest.json");
  const manifest = fs.existsSync(manifestPath) ? readJson(manifestPath) : null;
  const expectedFiles = manifest?.file_count || "unknown";

  if (options.statusOnly) {
    const sets = await fetchDocumentSets(options);
    const target = sets.find((row) => row.id === options.documentSetId);
    console.log(`Document set id=${options.documentSetId}: ${target?.name || "(not found)"}`);
    if (target?.cc_pair_summaries?.length) {
      for (const pair of target.cc_pair_summaries) {
        const docs = await fetchConnectorDocs(options, pair.id);
        console.log(`  cc_pair_id=${pair.id} name=${pair.name} source=${pair.source} docs=${docs.length}`);
      }
    }
    return;
  }

  console.log(`Bundle: ${options.zipPath}`);
  console.log(`Files in manifest: ${expectedFiles}`);
  console.log(`Onyx API: ${options.baseUrl}`);

  if (options.dryRun) {
    console.log("DRY-RUN: would upload zip, create File connector, and update document set.");
    return;
  }

  console.log("Uploading zip to Onyx file store...");
  const uploadResponse = await uploadZip(options);
  console.log(`  uploaded files: ${uploadResponse.file_names?.length || 0}`);
  if (uploadResponse.zip_metadata_file_id) {
    console.log(`  zip metadata id: ${uploadResponse.zip_metadata_file_id}`);
  }

  console.log(`Creating File connector "${options.connectorName}"...`);
  const { ccPairId, connectorName: createdName } = await createFileConnectorWithFallback(options, uploadResponse);
  console.log(`  new cc_pair_id: ${ccPairId}`);
  if (createdName !== options.connectorName) {
    console.log(`  connector name: ${createdName}`);
  }

  const sets = await fetchDocumentSets(options);
  const target = sets.find((row) => row.id === options.documentSetId);
  const existingCcPairIds = (target?.cc_pair_summaries || []).map((row) => row.id);
  let nextCcPairIds;
  if (options.replaceCcPairId && Number.isFinite(options.replaceCcPairId)) {
    nextCcPairIds = [
      ...existingCcPairIds.filter((id) => id !== options.replaceCcPairId),
      ccPairId,
    ];
  } else if (options.replaceIngestion) {
    nextCcPairIds = [ccPairId];
  } else {
    nextCcPairIds = [...new Set([...existingCcPairIds, ccPairId])];
  }

  console.log(`Updating document set id=${options.documentSetId} (${target?.name})...`);
  console.log(`  cc_pair_ids: ${nextCcPairIds.join(", ")}`);
  await updateDocumentSet(options, nextCcPairIds);

  const docs = await fetchConnectorDocs(options, ccPairId);
  console.log("");
  console.log("Upload summary:");
  console.log(`  connector name: ${createdName}`);
  console.log(`  cc_pair_id:     ${ccPairId}`);
  console.log(`  indexed docs:   ${docs.length}`);
  console.log(`  document set:   id=${options.documentSetId} (${target?.name})`);
  console.log("");
  console.log("Verify in Onyx UI:");
  console.log("  Admin -> Existing Connectors -> look for \"Quizzora Curriculum Files\"");
  console.log("  Admin -> Document Sets -> \"Quizzora Curriculum\" should list the new File connector");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
