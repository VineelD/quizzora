/**
 * Replace legacy @app2-cheetah.site addresses with @quizzora.org in SQLite.
 * Updates users.email and auth_tokens.email for matching rows.
 *
 * Usage: node scripts/migrate-domain-emails.mjs [--dry-run]
 */
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = join(root, ".env.local");
const dryRun = process.argv.includes("--dry-run");

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

const OLD_SUFFIX = "@app2-cheetah.site";
const NEW_SUFFIX = "@quizzora.org";

const { getDb } = await import("../lib/db.js");
const db = getDb();

function replaceDomain(email) {
  const lower = String(email || "").toLowerCase();
  if (!lower.endsWith(OLD_SUFFIX)) {
    return null;
  }
  return email.slice(0, email.length - OLD_SUFFIX.length) + NEW_SUFFIX;
}

const users = db
  .prepare(
    `SELECT id, role, email, username FROM users WHERE lower(email) LIKE '%@app2-cheetah.site' ORDER BY role, email`,
  )
  .all();

const tokenCount = db
  .prepare(`SELECT COUNT(*) AS c FROM auth_tokens WHERE lower(email) LIKE '%@app2-cheetah.site'`)
  .get().c;

console.log(dryRun ? "DRY RUN — no writes" : "Migrating legacy domain emails");
console.log(`  users to update: ${users.length}`);
console.log(`  auth_tokens to update: ${tokenCount}`);

if (users.length === 0 && tokenCount === 0) {
  console.log("Nothing to migrate.");
  process.exit(0);
}

for (const user of users) {
  const nextEmail = replaceDomain(user.email);
  console.log(`  ${user.role} ${user.email} -> ${nextEmail}`);
}

if (dryRun) {
  process.exit(0);
}

const updateUser = db.prepare(`UPDATE users SET email = ? WHERE id = ?`);
const updateToken = db.prepare(
  `UPDATE auth_tokens SET email = ? WHERE lower(email) = lower(?)`,
);

db.exec("BEGIN");
try {
  for (const user of users) {
    const nextEmail = replaceDomain(user.email);
    const conflict = db
      .prepare(`SELECT id, role FROM users WHERE lower(email) = lower(?) AND id != ?`)
      .get(nextEmail, user.id);
    if (conflict) {
      throw new Error(
        `Cannot migrate user ${user.id} (${user.email}): ${nextEmail} already used by ${conflict.role} id ${conflict.id}`,
      );
    }
    updateUser.run(nextEmail, user.id);
  }

  const tokens = db
    .prepare(`SELECT id, email FROM auth_tokens WHERE lower(email) LIKE '%@app2-cheetah.site'`)
    .all();
  for (const token of tokens) {
    const nextEmail = replaceDomain(token.email);
    updateToken.run(nextEmail, token.email);
  }
  db.exec("COMMIT");
} catch (error) {
  db.exec("ROLLBACK");
  throw error;
}
console.log("Migration complete.");

const remaining = db
  .prepare(`SELECT COUNT(*) AS c FROM users WHERE lower(email) LIKE '%@app2-cheetah.site'`)
  .get().c;
console.log(`  remaining users with old domain: ${remaining}`);
