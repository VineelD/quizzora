const ALLOWED_ROLES = "('teacher', 'student', 'admin', 'superadmin')";

function usersRoleCheckIncludesSuperAdmin(db) {
  const row = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'users'").get();
  return String(row?.sql || "").includes("'superadmin'");
}

export function ensureSuperAdminSchema(db) {
  if (usersRoleCheckIncludesSuperAdmin(db)) {
    db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS users_superadmin_email_idx
      ON users(lower(email))
      WHERE role = 'superadmin';
    `);
    return;
  }

  db.exec("PRAGMA foreign_keys = OFF");
  db.exec("DROP TABLE IF EXISTS users_superadmin_migrate");

  db.exec(`
    CREATE TABLE users_superadmin_migrate (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      username TEXT,
      email TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ${ALLOWED_ROLES}),
      password_hash TEXT NOT NULL,
      school_id INTEGER REFERENCES schools(id),
      email_verified_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    INSERT INTO users_superadmin_migrate (
      id, name, username, email, role, password_hash, school_id, email_verified_at, created_at
    )
    SELECT id, name, username, email, role, password_hash, school_id, email_verified_at, created_at
    FROM users;

    DROP TABLE users;
    ALTER TABLE users_superadmin_migrate RENAME TO users;
  `);

  db.exec("PRAGMA foreign_keys = ON");
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS users_school_email_idx ON users(school_id, lower(email));
    CREATE UNIQUE INDEX IF NOT EXISTS users_school_username_idx ON users(school_id, lower(username));
    CREATE INDEX IF NOT EXISTS users_email_lookup_idx ON users(lower(email));
    CREATE INDEX IF NOT EXISTS users_username_lookup_idx ON users(lower(username));
    CREATE INDEX IF NOT EXISTS users_school_id_idx ON users(school_id);
    CREATE UNIQUE INDEX IF NOT EXISTS users_superadmin_email_idx
    ON users(lower(email))
    WHERE role = 'superadmin';
  `);
}
