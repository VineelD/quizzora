#!/usr/bin/env node
/**
 * Poll /api/health and email the operator when Quizzora is down or recovered.
 *
 * Manual run:
 *   node scripts/uptime-check.mjs
 *
 * Requires UPTIME_ALERT_EMAIL plus Resend or SMTP vars in .env.local (see docs/UPTIME-MONITORING.md).
 */
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { getEmailProvider, sendAuthEmail } from "../lib/mail.js";
import {
  getMonitorConfig,
  getEmailSetupInstructions,
  runUptimeMonitor,
} from "../lib/uptime-monitor.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function loadEnvFile(path) {
  if (!existsSync(path)) {
    return;
  }
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
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
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[name]) {
      process.env[name] = value;
    }
  }
}

loadEnvFile(join(root, ".env.local"));

const config = getMonitorConfig();

if (!config.alertEmail) {
  console.error("UPTIME_ALERT_EMAIL is not set in .env.local.");
  console.error(getEmailSetupInstructions());
  process.exit(1);
}

const provider = getEmailProvider();
if (provider === "dev") {
  console.error("Email is not configured (no RESEND_API_KEY or SMTP_HOST).");
  console.error(getEmailSetupInstructions());
  process.exit(1);
}

async function main() {
  const { results } = await runUptimeMonitor({
    config,
    statePath: config.statePath,
    sendEmail: sendAuthEmail,
    log: console.log,
  });

  for (const { url, checkResult, actions, state } of results) {
    const status = checkResult.healthy ? "ok" : "fail";
    const actionNote = actions.length ? ` actions=${actions.join(",")}` : "";
    console.log(
      `[uptime] ${url} ${status} failures=${state.consecutiveFailures}${actionNote}`,
    );
  }
}

main().catch((error) => {
  console.error("[uptime] Fatal:", error?.message || error);
  process.exit(1);
});
