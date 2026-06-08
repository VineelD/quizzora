/**
 * Configure Cloudflare Email Routing (custom address and/or catch-all).
 *
 * Requires in .env.local (or environment):
 *   CLOUDFLARE_API_TOKEN  — API token with Zone:Email Routing Edit + Zone:DNS Read
 *   CLOUDFLARE_ZONE_ID    — zone id for quizzora.org (or set CLOUDFLARE_ZONE_NAME=quizzora.org)
 *   EMAIL_FORWARD_TO      — destination inbox (e.g. you@gmail.com)
 *
 * Optional:
 *   EMAIL_ROUTING_DOMAIN  — full domain (default: quizzora.org)
 *   EMAIL_ROUTING_LOCAL   — local part (default: support)
 *   EMAIL_ROUTING_RULE_NAME
 *
 * Usage:
 *   node scripts/setup-cloudflare-email-routing.mjs
 *   node scripts/setup-cloudflare-email-routing.mjs --domain=staging.quizzora.org --local=inbox
 *   node scripts/setup-cloudflare-email-routing.mjs --domain=staging.quizzora.org --catch-all
 *   node scripts/setup-cloudflare-email-routing.mjs --dry-run
 */
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = join(root, ".env.local");
const dryRun = process.argv.includes("--dry-run");
const catchAll = process.argv.includes("--catch-all");

function readFlag(name) {
  const prefix = `${name}=`;
  const arg = process.argv.find((item) => item.startsWith(prefix));
  return arg ? arg.slice(prefix.length).trim() : "";
}

const zoneNameDefault = "quizzora.org";
const domain =
  readFlag("--domain") ||
  process.env.EMAIL_ROUTING_DOMAIN?.trim() ||
  zoneNameDefault;
const customAddress =
  readFlag("--local") || process.env.EMAIL_ROUTING_LOCAL?.trim() || "support";
const ruleName =
  process.env.EMAIL_ROUTING_RULE_NAME?.trim() ||
  (domain === zoneNameDefault && customAddress === "support"
    ? "Quizzora support"
    : `Quizzora ${customAddress} (${domain})`);

function loadEnv() {
  if (!existsSync(envPath)) {
    return;
  }
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
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

loadEnv();

const token = process.env.CLOUDFLARE_API_TOKEN?.trim();
const forwardTo = process.env.EMAIL_FORWARD_TO?.trim();
let zoneId = process.env.CLOUDFLARE_ZONE_ID?.trim();
const zoneName = process.env.CLOUDFLARE_ZONE_NAME?.trim() || zoneNameDefault;

async function cf(path, options = {}) {
  const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  const body = await response.json();
  if (!body.success) {
    throw new Error(body.errors?.[0]?.message || `Cloudflare ${response.status}`);
  }
  return body.result;
}

if (!token) {
  console.error("CLOUDFLARE_API_TOKEN is not set.");
  console.error("Create a token at https://dash.cloudflare.com/profile/api-tokens");
  console.error("Permissions: Zone → Email Routing → Edit, Zone → DNS → Read");
  process.exit(1);
}

if (!forwardTo) {
  console.error(`EMAIL_FORWARD_TO is not set (destination inbox for *@${domain}).`);
  process.exit(1);
}

if (!zoneId) {
  const zones = await cf(`/zones?name=${encodeURIComponent(zoneName)}`);
  zoneId = zones?.[0]?.id;
  if (!zoneId) {
    throw new Error(`Could not find Cloudflare zone for ${zoneName}`);
  }
  console.log(`Resolved zone id: ${zoneId}`);
}

if (catchAll) {
  const catchAllRule = await cf(`/zones/${zoneId}/email/routing/rules/catch_all`);
  const alreadyForwards =
    catchAllRule?.enabled &&
    catchAllRule.actions?.some(
      (action) => action.type === "forward" && action.value?.includes(forwardTo),
    );

  if (alreadyForwards) {
    console.log(`Catch-all already forwards to ${forwardTo}`);
  } else if (dryRun) {
    console.log(`DRY RUN: would enable catch-all on zone ${zoneName} -> ${forwardTo}`);
    console.log("Ensure subdomain MX for staging is enabled in the dashboard first.");
  } else {
    const updated = await cf(`/zones/${zoneId}/email/routing/rules/catch_all`, {
      method: "PUT",
      body: JSON.stringify({
        enabled: true,
        matchers: [{ type: "all" }],
        actions: [{ type: "forward", value: [forwardTo] }],
      }),
    });
    console.log(`Updated catch-all rule ${updated.id}`);
    console.log(`  *@${zoneName} (and configured subdomains) -> ${forwardTo}`);
    console.log(
      "For staging-only catch-all, prefer the dashboard subdomain catch-all if zone catch-all is too broad.",
    );
  }
}

if (!catchAll || process.argv.includes("--also-local")) {
  const rules = await cf(`/zones/${zoneId}/email/routing/rules`);
  const target = `${customAddress}@${domain}`;
  const existing = (rules || []).find(
    (rule) =>
      rule.matchers?.some((matcher) => matcher.field === "to" && matcher.value === target) ||
      rule.name === ruleName,
  );

  if (existing) {
    console.log(`Email routing rule already exists: ${existing.id}`);
    console.log(`  forwards ${target} -> check Cloudflare dashboard for destination`);
  } else if (dryRun) {
    console.log(`DRY RUN: would forward ${target} -> ${forwardTo}`);
  } else {
    const created = await cf(`/zones/${zoneId}/email/routing/rules`, {
      method: "POST",
      body: JSON.stringify({
        name: ruleName,
        enabled: true,
        matchers: [{ type: "literal", field: "to", value: target }],
        actions: [{ type: "forward", value: [forwardTo] }],
      }),
    });

    console.log(`Created routing rule ${created.id}`);
    console.log(`  ${target} -> ${forwardTo}`);
  }
}

console.log(
  "Cloudflare sends a verification link to new destination inboxes — click it to activate.",
);
if (domain !== zoneNameDefault) {
  console.log(
    `Subdomain ${domain} must have Email Routing enabled in Cloudflare (Settings → Add subdomain) before mail is received.`,
  );
}
