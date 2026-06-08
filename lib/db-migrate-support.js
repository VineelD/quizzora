const ALLOWED_ROLES = "('teacher', 'student', 'admin', 'superadmin', 'support')";

function usersRoleCheckIncludesSupport(db) {
  const row = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'users'").get();
  return String(row?.sql || "").includes("'support'");
}

export function ensureSupportSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS support_tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      school_id INTEGER REFERENCES schools(id),
      created_by_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      subject TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'other' CHECK(category IN ('access', 'billing', 'technical', 'other')),
      status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'in_progress', 'resolved', 'closed')),
      priority TEXT NOT NULL DEFAULT 'normal' CHECK(priority IN ('normal', 'urgent')),
      assigned_to_user_id INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      resolved_at TEXT
    );

    CREATE TABLE IF NOT EXISTS support_ticket_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id INTEGER NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
      author_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      body TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS support_tickets_school_status_idx
      ON support_tickets(school_id, status, created_at DESC);

    CREATE INDEX IF NOT EXISTS support_tickets_status_created_idx
      ON support_tickets(status, created_at DESC);

    CREATE INDEX IF NOT EXISTS support_tickets_creator_idx
      ON support_tickets(created_by_user_id, created_at DESC);

    CREATE INDEX IF NOT EXISTS support_ticket_messages_ticket_idx
      ON support_ticket_messages(ticket_id, created_at ASC);
  `);

  if (usersRoleCheckIncludesSupport(db)) {
    db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS users_support_email_idx
      ON users(lower(email))
      WHERE role = 'support';
    `);
    return;
  }

  db.exec("PRAGMA foreign_keys = OFF");
  db.exec("DROP TABLE IF EXISTS users_support_migrate");

  db.exec(`
    CREATE TABLE users_support_migrate (
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

    INSERT INTO users_support_migrate (
      id, name, username, email, role, password_hash, school_id, email_verified_at, created_at
    )
    SELECT id, name, username, email, role, password_hash, school_id, email_verified_at, created_at
    FROM users;

    DROP TABLE users;
    ALTER TABLE users_support_migrate RENAME TO users;
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
  `);
}
