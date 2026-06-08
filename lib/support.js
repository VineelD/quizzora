import { hashPassword } from "./password.js";
import { getDb } from "./db.js";

export const SUPPORT_ROLE = "support";

export function isSupportRole(user) {
  return user?.role === SUPPORT_ROLE;
}

export function getSupportUserByEmail(email) {
  return (
    getDb()
      .prepare(
        `
        SELECT id, name, username, email, role, school_id, email_verified_at
        FROM users
        WHERE role = 'support' AND lower(email) = lower(?)
      `,
      )
      .get(String(email || "").trim()) || null
  );
}

export function createSupportUser({ name, email, username, password }) {
  const cleanEmail = String(email || "").trim().toLowerCase();
  const cleanName = String(name || "Support").trim();
  const cleanUsername = String(username || "support").trim().toLowerCase();
  const cleanPassword = String(password || "");

  if (!cleanEmail || !cleanPassword || cleanPassword.length < 12) {
    throw new Error("Support account requires an email and a password with at least 12 characters.");
  }

  const existing = getSupportUserByEmail(cleanEmail);
  if (existing) {
    return existing;
  }

  const conflict = getDb()
    .prepare("SELECT id, role FROM users WHERE lower(email) = lower(?) LIMIT 1")
    .get(cleanEmail);
  if (conflict) {
    throw new Error(`Email ${cleanEmail} is already used by another account.`);
  }

  const passwordHash = hashPassword(cleanPassword);
  const result = getDb()
    .prepare(
      `
      INSERT INTO users (name, username, email, role, password_hash, email_verified_at, school_id)
      VALUES (?, ?, ?, 'support', ?, CURRENT_TIMESTAMP, NULL)
    `,
    )
    .run(cleanName, cleanUsername, cleanEmail, passwordHash);

  return getDb()
    .prepare("SELECT id, name, username, email, role, school_id, email_verified_at FROM users WHERE id = ?")
    .get(Number(result.lastInsertRowid));
}

export function listSupportStaff() {
  return getDb()
    .prepare(
      `
      SELECT id, name, username, email, role, created_at
      FROM users
      WHERE role IN ('support', 'superadmin')
      ORDER BY role, name COLLATE NOCASE
    `,
    )
    .all()
    .map((row) => ({
      id: Number(row.id),
      name: row.name,
      username: row.username,
      email: row.email,
      role: row.role,
      createdAt: row.created_at,
    }));
}
