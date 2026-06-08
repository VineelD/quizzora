import { SPEECH_REFINE_RATE_LIMIT_MS } from "./speech-refine-config.js";

const lastRequestBySession = new Map();

/**
 * Server-side throttle for realtime speech refinement (one request per session per window).
 */
export function checkSpeechRefineRateLimit(sessionKey) {
  const key = String(sessionKey || "");
  if (!key) {
    return { allowed: true };
  }

  const now = Date.now();
  const last = lastRequestBySession.get(key) || 0;
  const elapsed = now - last;

  if (elapsed < SPEECH_REFINE_RATE_LIMIT_MS) {
    return {
      allowed: false,
      retryAfterMs: SPEECH_REFINE_RATE_LIMIT_MS - elapsed,
    };
  }

  lastRequestBySession.set(key, now);
  return { allowed: true };
}

/** Test helper — reset in-memory throttle state. */
export function resetSpeechRefineRateLimits() {
  lastRequestBySession.clear();
}
