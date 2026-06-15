import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";
import {
  buildAlertEmail,
  checkEndpoint,
  evaluateCheckTransition,
  loadMonitorState,
  parseCheckUrls,
  runUptimeMonitor,
  saveMonitorState,
} from "../lib/uptime-monitor.js";

test("parseCheckUrls splits comma-separated values", () => {
  assert.deepEqual(
    parseCheckUrls({
      UPTIME_CHECK_URLS:
        "http://127.0.0.1:3000/api/health,https://quizzora.org/api/health",
    }),
    ["http://127.0.0.1:3000/api/health", "https://quizzora.org/api/health"],
  );
});

test("checkEndpoint treats 200 ok JSON as healthy", async () => {
  const result = await checkEndpoint("https://example.test/health", {
    fetchImpl: async () => ({
      status: 200,
      text: async () => JSON.stringify({ status: "ok" }),
    }),
  });
  assert.equal(result.healthy, true);
});

test("checkEndpoint treats 503 degraded JSON as unhealthy", async () => {
  const result = await checkEndpoint("https://example.test/health", {
    fetchImpl: async () => ({
      status: 503,
      text: async () => JSON.stringify({ status: "degraded" }),
    }),
  });
  assert.equal(result.healthy, false);
  assert.match(result.error, /degraded|503/);
});

test("evaluateCheckTransition debounces until consecutive failures reach threshold", () => {
  const first = evaluateCheckTransition({
    previous: {},
    checkResult: { healthy: false, error: "connection refused" },
    failThreshold: 2,
    cooldownMinutes: 60,
    now: new Date("2026-06-08T10:00:00.000Z"),
  });
  assert.deepEqual(first.actions, []);

  const second = evaluateCheckTransition({
    previous: first.state,
    checkResult: { healthy: false, error: "connection refused", statusCode: null },
    failThreshold: 2,
    cooldownMinutes: 60,
    now: new Date("2026-06-08T10:05:00.000Z"),
  });
  assert.deepEqual(second.actions, ["alert_down"]);
  assert.equal(second.state.status, "down");
});

test("evaluateCheckTransition sends recovery after downtime", () => {
  const recovered = evaluateCheckTransition({
    previous: {
      status: "down",
      consecutiveFailures: 3,
      lastAlertAt: "2026-06-08T10:05:00.000Z",
    },
    checkResult: { healthy: true },
    failThreshold: 2,
    cooldownMinutes: 60,
    now: new Date("2026-06-08T10:10:00.000Z"),
  });
  assert.deepEqual(recovered.actions, ["alert_recovery"]);
  assert.equal(recovered.state.status, "up");
  assert.equal(recovered.state.consecutiveFailures, 0);
});

test("buildAlertEmail includes url and server name", () => {
  const email = buildAlertEmail({
    type: "down",
    url: "http://127.0.0.1:3000/api/health",
    error: "Timed out",
    hostname: "QUIZZORA-PC",
    timestamp: "2026-06-08T10:00:00.000Z",
    statusCode: null,
  });
  assert.match(email.subject, /Site down alert/);
  assert.match(email.text, /QUIZZORA-PC/);
  assert.match(email.text, /Timed out/);
});

test("runUptimeMonitor persists state and sends alerts", async () => {
  const dir = mkdtempSync(join(tmpdir(), "uptime-monitor-"));
  const statePath = join(dir, "state.json");
  const sent = [];
  let unhealthyRemaining = 2;

  const fetchImpl = async () => {
    if (unhealthyRemaining > 0) {
      unhealthyRemaining -= 1;
      return {
        status: 503,
        text: async () => JSON.stringify({ status: "degraded" }),
      };
    }
    return {
      status: 200,
      text: async () => JSON.stringify({ status: "ok" }),
    };
  };

  await runUptimeMonitor({
    config: {
      alertEmail: "ops@example.com",
      checkUrls: ["http://127.0.0.1:3000/api/health"],
      failThreshold: 2,
      cooldownMinutes: 60,
      timeoutMs: 5_000,
    },
    statePath,
    fetchImpl,
    sendEmail: async (payload) => {
      sent.push(payload);
    },
    now: new Date("2026-06-08T10:00:00.000Z"),
    log: () => {},
  });

  assert.equal(sent.length, 0);

  await runUptimeMonitor({
    config: {
      alertEmail: "ops@example.com",
      checkUrls: ["http://127.0.0.1:3000/api/health"],
      failThreshold: 2,
      cooldownMinutes: 60,
      timeoutMs: 5_000,
    },
    statePath,
    fetchImpl,
    sendEmail: async (payload) => {
      sent.push(payload);
    },
    now: new Date("2026-06-08T10:05:00.000Z"),
    log: () => {},
  });

  assert.equal(sent.length, 1);
  assert.match(sent[0].subject, /Site down alert/);

  await runUptimeMonitor({
    config: {
      alertEmail: "ops@example.com",
      checkUrls: ["http://127.0.0.1:3000/api/health"],
      failThreshold: 2,
      cooldownMinutes: 60,
      timeoutMs: 5_000,
    },
    statePath,
    fetchImpl,
    sendEmail: async (payload) => {
      sent.push(payload);
    },
    now: new Date("2026-06-08T10:10:00.000Z"),
    log: () => {},
  });

  assert.equal(sent.length, 2);
  assert.match(sent[1].subject, /Site recovered/);

  const persisted = JSON.parse(readFileSync(statePath, "utf8"));
  assert.equal(persisted.checks["http://127.0.0.1:3000/api/health"].status, "up");

  rmSync(dir, { recursive: true, force: true });
});

test("saveMonitorState and loadMonitorState round-trip", () => {
  const dir = mkdtempSync(join(tmpdir(), "uptime-monitor-"));
  const statePath = join(dir, "nested", "state.json");
  saveMonitorState(statePath, { checks: { "http://x": { status: "up" } } });
  const loaded = loadMonitorState(statePath);
  assert.equal(loaded.checks["http://x"].status, "up");
  rmSync(dir, { recursive: true, force: true });
});
