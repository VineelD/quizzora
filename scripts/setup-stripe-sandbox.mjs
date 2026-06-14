/**
 * Create Stripe TEST-mode products and prices mirroring production Quizzora billing.
 *
 * Usage:
 *   1. Copy your test secret key from Stripe Dashboard (Developers → API keys, Test mode).
 *   2. Set STRIPE_TEST_SECRET_KEY in .env.local OR pass on the command line:
 *        $env:STRIPE_TEST_SECRET_KEY='sk_test_...'; npm run stripe:sandbox
 *   3. Swap Stripe vars from .env.stripe-test.local into .env.local when testing.
 *
 * Local webhooks: stripe listen --forward-to localhost:3000/api/billing/webhook
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  STRIPE_PLAN_CATALOG,
  audToCents,
  productStatementDescriptor,
  stripeSandboxMetadata,
} from "../lib/stripe-sandbox-plans.js";
import { syncStripeBillingPortal } from "../lib/stripe-profile.js";

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
loadEnvFile(join(root, ".env.stripe-test.local"));

const testSecret =
  process.argv[2]?.trim() ||
  process.env.STRIPE_TEST_SECRET_KEY?.trim() ||
  (process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_") ? process.env.STRIPE_SECRET_KEY.trim() : "");

if (!testSecret) {
  console.error("Missing Stripe TEST secret key.");
  console.error("");
  console.error("1. Open https://dashboard.stripe.com/test/apikeys");
  console.error("2. Reveal the Secret key (starts with sk_test_)");
  console.error("3. Run:");
  console.error("   $env:STRIPE_TEST_SECRET_KEY='<your Stripe test secret key>'; npm run stripe:sandbox");
  console.error("");
  console.error("Or add STRIPE_TEST_SECRET_KEY=<your Stripe test secret key> to .env.local and run again.");
  process.exit(1);
}

if (!testSecret.startsWith("sk_test_")) {
  console.error("Refusing to run: key must be a Stripe TEST secret (sk_test_...).");
  console.error("Use STRIPE_TEST_SECRET_KEY, not your live sk_live_ key.");
  process.exit(1);
}

const Stripe = (await import("stripe")).default;
const stripe = new Stripe(testSecret);

const WEBHOOK_EVENTS = [
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.paid",
  "invoice.payment_failed",
];

async function findProductByPlan(planKey) {
  const result = await stripe.products.search({
    query: `metadata['quizzora_plan']:'${planKey}' AND active:'true'`,
    limit: 5,
  });
  return result.data[0] || null;
}

async function findOrCreateProduct(plan) {
  let product = await findProductByPlan(plan.key);
  if (product) {
    product = await stripe.products.update(product.id, {
      name: plan.productName,
      description: plan.description,
      statement_descriptor: productStatementDescriptor(),
      metadata: stripeSandboxMetadata(plan.key),
    });
    console.log(`  Product exists: ${product.id} (${product.name})`);
    return product;
  }

  product = await stripe.products.create({
    name: plan.productName,
    description: plan.description,
    statement_descriptor: productStatementDescriptor(),
    metadata: stripeSandboxMetadata(plan.key),
  });
  console.log(`  Created product: ${product.id} (${product.name})`);
  return product;
}

async function findOrCreatePrice(productId, { interval, amountAud, nickname }) {
  const amount = audToCents(amountAud);
  const listed = await stripe.prices.list({ product: productId, active: true, limit: 100 });
  const match = listed.data.find(
    (price) =>
      price.currency === "aud" &&
      price.unit_amount === amount &&
      price.recurring?.interval === interval,
  );
  if (match) {
    console.log(`    Price exists: ${match.id} — AUD $${amountAud}/${interval}`);
    return match;
  }

  const created = await stripe.prices.create({
    product: productId,
    currency: "aud",
    unit_amount: amount,
    recurring: { interval },
    nickname,
  });
  console.log(`    Created price: ${created.id} — AUD $${amountAud}/${interval}`);
  return created;
}

async function ensureTestWebhook(baseUrl) {
  const targetUrl = `${baseUrl.replace(/\/$/, "")}/api/billing/webhook`;
  const endpoints = await stripe.webhookEndpoints.list({ limit: 100 });
  const match = endpoints.data.find((row) => row.url === targetUrl);

  if (match) {
    const missing = WEBHOOK_EVENTS.filter((name) => !match.enabled_events.includes(name));
    if (missing.length) {
      await stripe.webhookEndpoints.update(match.id, {
        enabled_events: [...new Set([...match.enabled_events, ...WEBHOOK_EVENTS])],
      });
      console.log(`  Webhook updated: added ${missing.join(", ")}`);
    } else {
      console.log(`  Webhook exists: ${match.url}`);
    }
    console.log("  Use the TEST signing secret from Stripe Dashboard for this endpoint.");
    return { url: targetUrl, id: match.id, secret: null, existing: true };
  }

  const created = await stripe.webhookEndpoints.create({
    url: targetUrl,
    enabled_events: WEBHOOK_EVENTS,
    description: "Quizzora billing sandbox (test mode)",
  });
  console.log(`  Created test webhook: ${created.url}`);
  console.log(`  Signing secret: ${created.secret}`);
  return { url: created.url, id: created.id, secret: created.secret, existing: false };
}

console.log("Stripe sandbox setup (TEST mode)\n");

const priceEnv = {};
for (const plan of STRIPE_PLAN_CATALOG) {
  console.log(plan.productName);
  const product = await findOrCreateProduct(plan);
  for (const priceDef of plan.prices) {
    const price = await findOrCreatePrice(product.id, priceDef);
    priceEnv[priceDef.env] = price.id;
  }
}

console.log("\nBilling portal (test mode)...");
const portal = await syncStripeBillingPortal(stripe, {
  appBaseUrl: process.env.APP_BASE_URL || "http://localhost:3000",
});
console.log(`  Portal config: ${portal.id}`);

const baseUrl = (process.env.APP_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
console.log(`\nWebhook (test mode) for ${baseUrl}...`);
const webhook = await ensureTestWebhook(baseUrl);

const trialDays = process.env.BILLING_TRIAL_DAYS || "7";
const lines = [
  "# Stripe TEST mode - generated by scripts/setup-stripe-sandbox.mjs",
  "# Copy these into .env.local (backup live keys first) while testing.",
  "# Restore live keys before production billing.",
  "",
  `STRIPE_SECRET_KEY=${testSecret}`,
  webhook.secret
    ? `STRIPE_WEBHOOK_SECRET=${webhook.secret}`
    : "# STRIPE_WEBHOOK_SECRET=replace-with-your-test-webhook-secret  # from Stripe Dashboard (test webhook)",
  `STRIPE_PRICE_MONTHLY=${priceEnv.STRIPE_PRICE_MONTHLY}`,
  `STRIPE_PRICE_YEARLY=${priceEnv.STRIPE_PRICE_YEARLY}`,
  `STRIPE_PRICE_FAMILY_MONTHLY=${priceEnv.STRIPE_PRICE_FAMILY_MONTHLY}`,
  `STRIPE_PRICE_FAMILY_YEARLY=${priceEnv.STRIPE_PRICE_FAMILY_YEARLY}`,
  "BILLING_DISPLAY_MONTHLY_AUD=120",
  "BILLING_DISPLAY_YEARLY_AUD=1200",
  "BILLING_DISPLAY_FAMILY_MONTHLY_AUD=30",
  "BILLING_DISPLAY_FAMILY_YEARLY_AUD=300",
  `BILLING_TRIAL_DAYS=${trialDays}`,
  "BILLING_YEARLY_DISCOUNT_PERCENT=17",
  "",
  "# Test card: 4242 4242 4242 4242 · any future expiry · any CVC",
  "# Local webhooks: stripe listen --forward-to localhost:3000/api/billing/webhook",
];

const outPaths = [join(root, ".env.stripe-test.local")];
const testRoot = join(root, "..", "LittleCode-test");
if (existsSync(testRoot)) {
  outPaths.push(join(testRoot, ".env.stripe-test.local"));
}

for (const outPath of outPaths) {
  writeFileSync(outPath, `${lines.join("\n")}\n`, "utf8");
  console.log(`\nWrote ${outPath}`);
}

console.log("\n--- Test price IDs ---");
for (const [key, value] of Object.entries(priceEnv)) {
  console.log(`${key}=${value}`);
}

console.log("\nNext steps:");
console.log("  1. Backup live STRIPE_* lines from .env.local");
console.log("  2. Copy vars from .env.stripe-test.local into .env.local");
console.log("  3. npm run build && restart Quizzora Next.js scheduled task");
console.log("  4. Register a test school → Checkout with 4242 4242 4242 4242");
if (webhook.existing && !webhook.secret) {
  console.log("  5. Set STRIPE_WEBHOOK_SECRET from the TEST webhook in Stripe Dashboard");
}
