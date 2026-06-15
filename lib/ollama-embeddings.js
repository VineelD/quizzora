import { resolveOllamaEmbedBaseUrl } from "./ollama-config.js";

const DEFAULT_EMBED_MODEL = "nomic-embed-text";
const DEFAULT_EMBED_TIMEOUT_MS = 60000;

export function resolveOllamaBaseUrl() {
  return resolveOllamaEmbedBaseUrl();
}

export function resolveOllamaEmbedModel() {
  return String(process.env.OLLAMA_EMBED_MODEL || DEFAULT_EMBED_MODEL).trim();
}

export function embeddingToBlob(embedding) {
  const values = Array.isArray(embedding) ? embedding : [];
  const floats = new Float32Array(values.map((value) => Number(value) || 0));
  return Buffer.from(floats.buffer, floats.byteOffset, floats.byteLength);
}

export function blobToEmbedding(blob) {
  if (!blob) {
    return null;
  }
  const buffer = Buffer.isBuffer(blob) ? blob : Buffer.from(blob);
  const byteLength = buffer.length;
  if (byteLength <= 0 || byteLength % 4 !== 0) {
    return null;
  }
  const copy = buffer.byteOffset % 4 === 0 ? buffer : Buffer.from(buffer);
  const floats = new Float32Array(copy.buffer, copy.byteOffset, byteLength / 4);
  return Array.from(floats);
}

export function cosineSimilarity(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length === 0 || left.length !== right.length) {
    return -1;
  }

  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < left.length; index += 1) {
    const a = Number(left[index]) || 0;
    const b = Number(right[index]) || 0;
    dot += a * b;
    leftNorm += a * a;
    rightNorm += b * b;
  }

  if (leftNorm === 0 || rightNorm === 0) {
    return -1;
  }

  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
}

export function resolveOllamaEmbedConcurrency() {
  const value = Number(process.env.OLLAMA_EMBED_CONCURRENCY || 4);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 4;
}

export async function embedTexts(texts, { fetchImpl = fetch, model = resolveOllamaEmbedModel() } = {}) {
  const inputs = texts.map((text) => String(text || "").trim()).filter(Boolean);
  if (!inputs.length) {
    return [];
  }

  const concurrency = resolveOllamaEmbedConcurrency();
  const results = new Array(inputs.length);
  let index = 0;

  async function runNext() {
    while (index < inputs.length) {
      const current = index;
      index += 1;
      results[current] = await embedText(inputs[current], { fetchImpl, model });
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, inputs.length) }, () => runNext()),
  );
  return results;
}

export async function checkOllamaEmbeddingsAvailable({ fetchImpl = fetch } = {}) {
  const baseUrl = resolveOllamaBaseUrl();
  const model = resolveOllamaEmbedModel();
  try {
    const response = await fetchImpl(`${baseUrl}/api/tags`, { method: "GET" });
    if (!response.ok) {
      return { ok: false, error: `Ollama tags request failed (${response.status}).` };
    }
    const payload = await response.json();
    const models = (payload?.models || []).map((entry) => String(entry?.name || ""));
    const hasModel = models.some((name) => name === model || name.startsWith(`${model}:`));
    return {
      ok: hasModel,
      model,
      models,
      error: hasModel ? null : `Embedding model "${model}" is not installed. Run: ollama pull ${model}`,
    };
  } catch (error) {
    return {
      ok: false,
      error: error?.message || "Ollama is not reachable.",
    };
  }
}

export async function embedText(text, { fetchImpl = fetch, model = resolveOllamaEmbedModel() } = {}) {
  const prompt = String(text || "").trim();
  if (!prompt) {
    throw new Error("Cannot embed empty text.");
  }

  const baseUrl = resolveOllamaBaseUrl();
  const timeoutMs = Number(process.env.OLLAMA_EMBED_TIMEOUT_MS || DEFAULT_EMBED_TIMEOUT_MS);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(`${baseUrl}/api/embeddings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, prompt }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Ollama embeddings failed (${response.status}): ${errorText.slice(0, 200)}`);
    }

    const payload = await response.json();
    const embedding = payload?.embedding;
    if (!Array.isArray(embedding) || embedding.length === 0) {
      throw new Error("Ollama returned an empty embedding.");
    }

    return embedding;
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error("Ollama embedding request timed out.");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
