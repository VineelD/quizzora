/**
 * Ensure Stripe webhook endpoint points at APP_BASE_URL/api/billing/webhook.
 * Creates a new endpoint if none match; prints signing secret when created.
 *
 * Usage: node scripts/sync-stripe-webhook.mjs
 */
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = join(root, ".env.local");

if (existsSync(envPath)) {
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

const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
const baseUrl = (process.env.APP_BASE_URL || "https://quizzora.org").replace(/\/$/, "");
const targetUrl = `${baseUrl}/api/billing/webhook`;

if (!secretKey) {
  console.error("STRIPE_SECRET_KEY is not set.");
  process.exit(1);
}

const events = [
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.paid",
  "invoice.payment_failed",
];

const Stripe = (await import("stripe")).default;
const stripe = new Stripe(secretKey);

const endpoints = await stripe.webhookEndpoints.list({ limit: 100 });
const match = endpoints.data.find((row) => row.url === targetUrl);

if (match) {
  console.log(`Stripe webhook already configured: ${match.url}`);
  console.log(`  id: ${match.id}`);
  console.log(`  status: ${match.status}`);
  const missing = events.filter((name) => !match.enabled_events.includes(name));
  if (missing.length) {
    const updated = await stripe.webhookEndpoints.update(match.id, {
      enabled_events: [...new Set([...match.enabled_events, ...events])],
    });
    console.log(`  added events: ${missing.join(", ")}`);
    console.log(`  enabled_events: ${updated.enabled_events.join(", ")}`);
  } else {
    console.log("  all required events enabled");
  }
  console.log("\nKeep STRIPE_WEBHOOK_SECRET in .env.local matching this endpoint in the Stripe Dashboard.");
  process.exit(0);
}

console.log(`No webhook for ${targetUrl} — creating...`);
const created = await stripe.webhookEndpoints.create({
  url: targetUrl,
  enabled_events: events,
  description: "Quizzora billing (school + family)",
});

console.log(`Created webhook ${created.id}`);
console.log(`  url: ${created.url}`);
console.log(`  signing secret: ${created.secret}`);
console.log("\nUpdate .env.local:");
console.log(`STRIPE_WEBHOOK_SECRET=${created.secret}`);
console.log("\nDisable or delete old webhook endpoints for the previous domain in the Stripe Dashboard.");
