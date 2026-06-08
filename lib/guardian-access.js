import { createHash, randomBytes } from "node:crypto";
import { getDb, getUserById } from "./db.js";
import { buildVerificationEmail, getAppBaseUrl, sendAuthEmail } from "./mail.js";

const GUARDIAN_TTL_HOURS = 72;

function hashToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

export async function sendGuardianProgressLink(studentId) {
  const db = getDb();
  const row = db
    .prepare(
      `
      SELECT u.id, u.name, p.guardian_email
      FROM users u
      LEFT JOIN user_profiles p ON p.user_id = u.id
      WHERE u.id = ? AND u.role = 'student'
    `,
    )
    .get(studentId);

  if (!row?.guardian_email) {
    throw new Error("This student has no guardian email on file.");
  }

  const email = String(row.guardian_email).trim().toLowerCase();
  const raw = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + GUARDIAN_TTL_HOURS * 60 * 60 * 1000).toISOString();

  db.prepare(
    `
    INSERT INTO auth_tokens (email, token_hash, purpose, user_id, expires_at, metadata_json)
    VALUES (?, ?, 'guardian_view', ?, ?, ?)
  `,
  ).run(email, hashToken(raw), studentId, expiresAt, JSON.stringify({ studentName: row.name }));

  const link = `${getAppBaseUrl()}/guardian?token=${encodeURIComponent(raw)}`;
  const content = buildVerificationEmail({
    link,
    heading: "Student progress update",
    body: `View ${row.name}'s assigned work and results on Quizzora. This link expires in ${GUARDIAN_TTL_HOURS} hours.`,
  });

  await sendAuthEmail({ to: email, ...content });
  return { ok: true, email };
}

export function getGuardianStudentProgress(rawToken) {
  const token = String(rawToken || "").trim();
  if (!token) {
    throw new Error("Missing guardian link.");
  }

  const row = getDb()
    .prepare(
      `
      SELECT *
      FROM auth_tokens
      WHERE token_hash = ? AND purpose = 'guardian_view' AND used_at IS NULL
    `,
    )
    .get(hashToken(token));

  if (!row) {
    throw new Error("This guardian link is invalid or has expired.");
  }

  const expired = getDb()
    .prepare("SELECT 1 AS expired WHERE datetime(?) <= datetime('now')")
    .get(row.expires_at);
  if (expired) {
    throw new Error("This guardian link has expired.");
  }

  const studentId = row.user_id;
  const assignments = getDb()
    .prepare(
      `
      SELECT
        qa.id AS assignment_id,
        q.title,
        q.subject,
        qa.due_at,
        s.score,
        s.total,
        s.submitted_at
      FROM quiz_assignments qa
      JOIN quizzes q ON q.id = qa.quiz_id
      JOIN classes c ON c.id = qa.class_id
      JOIN class_students cs ON cs.class_id = c.id
      LEFT JOIN submissions s ON s.assignment_id = qa.id AND s.student_id = ?
      WHERE cs.student_id = ?
      ORDER BY qa.created_at DESC
    `,
    )
    .all(studentId, studentId);

  const student = getUserById(studentId);
  return {
    student: { id: student.id, name: student.name },
    assignments: assignments.map((item) => ({
      ...item,
      percent: item.total ? Math.round((item.score / item.total) * 100) : null,
      status: item.submitted_at ? "Submitted" : "Not submitted",
    })),
  };
}
