import { getDb } from "./db.js";

function currentMonthKey() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function countSchoolStudents(schoolId) {
  return getDb()
    .prepare("SELECT COUNT(*) AS count FROM users WHERE school_id = ? AND role = 'student'")
    .get(Number(schoolId)).count;
}

export function countSchoolTeachers(schoolId) {
  return getDb()
    .prepare("SELECT COUNT(*) AS count FROM users WHERE school_id = ? AND role = 'teacher'")
    .get(Number(schoolId)).count;
}

export function getSchoolAiQuizUsage(schoolId, monthKey = currentMonthKey()) {
  const row = getDb()
    .prepare(
      `
      SELECT ai_quiz_count
      FROM school_monthly_usage
      WHERE school_id = ? AND month_key = ?
    `,
    )
    .get(Number(schoolId), monthKey);
  return row ? Number(row.ai_quiz_count) : 0;
}

export function incrementSchoolAiQuizUsage(schoolId, amount = 1) {
  const monthKey = currentMonthKey();
  getDb()
    .prepare(
      `
      INSERT INTO school_monthly_usage (school_id, month_key, ai_quiz_count)
      VALUES (?, ?, ?)
      ON CONFLICT(school_id, month_key) DO UPDATE SET
        ai_quiz_count = ai_quiz_count + excluded.ai_quiz_count
    `,
    )
    .run(Number(schoolId), monthKey, amount);
  return getSchoolAiQuizUsage(schoolId, monthKey);
}

export function countSchoolAssignments(schoolId) {
  return getDb()
    .prepare(
      `
      SELECT COUNT(*) AS count
      FROM quiz_assignments qa
      JOIN classes c ON c.id = qa.class_id
      JOIN users u ON u.id = c.teacher_id
      WHERE u.school_id = ?
    `,
    )
    .get(Number(schoolId)).count;
}

export function getSchoolUsageSnapshot(schoolId) {
  return {
    teachers: countSchoolTeachers(schoolId),
    students: countSchoolStudents(schoolId),
    aiQuizzesThisMonth: getSchoolAiQuizUsage(schoolId),
    monthKey: currentMonthKey(),
  };
}
