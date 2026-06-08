const ALLOWED_ROLES = "('teacher', 'student', 'admin', 'superadmin', 'support', 'parent')";

function usersRoleCheckIncludesParent(db) {
  const row = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'users'").get();
  return String(row?.sql || "").includes("'parent'");
}

function usersTableHasFamilyId(db) {
  const columns = db.prepare("PRAGMA table_info(users)").all();
  return columns.some((column) => column.name === "family_id");
}

export function ensureFamilySchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS families (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      slug TEXT NOT NULL,
      join_code TEXT NOT NULL,
      owner_user_id INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE UNIQUE INDEX IF NOT EXISTS families_slug_unique_idx ON families(lower(slug));
    CREATE UNIQUE INDEX IF NOT EXISTS families_join_code_unique_idx ON families(upper(join_code));
  `);

  if (!usersTableHasFamilyId(db)) {
    db.exec("ALTER TABLE users ADD COLUMN family_id INTEGER REFERENCES families(id)");
  }

  if (usersRoleCheckIncludesParent(db)) {
    db.exec(`
      CREATE INDEX IF NOT EXISTS users_family_id_idx ON users(family_id);
      CREATE UNIQUE INDEX IF NOT EXISTS users_family_email_idx ON users(family_id, lower(email));
      CREATE UNIQUE INDEX IF NOT EXISTS users_family_username_idx ON users(family_id, lower(username));
    `);
    return;
  }

  db.exec("PRAGMA foreign_keys = OFF");
  db.exec("DROP TABLE IF EXISTS users_family_migrate");

  db.exec(`
    CREATE TABLE users_family_migrate (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      username TEXT,
      email TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ${ALLOWED_ROLES}),
      password_hash TEXT NOT NULL,
      school_id INTEGER REFERENCES schools(id),
      family_id INTEGER REFERENCES families(id),
      email_verified_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    INSERT INTO users_family_migrate (
      id, name, username, email, role, password_hash, school_id, family_id, email_verified_at, created_at
    )
    SELECT id, name, username, email, role, password_hash, school_id, family_id, email_verified_at, created_at
    FROM users;

    DROP TABLE users;
    ALTER TABLE users_family_migrate RENAME TO users;
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
    CREATE UNIQUE INDEX IF NOT EXISTS users_support_email_idx
      ON users(lower(email))
      WHERE role = 'support';
    CREATE INDEX IF NOT EXISTS users_family_id_idx ON users(family_id);
    CREATE UNIQUE INDEX IF NOT EXISTS users_family_email_idx ON users(family_id, lower(email));
    CREATE UNIQUE INDEX IF NOT EXISTS users_family_username_idx ON users(family_id, lower(username));
  `);
}
