import assert from "node:assert/strict";
import { test } from "node:test";
import {
  AI_SERVICE_UNAVAILABLE_MESSAGE,
  buildOpenAiFailure,
  fetchOpenAiWithRetry,
  formatOpenAiError,
  resolveOpenAiRetryOptions,
  stripHtml,
  truncateErrorMessage,
} from "../lib/openai-errors.js";

test("stripHtml removes tags and collapses whitespace", () => {
  const html = "<!DOCTYPE html><html><body><h1>Error 520</h1><p>Web server error</p></body></html>";
  assert.equal(stripHtml(html), "Error 520 Web server error");
});

test("formatOpenAiError maps transient statuses to a friendly message", () => {
  for (const status of [429, 502, 503, 520]) {
    assert.equal(
      formatOpenAiError(status, "<!DOCTYPE html><title>520</title>"),
      AI_SERVICE_UNAVAILABLE_MESSAGE,
    );
  }
});

test("formatOpenAiError strips HTML from upstream bodies", () => {
  const message = formatOpenAiError(
    500,
    "<html><body><h1>Internal Server Error</h1><p>Try again later</p></body></html>",
  );
  assert.equal(message, "Internal Server Error Try again later");
  assert.ok(!message.includes("<"));
});

test("formatOpenAiError truncates long messages", () => {
  const longMessage = "x".repeat(300);
  const message = formatOpenAiError(400, JSON.stringify({ error: { message: longMessage } }));
  assert.equal(message.length, 200);
  assert.match(message, /…$/);
});

test("buildOpenAiFailure never returns raw HTML", () => {
  const failure = buildOpenAiFailure(
    520,
    "<!DOCTYPE html><html><head><title>api.openai.com | 520: Web server is returning an unknown error</title></head><body></body></html>",
  );
  assert.equal(failure.message, AI_SERVICE_UNAVAILABLE_MESSAGE);
  assert.ok(!failure.message.includes("<!DOCTYPE"));
});

test("fetchOpenAiWithRetry retries transient failures before failing", async () => {
  let attempts = 0;
  const fetchImpl = async () => {
    attempts += 1;
    if (attempts < 3) {
      return new Response("<html>520</html>", { status: 520, statusText: "Unknown Error" });
    }
    return new Response(JSON.stringify({ output_text: "ok" }), { status: 200 });
  };

  const response = await fetchOpenAiWithRetry(
    "https://api.openai.com/v1/responses",
    { method: "POST" },
    { maxAttempts: 3, baseDelayMs: 1, fetchImpl },
  );

  assert.equal(response.ok, true);
  assert.equal(attempts, 3);
});

test("fetchOpenAiWithRetry returns sanitized failure after retries are exhausted", async () => {
  const fetchImpl = async () =>
    new Response("<!DOCTYPE html><title>520</title>", { status: 520, statusText: "Unknown Error" });

  const failure = await fetchOpenAiWithRetry(
    "https://api.openai.com/v1/responses",
    { method: "POST" },
    { maxAttempts: 2, baseDelayMs: 1, fetchImpl },
  );

  assert.equal(failure.status, 520);
  assert.match(failure.errorText, /<!DOCTYPE html>/);
});

test("truncateErrorMessage keeps short messages intact", () => {
  assert.equal(truncateErrorMessage("quota exceeded"), "quota exceeded");
});

test("resolveOpenAiRetryOptions caps retry attempts and reads env overrides", () => {
  const previousAttempts = process.env.OPENAI_RETRY_MAX_ATTEMPTS;
  const previousDelay = process.env.OPENAI_RETRY_BASE_DELAY_MS;

  process.env.OPENAI_RETRY_MAX_ATTEMPTS = "9";
  process.env.OPENAI_RETRY_BASE_DELAY_MS = "250";
  assert.deepEqual(resolveOpenAiRetryOptions(), { maxAttempts: 5, baseDelayMs: 250 });

  delete process.env.OPENAI_RETRY_MAX_ATTEMPTS;
  delete process.env.OPENAI_RETRY_BASE_DELAY_MS;
  assert.deepEqual(resolveOpenAiRetryOptions(), { maxAttempts: 3, baseDelayMs: 1000 });

  if (previousAttempts === undefined) {
    delete process.env.OPENAI_RETRY_MAX_ATTEMPTS;
  } else {
    process.env.OPENAI_RETRY_MAX_ATTEMPTS = previousAttempts;
  }
  if (previousDelay === undefined) {
    delete process.env.OPENAI_RETRY_BASE_DELAY_MS;
  } else {
    process.env.OPENAI_RETRY_BASE_DELAY_MS = previousDelay;
  }
});
