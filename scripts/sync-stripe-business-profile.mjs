import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { syncStripeBusinessProfile } from "../lib/stripe-profile.js";

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
if (!secretKey) {
  console.error("STRIPE_SECRET_KEY is not set. Add it to .env.local or the environment.");
  process.exit(1);
}

const Stripe = (await import("stripe")).default;
const stripe = new Stripe(secretKey);

console.log("Syncing Stripe via API (products, billing portal, checkout copy)...");

const { products, portal, dashboardChecklist } = await syncStripeBusinessProfile(stripe);

for (const product of products) {
  console.log(`  Product ${product.id}: ${product.name} (${product.statement_descriptor})`);
}

console.log(`  Billing portal config ${portal.id}: ${portal.business_profile?.headline}`);

const account = await stripe.accounts.retrieve();
console.log("\nStripe account still shows (Dashboard-only fields on standard accounts):");
console.log(`  business_profile.name: ${account.business_profile?.name || "(unset)"}`);
console.log(`  company.name: ${account.company?.name || "(unset)"}`);
console.log(`  statement descriptor: ${account.settings?.payments?.statement_descriptor || "(unset)"}`);

const legalName = process.env.OPERATOR_LEGAL_NAME?.trim() || "Mr Vineel Davuluri";
const needsDashboard =
  account.business_profile?.name !== "Quizzora" ||
  (account.company?.name && account.company.name !== legalName) ||
  account.settings?.payments?.statement_descriptor !== "QUIZZORA";

if (needsDashboard) {
  console.log("\nUpdate these in the Stripe Dashboard (API cannot change them on your account type):");
  for (const section of dashboardChecklist) {
    console.log(`  ${section.area}`);
    for (const field of section.fields) {
      console.log(`    ${field.label}: ${field.value}`);
    }
  }
  console.log("\nDashboard: https://dashboard.stripe.com/settings/account");
} else {
  console.log("\nStripe account business fields already match operator settings.");
}

console.log(
  "\nCheckout sessions created by the app also show the product name + legal operator in custom text.",
);
