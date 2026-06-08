import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { after, test } from "node:test";
import { ensureBillingSchema } from "../lib/db-migrate-billing.js";
import { ensureMultiSchoolSchema } from "../lib/db-migrate-multischool.js";
import { ensureSchoolsAndAudit } from "../lib/db-migrate-extra.js";

test("recovers partial users_multischool migration and applies billing schema", () => {
  const tempDir = mkdtempSync(join(tmpdir(), "littlecode-migrate-recovery-"));
  const dbPath = join(tempDir, "recovery.sqlite");

  try {
    const db = new DatabaseSync(dbPath);
    db.exec("PRAGMA foreign_keys = ON");

    db.exec(`
      CREATE TABLE schools (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        allow_late_submissions INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      INSERT INTO schools (name) VALUES ('Recovery School');

      CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        username TEXT,
        email TEXT NOT NULL,
        role TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        school_id INTEGER,
        email_verified_at TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      INSERT INTO users (name, username, email, role, password_hash, school_id)
      VALUES ('Teacher', 'teacher', 'teacher@recovery.example', 'teacher', 'hash', 1);

      CREATE TABLE users_multischool (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        username TEXT,
        email TEXT NOT NULL,
        role TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        school_id INTEGER,
        email_verified_at TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    ensureSchoolsAndAudit(db);
    ensureBillingSchema(db);
    ensureMultiSchoolSchema(db);

    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all()
      .map((row) => row.name);
    assert.ok(tables.includes("school_monthly_usage"));
    assert.ok(tables.includes("users"));
    assert.equal(tables.includes("users_multischool"), false);

    const billingCols = db.prepare("PRAGMA table_info(schools)").all().map((col) => col.name);
    assert.ok(billingCols.includes("subscription_status"));

    const index = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'users_school_email_idx'")
      .get();
    assert.ok(index);

    db.close();
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});
