import { createWriteStream } from "node:fs";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";

function apiKey() {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) {
    throw new Error("OPENAI_API_KEY is missing.");
  }
  return key;
}

function apiBase() {
  return String(process.env.OPENAI_API_BASE || "https://api.openai.com/v1").replace(/\/$/, "");
}

async function openAiFetch(path, init = {}) {
  const response = await fetch(`${apiBase()}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      ...(init.headers || {}),
    },
  });

  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text };
  }

  if (!response.ok) {
    const message = body?.error?.message || body?.message || text || response.statusText;
    throw new Error(`OpenAI batch API ${response.status}: ${message}`);
  }

  return body;
}

/**
 * @param {string} jsonlContent
 */
export async function uploadBatchInputFile(jsonlContent) {
  const form = new FormData();
  form.append("purpose", "batch");
  form.append(
    "file",
    new Blob([jsonlContent], { type: "application/jsonl" }),
    `question-bank-${Date.now()}.jsonl`,
  );

  return openAiFetch("/files", {
    method: "POST",
    body: form,
  });
}

/**
 * @param {string} inputFileId
 */
export async function createResponsesBatch(inputFileId) {
  return openAiFetch("/batches", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      input_file_id: inputFileId,
      endpoint: "/v1/responses",
      completion_window: "24h",
      metadata: {
        purpose: "quizzora_question_bank",
      },
    }),
  });
}

/** @param {string} batchId */
export async function retrieveBatch(batchId) {
  return openAiFetch(`/batches/${encodeURIComponent(batchId)}`, { method: "GET" });
}

/**
 * @param {{ limit?: number, after?: string }} [options]
 */
export async function listBatches(options = {}) {
  const limit = Math.min(Math.max(Number(options.limit) || 20, 1), 100);
  const params = new URLSearchParams({ limit: String(limit) });
  if (options.after) {
    params.set("after", options.after);
  }
  return openAiFetch(`/batches?${params.toString()}`, { method: "GET" });
}

const IN_PROGRESS_BATCH_STATUSES = new Set(["validating", "in_progress", "finalizing"]);

/**
 * Summarize org-wide OpenAI batch activity for quota headroom checks.
 * Token-budget decisions are made in question-bank.js via evaluateBatchSubmitCapacity().
 */
export async function getOpenAiBatchQuotaSummary() {
  const body = await listBatches({ limit: 100 });
  const batches = Array.isArray(body?.data) ? body.data : [];
  const inProgress = batches.filter((batch) => IN_PROGRESS_BATCH_STATUSES.has(String(batch.status || "")));
  const quizzoraInProgress = inProgress.filter(
    (batch) => batch?.metadata?.purpose === "quizzora_question_bank",
  );

  return {
    listed: batches.length,
    inProgressCount: inProgress.length,
    quizzoraInProgressCount: quizzoraInProgress.length,
    inProgress,
    inProgressBatchIds: inProgress.map((batch) => batch.id),
  };
}

/** @param {string} batchId */
export async function cancelBatch(batchId) {
  return openAiFetch(`/batches/${encodeURIComponent(batchId)}/cancel`, { method: "POST" });
}

/** @param {string} fileId */
export async function downloadBatchFile(fileId) {
  const response = await fetch(`${apiBase()}/files/${encodeURIComponent(fileId)}/content`, {
    headers: { Authorization: `Bearer ${apiKey()}` },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenAI file download ${response.status}: ${text}`);
  }

  return response.text();
}

/**
 * Stream large file downloads to disk to avoid memory spikes.
 * @param {string} fileId
 * @param {string} destinationPath
 */
export async function downloadBatchFileToPath(fileId, destinationPath) {
  await mkdir(join(destinationPath, ".."), { recursive: true }).catch(() => {});

  const response = await fetch(`${apiBase()}/files/${encodeURIComponent(fileId)}/content`, {
    headers: { Authorization: `Bearer ${apiKey()}` },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenAI file download ${response.status}: ${text}`);
  }

  if (!response.body) {
    const text = await response.text();
    await writeFile(destinationPath, text, "utf8");
    return destinationPath;
  }

  await pipeline(Readable.fromWeb(response.body), createWriteStream(destinationPath));
  return destinationPath;
}

/**
 * @param {string} filePath
 * @returns {Promise<Array<Record<string, unknown>>>}
 */
export async function readJsonlFile(filePath) {
  const raw = await readFile(filePath, "utf8");
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

export async function removeTempFile(filePath) {
  if (!filePath) {
    return;
  }
  await unlink(filePath).catch(() => {});
}

export function tempBatchPath(prefix) {
  return join(tmpdir(), `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}.jsonl`);
}
