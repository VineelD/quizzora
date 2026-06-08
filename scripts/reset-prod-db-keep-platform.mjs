/**
 * Wipe production tenant data; keep platform operators (superadmin, support).
 * Preserves password hashes exactly. Does not recreate superadmin credentials.
 *
 * Usage:
 *   node scripts/reset-prod-db-keep-platform.mjs
 *
 * Env:
 *   SQLITE_DATABASE_PATH  (default: C:\LittleCode\data\littlecode.sqlite)
 */
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

const PRODUCTION_DB = "C:\\LittleCode\\data\\littlecode.sqlite";
const PLATFORM_ROLES = ["superadmin", "support"];

const dbPath = resolve(process.env.SQLITE_DATABASE_PATH || PRODUCTION_DB);
const normalizedPath = dbPath.replace(/\//g, "\\");

if (normalizedPath.toLowerCase() !== PRODUCTION_DB.toLowerCase()) {
  console.error(JSON.stringify({ ok: false, error: "Refusing to reset non-production database", database: dbPath }));
  process.exit(1);
}

if (!existsSync(dbPath)) {
  console.error(JSON.stringify({ ok: false, error: "Database not found", database: dbPath }));
  process.exit(1);
}

const db = new DatabaseSync(dbPath);
db.exec("PRAGMA foreign_keys = ON");

const platformUsersBefore = db
  .prepare(
    `
    SELECT id, username, email, role, password_hash, created_at
    FROM users
    WHERE role IN ('superadmin', 'support')
    ORDER BY id
  `,
  )
  .all();

if (platformUsersBefore.length === 0) {
  console.error(JSON.stringify({ ok: false, error: "No platform users found; aborting" }));
  process.exit(1);
}

const countsBefore = db
  .prepare(
    `
    SELECT
      (SELECT COUNT(*) FROM users) AS users,
      (SELECT COUNT(*) FROM schools) AS schools,
      (SELECT COUNT(*) FROM families) AS families,
      (SELECT COUNT(*) FROM quizzes) AS quizzes,
      (SELECT COUNT(*) FROM submissions) AS submissions,
      (SELECT COUNT(*) FROM billing_events) AS billing_events
  `,
  )
  .get();

const clearStatements = [
  "DELETE FROM study_messages",
  "DELETE FROM assignment_study_progress",
  "DELETE FROM submissions",
  "DELETE FROM quiz_assignments",
  "DELETE FROM quiz_question_images",
  "DELETE FROM quizzes",
  "DELETE FROM class_students",
  "DELETE FROM classes",
  "DELETE FROM auth_tokens",
  "DELETE FROM support_ticket_messages",
  "DELETE FROM support_tickets",
  "DELETE FROM billing_events",
  "DELETE FROM school_monthly_usage",
  "DELETE FROM family_monthly_usage",
  "DELETE FROM user_profiles",
  "DELETE FROM audit_logs",
  "UPDATE families SET owner_user_id = NULL",
  "UPDATE users SET school_id = NULL, family_id = NULL",
  "DELETE FROM users WHERE role NOT IN ('superadmin', 'support')",
  "DELETE FROM schools",
  "DELETE FROM families",
];

db.exec("BEGIN IMMEDIATE");
try {
  for (const sql of clearStatements) {
    db.prepare(sql).run();
  }
  db.exec("COMMIT");
} catch (error) {
  db.exec("ROLLBACK");
  console.error(JSON.stringify({ ok: false, error: error.message }));
  process.exit(1);
}

const platformUsersAfter = db
  .prepare(
    `
    SELECT id, username, email, role, password_hash, created_at
    FROM users
    WHERE role IN ('superadmin', 'support')
    ORDER BY id
  `,
  )
  .all();

for (const before of platformUsersBefore) {
  const after = platformUsersAfter.find((row) => row.id === before.id);
  if (!after) {
    console.error(JSON.stringify({ ok: false, error: `Platform user missing after reset: ${before.username}` }));
    process.exit(1);
  }
  if (after.password_hash !== before.password_hash) {
    console.error(JSON.stringify({ ok: false, error: `Password hash changed for ${before.username}` }));
    process.exit(1);
  }
}

const countsAfter = db
  .prepare(
    `
    SELECT
      (SELECT COUNT(*) FROM users) AS users,
      (SELECT COUNT(*) FROM schools) AS schools,
      (SELECT COUNT(*) FROM families) AS families,
      (SELECT COUNT(*) FROM quizzes) AS quizzes,
      (SELECT COUNT(*) FROM submissions) AS submissions,
      (SELECT COUNT(*) FROM billing_events) AS billing_events
  `,
  )
  .get();

db.close();

console.log(
  JSON.stringify(
    {
      ok: true,
      database: dbPath,
      platformUsers: platformUsersAfter.map(({ id, username, email, role }) => ({ id, username, email, role })),
      countsBefore,
      countsAfter,
    },
    null,
    2,
  ),
);
