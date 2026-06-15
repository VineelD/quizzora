const DEFAULT_LOCAL_BASE = "http://127.0.0.1:11434";
const DEFAULT_CLOUD_BASE = "https://ollama.com";
const DEFAULT_LOCAL_CHAT_ENDPOINT = `${DEFAULT_LOCAL_BASE}/v1/chat/completions`;
const DEFAULT_CLOUD_CHAT_ENDPOINT = `${DEFAULT_CLOUD_BASE}/v1/chat/completions`;
const DEFAULT_CLOUD_MODEL = "qwen3-next:80b";

export function resolveOllamaApiKey() {
  return String(process.env.OLLAMA_API_KEY || "").trim();
}

export function isTruthyEnv(name) {
  const raw = String(process.env[name] || "").trim().toLowerCase();
  return raw === "true" || raw === "1" || raw === "yes";
}

export function isStudyCoachOllamaCloudEnabled() {
  if (!resolveOllamaApiKey()) {
    return false;
  }
  return isTruthyEnv("STUDY_COACH_USE_OLLAMA_CLOUD") || isTruthyEnv("OLLAMA_CLOUD_ENABLED");
}

export function resolveOllamaCloudBaseUrl() {
  return String(process.env.OLLAMA_CLOUD_BASE_URL || DEFAULT_CLOUD_BASE).trim().replace(/\/+$/, "");
}

export function resolveOllamaLocalBaseUrl() {
  const endpoint = String(process.env.STUDY_COACH_OLLAMA_ENDPOINT || DEFAULT_LOCAL_CHAT_ENDPOINT).trim();
  return endpoint.replace(/\/v1\/chat\/completions\/?$/i, "") || DEFAULT_LOCAL_BASE;
}

export function resolveOllamaLocalChatEndpoint() {
  return `${resolveOllamaLocalBaseUrl()}/v1/chat/completions`;
}

export function resolveOllamaCloudChatEndpoint() {
  return `${resolveOllamaCloudBaseUrl()}/v1/chat/completions`;
}

export function resolveOllamaChatEndpoint({ useCloud = isStudyCoachOllamaCloudEnabled() } = {}) {
  if (useCloud && isStudyCoachOllamaCloudEnabled()) {
    return resolveOllamaCloudChatEndpoint();
  }
  return String(process.env.STUDY_COACH_OLLAMA_ENDPOINT || DEFAULT_LOCAL_CHAT_ENDPOINT).trim();
}

export function resolveOllamaEmbedBaseUrl() {
  const explicit = String(process.env.OLLAMA_EMBED_BASE_URL || "").trim();
  if (explicit) {
    return explicit.replace(/\/+$/, "");
  }
  return resolveOllamaLocalBaseUrl();
}

export function buildOllamaRequestHeaders({ useCloud = isStudyCoachOllamaCloudEnabled() } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (useCloud) {
    const apiKey = resolveOllamaApiKey();
    if (apiKey) {
      headers.Authorization = `Bearer ${apiKey}`;
    }
  }
  return headers;
}

export function resolveOllamaCloudModel() {
  return String(
    process.env.STUDY_COACH_OLLAMA_CLOUD_MODEL || process.env.OLLAMA_CLOUD_MODEL || DEFAULT_CLOUD_MODEL,
  ).trim();
}

export function resolveOllamaLocalModel() {
  return String(process.env.STUDY_COACH_OLLAMA_MODEL || "llama3.2:3b-gpu").trim();
}

export function resolveOllamaModel({ useCloud = isStudyCoachOllamaCloudEnabled() } = {}) {
  if (useCloud && isStudyCoachOllamaCloudEnabled()) {
    return resolveOllamaCloudModel();
  }
  return String(process.env.STUDY_COACH_OLLAMA_MODEL || "qwen2.5:14b").trim();
}
