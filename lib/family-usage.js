import { getDb } from "./db.js";

function currentMonthKey() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function countFamilyParents(familyId) {
  return getDb()
    .prepare("SELECT COUNT(*) AS count FROM users WHERE family_id = ? AND role = 'parent'")
    .get(Number(familyId)).count;
}

export function countFamilyStudents(familyId) {
  return getDb()
    .prepare("SELECT COUNT(*) AS count FROM users WHERE family_id = ? AND role = 'student'")
    .get(Number(familyId)).count;
}

export function getFamilyAiQuizUsage(familyId, monthKey = currentMonthKey()) {
  const row = getDb()
    .prepare(
      `
      SELECT ai_quiz_count
      FROM family_monthly_usage
      WHERE family_id = ? AND month_key = ?
    `,
    )
    .get(Number(familyId), monthKey);
  return row ? Number(row.ai_quiz_count) : 0;
}

export function incrementFamilyAiQuizUsage(familyId, amount = 1) {
  const monthKey = currentMonthKey();
  getDb()
    .prepare(
      `
      INSERT INTO family_monthly_usage (family_id, month_key, ai_quiz_count)
      VALUES (?, ?, ?)
      ON CONFLICT(family_id, month_key) DO UPDATE SET
        ai_quiz_count = ai_quiz_count + excluded.ai_quiz_count
    `,
    )
    .run(Number(familyId), monthKey, amount);
  return getFamilyAiQuizUsage(familyId, monthKey);
}

export function getFamilyUsageSnapshot(familyId) {
  return {
    parents: countFamilyParents(familyId),
    students: countFamilyStudents(familyId),
    aiQuizzesThisMonth: getFamilyAiQuizUsage(familyId),
    monthKey: currentMonthKey(),
  };
}
