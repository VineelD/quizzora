export function ensureSchoolsAndAudit(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schools (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      allow_late_submissions INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      actor_role TEXT,
      action TEXT NOT NULL,
      entity_type TEXT,
      entity_id TEXT,
      summary TEXT NOT NULL DEFAULT '',
      metadata_json TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS audit_logs_created_idx ON audit_logs(created_at);
  `);

  ensureColumn(db, "users", "school_id", "INTEGER REFERENCES schools(id)");

  let school = db.prepare("SELECT id FROM schools ORDER BY id LIMIT 1").get();
  if (!school) {
    const result = db.prepare("INSERT INTO schools (name) VALUES (?)").run("Default school");
    school = { id: Number(result.lastInsertRowid) };
  }

  // Parents and platform operators stay without a school_id. Assigning parents to the
  // default school can violate users_school_username_idx when the same username exists
  // on that school already (e.g. a teacher account).
  const userColumns = db.prepare("PRAGMA table_info(users)").all();
  const hasFamilyId = userColumns.some((column) => column.name === "family_id");
  const familyClause = hasFamilyId ? "AND family_id IS NULL" : "";
  db.prepare(
    `
    UPDATE users
    SET school_id = ?
    WHERE school_id IS NULL
      ${familyClause}
      AND role NOT IN ('superadmin', 'support', 'parent')
  `,
  ).run(school.id);
}

export function ensureAuthTokenGuardianPurpose(db) {
  const row = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'auth_tokens'").get();
  if (row?.sql?.includes("guardian_view")) {
    return;
  }

  db.exec(`
    CREATE TABLE auth_tokens_migrated (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      purpose TEXT NOT NULL CHECK(purpose IN ('login', 'register', 'invite', 'reset_password', 'guardian_view')),
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      role TEXT,
      name TEXT,
      metadata_json TEXT,
      expires_at TEXT NOT NULL,
      used_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    INSERT INTO auth_tokens_migrated (
      id, email, token_hash, purpose, user_id, role, name, metadata_json, expires_at, used_at, created_at
    )
    SELECT
      id, email, token_hash, purpose, user_id, role, name, metadata_json, expires_at, used_at, created_at
    FROM auth_tokens;

    DROP TABLE auth_tokens;
    ALTER TABLE auth_tokens_migrated RENAME TO auth_tokens;
    CREATE INDEX IF NOT EXISTS auth_tokens_email_created_idx ON auth_tokens(lower(email), created_at);
  `);
}

function ensureColumn(db, tableName, columnName, columnType) {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
  if (!columns.some((column) => column.name === columnName)) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnType}`);
  }
}
