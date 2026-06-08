import { randomBytes } from "node:crypto";
import { createSuperAdminUser } from "../lib/superadmin.js";

const email = String(process.env.SUPERADMIN_EMAIL || process.argv[2] || "").trim().toLowerCase();
const password = String(process.env.SUPERADMIN_PASSWORD || process.argv[3] || "").trim();
const name = String(process.env.SUPERADMIN_NAME || "Platform Super Admin").trim();
const username = String(process.env.SUPERADMIN_USERNAME || "superadmin").trim().toLowerCase();

if (!email) {
  console.error("Usage: node scripts/create-superadmin.mjs <email> <password>");
  console.error("Or set SUPERADMIN_EMAIL and SUPERADMIN_PASSWORD in the environment.");
  process.exit(1);
}

const resolvedPassword = password || randomBytes(18).toString("base64url");

const { getDb } = await import("../lib/db.js");
getDb();

const user = createSuperAdminUser({
  name,
  email,
  username,
  password: resolvedPassword,
});

console.log("Super admin ready.");
console.log(`Email: ${user.email}`);
console.log(`Username: ${user.username}`);
console.log(`Password: ${resolvedPassword}`);
console.log("Sign in at / without a school code.");
