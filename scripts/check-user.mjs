import { DatabaseSync } from "node:sqlite";
import { join } from "node:path";

const dbPath = process.env.SQLITE_DATABASE_PATH || join(process.cwd(), "data", "littlecode.sqlite");
const db = new DatabaseSync(dbPath);
const email = process.argv[2] || "chaitanya.manchi@yahoo.com";
const username = process.argv[3] || "cmadamanchi";

console.log("DB:", dbPath);
console.log(
  "Users by email:",
  db.prepare("SELECT id, name, username, email, role, school_id FROM users WHERE lower(email) = lower(?)").all(email),
);
console.log(
  "Users by username:",
  db
    .prepare("SELECT id, name, username, email, role, school_id FROM users WHERE lower(username) = lower(?)")
    .all(username),
);
console.log("All users:", db.prepare("SELECT id, name, username, email, role, school_id FROM users ORDER BY id").all());
console.log("Schools:", db.prepare("SELECT id, name, join_code FROM schools").all());
console.log(
  "Pending auth_tokens:",
  db
    .prepare(
      "SELECT id, email, purpose, used_at, expires_at, metadata_json FROM auth_tokens WHERE lower(email) = lower(?)",
    )
    .all(email),
);
