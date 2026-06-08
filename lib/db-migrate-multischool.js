import { randomBytes } from "node:crypto";

function ensureColumn(db, tableName, columnName, columnType) {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
  if (!columns.some((column) => column.name === columnName)) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnType}`);
  }
}

function slugifyName(name) {
  const base = String(name || "school")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base.slice(0, 40) || "school";
}

function uniqueSlug(db, base) {
  let slug = base;
  let suffix = 1;
  while (db.prepare("SELECT 1 FROM schools WHERE lower(slug) = lower(?)").get(slug)) {
    slug = `${base}-${suffix}`;
    suffix += 1;
  }
  return slug;
}

export function ensureMultiSchoolSchema(db) {
  ensureColumn(db, "schools", "slug", "TEXT");
  ensureColumn(db, "schools", "join_code", "TEXT");

  const schools = db.prepare("SELECT id, name, slug, join_code FROM schools").all();
  for (const school of schools) {
    const slug = school.slug || uniqueSlug(db, slugifyName(school.name));
    const joinCode = school.join_code || randomBytes(4).toString("hex").toUpperCase();
    db.prepare("UPDATE schools SET slug = ?, join_code = ? WHERE id = ?").run(slug, joinCode, school.id);
  }

  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS schools_slug_unique_idx ON schools(lower(slug))");
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS schools_join_code_unique_idx ON schools(upper(join_code))");

  ensurePerSchoolUserUniqueness(db);
}

function usersTableNames(db) {
  return db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('users', 'users_multischool')")
    .all()
    .map((row) => row.name);
}

function applyPerSchoolUserIndexes(db) {
  db.exec(`
    DROP INDEX IF EXISTS users_username_unique_idx;

    CREATE UNIQUE INDEX IF NOT EXISTS users_school_email_idx ON users(school_id, lower(email));
    CREATE UNIQUE INDEX IF NOT EXISTS users_school_username_idx ON users(school_id, lower(username));
    CREATE INDEX IF NOT EXISTS users_email_lookup_idx ON users(lower(email));
    CREATE INDEX IF NOT EXISTS users_username_lookup_idx ON users(lower(username));
    CREATE INDEX IF NOT EXISTS users_school_id_idx ON users(school_id);
  `);
}

function usersTableHasGlobalEmailUnique(db) {
  const row = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'users'").get();
  return /email\s+text\s+not\s+null\s+unique/i.test(String(row?.sql || ""));
}

function repairUsersTableGlobalEmailUnique(db) {
  if (!usersTableHasGlobalEmailUnique(db)) {
    return;
  }

  db.exec("PRAGMA foreign_keys = OFF");
  db.exec("DROP TABLE IF EXISTS users_repair");

  db.exec(`
    CREATE TABLE users_repair (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      username TEXT,
      email TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('teacher', 'student', 'admin')),
      password_hash TEXT NOT NULL,
      school_id INTEGER REFERENCES schools(id),
      email_verified_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    INSERT INTO users_repair (
      id, name, username, email, role, password_hash, school_id, email_verified_at, created_at
    )
    SELECT id, name, username, email, role, password_hash, school_id, email_verified_at, created_at
    FROM users;

    DROP TABLE users;

    ALTER TABLE users_repair RENAME TO users;
  `);

  db.exec("PRAGMA foreign_keys = ON");
  applyPerSchoolUserIndexes(db);
}

function ensurePerSchoolUserUniqueness(db) {
  const index = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'users_school_email_idx'")
    .get();
  if (index) {
    // migrate() used to recreate the legacy global username index on every boot.
    db.exec("DROP INDEX IF EXISTS users_username_unique_idx;");
    repairUsersTableGlobalEmailUnique(db);
    return;
  }

  const tables = usersTableNames(db);
  const hasUsers = tables.includes("users");
  const hasMultischool = tables.includes("users_multischool");

  if (hasUsers && hasMultischool) {
    // Recover from a partial migration that created users_multischool but never renamed it.
    db.exec("DROP TABLE users_multischool");
    applyPerSchoolUserIndexes(db);
    return;
  }

  if (!hasUsers && hasMultischool) {
    db.exec("ALTER TABLE users_multischool RENAME TO users");
    applyPerSchoolUserIndexes(db);
    return;
  }

  if (!hasUsers) {
    return;
  }

  db.exec(`
    CREATE TABLE users_multischool (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      username TEXT,
      email TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('teacher', 'student', 'admin')),
      password_hash TEXT NOT NULL,
      school_id INTEGER REFERENCES schools(id),
      email_verified_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    INSERT INTO users_multischool (
      id, name, username, email, role, password_hash, school_id, email_verified_at, created_at
    )
    SELECT id, name, username, email, role, password_hash, school_id, email_verified_at, created_at
    FROM users;

    DROP TABLE users;

    ALTER TABLE users_multischool RENAME TO users;
  `);
  applyPerSchoolUserIndexes(db);
}
