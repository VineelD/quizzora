import { randomBytes } from "node:crypto";
import { createSupportUser } from "../lib/support.js";

const email = String(process.env.SUPPORT_EMAIL || process.argv[2] || "").trim().toLowerCase();
const password = String(process.env.SUPPORT_PASSWORD || process.argv[3] || "").trim();
const name = String(process.env.SUPPORT_NAME || "Support Agent").trim();
const username = String(process.env.SUPPORT_USERNAME || "support").trim().toLowerCase();

if (!email) {
  console.error("Usage: node scripts/create-support.mjs <email> <password>");
  console.error("Or set SUPPORT_EMAIL and SUPPORT_PASSWORD in the environment.");
  process.exit(1);
}

const resolvedPassword = password || randomBytes(18).toString("base64url");

const { getDb } = await import("../lib/db.js");
getDb();

const user = createSupportUser({
  name,
  email,
  username,
  password: resolvedPassword,
});

console.log("Support account ready.");
console.log(`Email: ${user.email}`);
console.log(`Username: ${user.username}`);
console.log(`Password: ${resolvedPassword}`);
console.log("Sign in at the portal without a school code, then open /support.");
