export const TRANSIENT_OPENAI_STATUSES = new Set([429, 502, 503, 520]);

export const AI_SERVICE_UNAVAILABLE_MESSAGE =
  "AI service temporarily unavailable, please try again in a minute.";

const MAX_ERROR_MESSAGE_LENGTH = 200;

const CLOUDFLARE_ERROR_PATTERN =
  /cloudflare|error code\s*\d+|web server is returning an unknown error|ray id/i;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function stripHtml(text) {
  return String(text || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function truncateErrorMessage(message, maxLength = MAX_ERROR_MESSAGE_LENGTH) {
  const trimmed = String(message || "").trim();
  if (trimmed.length <= maxLength) {
    return trimmed;
  }
  return `${trimmed.slice(0, maxLength - 1)}…`;
}

export function isTransientOpenAiStatus(status) {
  return TRANSIENT_OPENAI_STATUSES.has(Number(status));
}

function extractErrorDetail(rawBody) {
  const stripped = stripHtml(rawBody);
  if (!stripped) {
    return "";
  }

  try {
    const parsed = JSON.parse(stripped);
    return String(parsed?.error?.message || parsed?.message || stripped).trim();
  } catch {
    return stripped;
  }
}

export function formatOpenAiError(status, rawBody, statusText = "") {
  if (isTransientOpenAiStatus(status)) {
    return AI_SERVICE_UNAVAILABLE_MESSAGE;
  }

  const detail = extractErrorDetail(rawBody) || String(statusText || "").trim();
  if (!detail || CLOUDFLARE_ERROR_PATTERN.test(detail)) {
    return Number(status) >= 500
      ? AI_SERVICE_UNAVAILABLE_MESSAGE
      : truncateErrorMessage(`AI request failed (${status}).`);
  }

  return truncateErrorMessage(detail);
}

export function resolveOpenAiRetryOptions() {
  const maxAttempts = Number(process.env.OPENAI_RETRY_MAX_ATTEMPTS || 3);
  const baseDelayMs = Number(process.env.OPENAI_RETRY_BASE_DELAY_MS || 1000);

  return {
    maxAttempts:
      Number.isFinite(maxAttempts) && maxAttempts >= 1 ? Math.min(Math.round(maxAttempts), 5) : 3,
    baseDelayMs: Number.isFinite(baseDelayMs) && baseDelayMs >= 0 ? baseDelayMs : 1000,
  };
}

export async function fetchOpenAiWithRetry(
  url,
  init,
  { maxAttempts = 3, baseDelayMs = 1000, fetchImpl = fetch } = {},
) {
  let lastFailure = null;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const response = await fetchImpl(url, init);

    if (response.ok) {
      return response;
    }

    const errorText = await response.text();
    lastFailure = {
      ok: false,
      status: response.status,
      errorText,
      statusText: response.statusText,
    };

    if (!isTransientOpenAiStatus(response.status) || attempt >= maxAttempts - 1) {
      break;
    }

    await sleep(baseDelayMs * 2 ** attempt);
  }

  return lastFailure;
}

export function buildOpenAiFailure(status, rawBody, statusText = "") {
  return {
    message: formatOpenAiError(status, rawBody, statusText),
    statusCode: isTransientOpenAiStatus(status) ? Number(status) : 502,
  };
}
