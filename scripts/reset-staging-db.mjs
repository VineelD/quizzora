/**
 * Wipe staging SQLite and seed a fresh super admin.
 * Refuses to run against the production database path.
 *
 * Usage (from repo root, with staging env loaded):
 *   node scripts/reset-staging-db.mjs
 */
import { randomBytes } from "node:crypto";
import { existsSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { createSuperAdminUser } from "../lib/superadmin.js";

const PRODUCTION_DB = "C:\\LittleCode\\data\\littlecode.sqlite";
const DEFAULT_STAGING_DB = "C:\\LittleCode-test\\data\\littlecode.sqlite";

const dbPath = process.env.SQLITE_DATABASE_PATH || DEFAULT_STAGING_DB;
const normalizedPath = dbPath.replace(/\//g, "\\");

if (normalizedPath.toLowerCase() === PRODUCTION_DB.toLowerCase()) {
  console.error("Refusing to reset production database:", dbPath);
  process.exit(1);
}

if (!normalizedPath.toLowerCase().includes("littlecode-test")) {
  console.error("Refusing to reset database outside LittleCode-test:", dbPath);
  process.exit(1);
}

function sleepMs(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function removeDbFiles(targetPath) {
  for (const suffix of ["-wal", "-shm", ""]) {
    const file = suffix ? `${targetPath}${suffix}` : targetPath;
    if (!existsSync(file)) {
      continue;
    }

    for (let attempt = 0; attempt < 12; attempt += 1) {
      try {
        unlinkSync(file);
        console.error("Removed", file);
        break;
      } catch (error) {
        if (error?.code !== "EBUSY" || attempt === 11) {
          return false;
        }
        sleepMs(500);
      }
    }
  }

  return !existsSync(targetPath);
}

let activeDbPath = dbPath;
if (!removeDbFiles(activeDbPath)) {
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
  activeDbPath = join(dirname(dbPath), `littlecode-reset-${stamp}.sqlite`);
  console.error("Database locked; using fresh path:", activeDbPath);
  process.env.SQLITE_DATABASE_PATH = activeDbPath;
}

const { getDb } = await import("../lib/db.js");
getDb();

const username = String(process.env.SUPERADMIN_USERNAME || "superadmin").trim().toLowerCase();
const email = String(process.env.SUPERADMIN_EMAIL || "superadmin@staging.quizzora.org")
  .trim()
  .toLowerCase();
const name = String(process.env.SUPERADMIN_NAME || "Platform Super Admin").trim();
const password =
  String(process.env.SUPERADMIN_PASSWORD || "").trim() ||
  randomBytes(18).toString("base64url");

const user = createSuperAdminUser({ name, email, username, password });

const counts = getDb()
  .prepare(
    `
    SELECT
      (SELECT COUNT(*) FROM users) AS users,
      (SELECT COUNT(*) FROM schools) AS schools,
      (SELECT COUNT(*) FROM families) AS families,
      (SELECT COUNT(*) FROM quizzes) AS quizzes
  `,
  )
  .get();

console.log(
  JSON.stringify(
    {
      ok: true,
      database: activeDbPath,
      superadmin: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        password,
      },
      counts,
    },
    null,
    2,
  ),
);
