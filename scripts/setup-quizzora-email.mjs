/**
 * Verify Resend domain status and send a test message from noreply@quizzora.org.
 * Optionally sync DNS to Cloudflare when CLOUDFLARE_API_TOKEN + CLOUDFLARE_ZONE_ID are set.
 *
 * Usage:
 *   node scripts/setup-quizzora-email.mjs
 *   node scripts/setup-quizzora-email.mjs --to you@example.com
 */
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = join(root, ".env.local");
const domain = "quizzora.org";

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

const apiKey = process.env.RESEND_API_KEY?.trim();
if (!apiKey) {
  console.error("RESEND_API_KEY is not set.");
  process.exit(1);
}

const headers = {
  Authorization: `Bearer ${apiKey}`,
  "Content-Type": "application/json",
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function resend(path, options = {}) {
  const response = await fetch(`https://api.resend.com${path}`, {
    ...options,
    headers: { ...headers, ...options.headers },
  });
  const body = await response.json().catch(() => ({}));
  if (response.status === 429) {
    await sleep(1200);
    return resend(path, options);
  }
  if (!response.ok) {
    throw new Error(body.message || body.error || `Resend ${response.status}`);
  }
  await sleep(600);
  return body;
}

function recordNameForCloudflare(name) {
  if (!name) {
    return "@";
  }
  return name;
}

async function syncCloudflareRecords(records) {
  const token = process.env.CLOUDFLARE_API_TOKEN?.trim();
  const zoneId = process.env.CLOUDFLARE_ZONE_ID?.trim();
  if (!token || !zoneId) {
    console.log("\nCloudflare API not configured (CLOUDFLARE_API_TOKEN + CLOUDFLARE_ZONE_ID).");
    console.log("Sending DNS is already verified in Resend; skip unless you need to re-add records.");
    return false;
  }

  const list = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records?per_page=100`, {
    headers: { Authorization: `Bearer ${token}` },
  }).then((r) => r.json());

  if (!list.success) {
    throw new Error(list.errors?.[0]?.message || "Cloudflare list failed");
  }

  const existing = list.result || [];

  for (const record of records) {
    if (record.record === "Receiving") {
      continue;
    }

    const cfName = recordNameForCloudflare(record.name);
    const type = record.type;
    const content = record.value;
    const priority = record.priority;

    const match = existing.find(
      (row) =>
        row.type === type &&
        row.name === (cfName === "@" ? domain : `${cfName}.${domain}`) &&
        row.content === content,
    );

    if (match) {
      console.log(`  Cloudflare OK: ${type} ${cfName}`);
      continue;
    }

    const payload = {
      type,
      name: cfName,
      content,
      proxied: false,
      ttl: 1,
    };
    if (type === "MX" && priority != null) {
      payload.priority = priority;
    }

    const created = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).then((r) => r.json());

    if (!created.success) {
      throw new Error(created.errors?.[0]?.message || `Failed to create ${type} ${cfName}`);
    }
    console.log(`  Cloudflare added: ${type} ${cfName}`);
  }

  return true;
}

const toFlag = process.argv.find((arg) => arg.startsWith("--to="));
const toAddress = toFlag
  ? toFlag.slice("--to=".length)
  : process.env.OPERATOR_CONTACT_EMAIL?.trim() || "support@quizzora.org";

console.log(`Checking Resend domain ${domain}...`);

const listed = await resend("/domains");
const entry = (listed.data || []).find((row) => row.name === domain);
if (!entry) {
  console.log("Domain not in Resend — creating...");
  const created = await resend("/domains", {
    method: "POST",
    body: JSON.stringify({ name: domain }),
  });
  console.log(`  Created domain id ${created.id}`);
}

const domainId = entry?.id || (await resend("/domains")).data.find((row) => row.name === domain)?.id;
const detail = await resend(`/domains/${domainId}`);

console.log(`  Status: ${detail.status}`);
for (const record of detail.records || []) {
  console.log(`  ${record.record} ${record.name || "@"} ${record.type} -> ${record.status}`);
}

const outboundAlreadyVerified = (detail.records || [])
  .filter((r) => r.record !== "Receiving")
  .every((r) => r.status === "verified");

if (!outboundAlreadyVerified) {
  await resend(`/domains/${domainId}/verify`, { method: "POST" });
  console.log("Triggered Resend DNS re-check.");
  await sleep(3000);
} else {
  console.log("Outbound DNS records already verified — skipping re-check.");
}

await syncCloudflareRecords(detail.records || []);

let refreshed = await resend(`/domains/${domainId}`);
for (let attempt = 0; attempt < 5 && refreshed.status === "pending"; attempt += 1) {
  console.log(`  waiting for Resend status (attempt ${attempt + 1})...`);
  await sleep(2000);
  refreshed = await resend(`/domains/${domainId}`);
}
console.log(`\nDomain status: ${refreshed.status}`);

const outboundRecords = (refreshed.records || []).filter((r) => r.record !== "Receiving");
const sendingReady =
  refreshed.status === "verified" ||
  refreshed.status === "partially_verified" ||
  (refreshed.capabilities?.sending === "enabled" &&
    outboundRecords.length > 0 &&
    outboundRecords.every((r) => r.status === "verified"));

if (!sendingReady) {
  console.error("\nOutbound sending is not fully verified yet. Check Cloudflare DNS (grey cloud for mail records).");
  console.error(`  domain status: ${refreshed.status}`);
  for (const record of outboundRecords) {
    console.error(`  ${record.record} ${record.name || "@"}: ${record.status}`);
  }
  process.exit(1);
}

const from = process.env.MAIL_FROM || `Quizzora <noreply@${domain}>`;
console.log(`\nSending test email to ${toAddress} from ${from}...`);

const sent = await resend("/emails", {
  method: "POST",
  body: JSON.stringify({
    from,
    to: [toAddress],
    subject: "Quizzora email test",
    html: `<p>This is a test message from <strong>Quizzora</strong> at <a href="https://${domain}">${domain}</a>.</p><p>If you received this, outbound mail from <code>noreply@${domain}</code> is working.</p>`,
  }),
});

console.log(`  Sent (id: ${sent.id})`);

const receivingPending = (refreshed.records || []).some(
  (r) => r.record === "Receiving" && r.status !== "verified",
);
if (receivingPending) {
  console.log("\nInbound Resend MX is still pending (optional).");
  console.log("quizzora.org already uses Cloudflare Email Routing MX records.");
  console.log("Add a routing rule in Cloudflare: Email → Email Routing → support@quizzora.org → your inbox.");
  console.log("Do not replace root MX with Resend inbound if you want Cloudflare to receive support@ mail.");
}

console.log("\nEmail setup check complete.");
