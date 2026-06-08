import { DatabaseSync } from "node:sqlite";
import { join } from "node:path";

const dbPath = process.env.SQLITE_DATABASE_PATH || join(process.cwd(), "data", "littlecode.sqlite");
const email = process.argv[2];
if (!email) {
  console.error("Usage: node scripts/purge-orphan-user.mjs <email>");
  process.exit(1);
}

const db = new DatabaseSync(dbPath);
const user = db.prepare("SELECT id, name, username, email, role, school_id FROM users WHERE lower(email) = lower(?)").get(email);
if (!user) {
  console.log("No user found for", email);
  process.exit(0);
}

const studentId = user.id;
db.prepare("DELETE FROM study_messages WHERE student_id = ?").run(studentId);
db.prepare("DELETE FROM assignment_study_progress WHERE student_id = ?").run(studentId);
db.prepare("DELETE FROM submissions WHERE student_id = ?").run(studentId);
db.prepare("DELETE FROM class_students WHERE student_id = ?").run(studentId);
db.prepare("DELETE FROM user_profiles WHERE user_id = ?").run(studentId);
db.prepare("DELETE FROM auth_tokens WHERE user_id = ?").run(studentId);
db.prepare("DELETE FROM users WHERE id = ?").run(studentId);

console.log("Removed user:", user);
console.log(
  "Remaining match:",
  db.prepare("SELECT id, username, email, role FROM users WHERE lower(email) = lower(?)").all(email),
);
