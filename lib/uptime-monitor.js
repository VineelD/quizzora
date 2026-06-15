import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

const DEFAULT_CHECK_URL = "http://127.0.0.1:3000/api/health";
const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_FAIL_THRESHOLD = 2;
const DEFAULT_COOLDOWN_MINUTES = 60;

export function parseCheckUrls(env = process.env) {
  const raw =
    env.UPTIME_CHECK_URLS?.trim() ||
    env.UPTIME_CHECK_URL?.trim() ||
    DEFAULT_CHECK_URL;
  return raw
    .split(/[,;\s]+/)
    .map((url) => url.trim())
    .filter(Boolean);
}

export function getMonitorConfig(env = process.env) {
  return {
    alertEmail: env.UPTIME_ALERT_EMAIL?.trim() || "",
    checkUrls: parseCheckUrls(env),
    failThreshold: Math.max(
      1,
      Number(env.UPTIME_FAIL_THRESHOLD || DEFAULT_FAIL_THRESHOLD),
    ),
    cooldownMinutes: Math.max(
      1,
      Number(env.UPTIME_ALERT_COOLDOWN_MINUTES || DEFAULT_COOLDOWN_MINUTES),
    ),
    timeoutMs: Math.max(
      1_000,
      Number(env.UPTIME_CHECK_TIMEOUT_MS || DEFAULT_TIMEOUT_MS),
    ),
    statePath:
      env.UPTIME_STATE_PATH?.trim() ||
      join(packageRoot, "data", "uptime-monitor-state.json"),
  };
}

export function loadMonitorState(statePath) {
  if (!existsSync(statePath)) {
    return { checks: {} };
  }
  try {
    const parsed = JSON.parse(readFileSync(statePath, "utf8"));
    return {
      checks: parsed?.checks && typeof parsed.checks === "object" ? parsed.checks : {},
    };
  } catch {
    return { checks: {} };
  }
}

export function saveMonitorState(statePath, state) {
  mkdirSync(dirname(statePath), { recursive: true });
  writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

export async function checkEndpoint(url, { timeoutMs = DEFAULT_TIMEOUT_MS, fetchImpl = fetch } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(url, {
      method: "GET",
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });

    let bodyText = "";
    try {
      bodyText = await response.text();
    } catch {
      bodyText = "";
    }

    let statusField = null;
    if (bodyText) {
      try {
        statusField = JSON.parse(bodyText)?.status ?? null;
      } catch {
        statusField = null;
      }
    }

    const healthy = response.status === 200 && statusField !== "degraded";

    return {
      healthy,
      statusCode: response.status,
      statusField,
      error: healthy
        ? null
        : statusField === "degraded"
          ? "Health endpoint returned degraded"
          : `HTTP ${response.status}`,
      bodySnippet: bodyText.slice(0, 500),
    };
  } catch (error) {
    const message =
      error?.name === "AbortError"
        ? `Timed out after ${timeoutMs}ms`
        : String(error?.message || error);
    return {
      healthy: false,
      statusCode: null,
      statusField: null,
      error: message,
      bodySnippet: "",
    };
  } finally {
    clearTimeout(timer);
  }
}

export function evaluateCheckTransition({
  previous = {},
  checkResult,
  failThreshold,
  cooldownMinutes,
  now = new Date(),
}) {
  const wasUp = previous.status !== "down";
  const consecutiveFailures = checkResult.healthy
    ? 0
    : (previous.consecutiveFailures || 0) + 1;

  const next = {
    status: previous.status === "down" && checkResult.healthy ? "up" : previous.status || "up",
    consecutiveFailures,
    lastCheckAt: now.toISOString(),
    lastError: checkResult.healthy ? null : checkResult.error,
    lastStatusCode: checkResult.statusCode,
    lastAlertAt: previous.lastAlertAt || null,
  };

  const actions = [];

  if (!checkResult.healthy && consecutiveFailures >= failThreshold) {
    if (wasUp || previous.status !== "down") {
      next.status = "down";
      next.lastAlertAt = now.toISOString();
      actions.push("alert_down");
    } else if (previous.lastAlertAt) {
      const minutesSince =
        (now.getTime() - new Date(previous.lastAlertAt).getTime()) / 60_000;
      if (minutesSince >= cooldownMinutes) {
        next.lastAlertAt = now.toISOString();
        actions.push("alert_down");
      }
    } else {
      next.lastAlertAt = now.toISOString();
      actions.push("alert_down");
    }
  }

  if (checkResult.healthy && previous.status === "down") {
    next.status = "up";
    actions.push("alert_recovery");
  }

  if (checkResult.healthy && previous.status !== "down") {
    next.status = "up";
  }

  return { state: next, actions };
}

export function buildAlertEmail({
  type,
  url,
  error,
  hostname = os.hostname(),
  timestamp = new Date().toISOString(),
  statusCode = null,
}) {
  const isRecovery = type === "recovery";
  const subject = isRecovery
    ? "[Quizzora] Site recovered"
    : "[Quizzora] Site down alert";

  const lines = [
    isRecovery
      ? "Quizzora health check recovered."
      : "Quizzora health check failed.",
    "",
    `Timestamp: ${timestamp}`,
    `Server: ${hostname}`,
    `URL: ${url}`,
  ];

  if (!isRecovery) {
    lines.push(`Error: ${error || "Unknown error"}`);
    if (statusCode != null) {
      lines.push(`HTTP status: ${statusCode}`);
    }
  }

  lines.push(
    "",
    "This message was sent by scripts/uptime-check.mjs on the Quizzora host.",
  );

  const text = lines.join("\n");
  const html = lines.map((line) => `<p>${line || "&nbsp;"}</p>`).join("");

  return { subject, text, html };
}

export function getEmailSetupInstructions() {
  return [
    "Uptime alerts need outbound email configured in .env.local:",
    "  Option A (recommended): RESEND_API_KEY=... and MAIL_FROM=Quizzora <noreply@quizzora.org>",
    "  Option B: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM",
    "",
    "Also set:",
    "  UPTIME_ALERT_EMAIL=your-operator@example.com",
    "",
    "Then register the scheduled task:",
    "  powershell -ExecutionPolicy Bypass -File C:\\LittleCode\\scripts\\register-uptime-monitor.ps1",
  ].join("\n");
}

export async function runUptimeMonitor({
  config,
  statePath,
  fetchImpl = fetch,
  sendEmail,
  now = new Date(),
  log = console.log,
}) {
  const state = loadMonitorState(statePath);
  const results = [];

  for (const url of config.checkUrls) {
    const checkResult = await checkEndpoint(url, {
      timeoutMs: config.timeoutMs,
      fetchImpl,
    });
    const previous = state.checks[url] || {};
    const { state: nextState, actions } = evaluateCheckTransition({
      previous,
      checkResult,
      failThreshold: config.failThreshold,
      cooldownMinutes: config.cooldownMinutes,
      now,
    });

    state.checks[url] = nextState;

    for (const action of actions) {
      const email = buildAlertEmail({
        type: action === "alert_recovery" ? "recovery" : "down",
        url,
        error: checkResult.error,
        statusCode: checkResult.statusCode,
        timestamp: now.toISOString(),
      });
      await sendEmail({
        to: config.alertEmail,
        subject: email.subject,
        text: email.text,
        html: email.html,
      });
      log(
        `[uptime] ${action === "alert_recovery" ? "Recovery" : "Down"} alert sent for ${url}`,
      );
    }

    results.push({ url, checkResult, actions, state: nextState });
  }

  saveMonitorState(statePath, state);
  return { state, results };
}
