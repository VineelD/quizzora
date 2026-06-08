import { getDb } from "../lib/db.js";

const email = process.argv[2];
if (!email) {
  console.error("Usage: node scripts/delete-user.mjs <email>");
  process.exit(1);
}

const db = getDb();
const user = db.prepare("SELECT id, role, email FROM users WHERE lower(email) = lower(?)").get(email);

if (!user) {
  console.log(`No user found for ${email}`);
  process.exit(0);
}

const userId = user.id;

db.prepare("DELETE FROM auth_tokens WHERE user_id = ? OR lower(email) = lower(?)").run(userId, email);

if (user.role === "teacher") {
  db.prepare(
    `
    DELETE FROM submissions
    WHERE assignment_id IN (
      SELECT qa.id
      FROM quiz_assignments qa
      JOIN quizzes q ON q.id = qa.quiz_id
      WHERE q.teacher_id = ?
    )
  `,
  ).run(userId);
  db.prepare("DELETE FROM quiz_assignments WHERE quiz_id IN (SELECT id FROM quizzes WHERE teacher_id = ?)").run(userId);
  db.prepare("DELETE FROM quiz_question_images WHERE quiz_id IN (SELECT id FROM quizzes WHERE teacher_id = ?)").run(userId);
  db.prepare("DELETE FROM quizzes WHERE teacher_id = ?").run(userId);
  db.prepare("DELETE FROM class_students WHERE class_id IN (SELECT id FROM classes WHERE teacher_id = ?)").run(userId);
  db.prepare("DELETE FROM classes WHERE teacher_id = ?").run(userId);
} else if (user.role === "student") {
  db.prepare("DELETE FROM submissions WHERE student_id = ?").run(userId);
  db.prepare("DELETE FROM class_students WHERE student_id = ?").run(userId);
}

db.prepare("DELETE FROM users WHERE id = ?").run(userId);

const remaining = db.prepare("SELECT id FROM users WHERE lower(email) = lower(?)").get(email);
console.log(remaining ? `Delete failed for ${email}` : `Deleted ${email} (${user.role}, id ${userId})`);
