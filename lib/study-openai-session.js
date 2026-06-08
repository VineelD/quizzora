import { getDb } from "./db.js";

export function getStoredOpenAiResponseId(progress) {
  const value = String(progress?.openai_last_response_id || "").trim();
  return value || null;
}

export function saveOpenAiResponseId(studentId, assignmentId, responseId) {
  const cleanId = String(responseId || "").trim();
  if (!cleanId) {
    return;
  }

  getDb()
    .prepare(
      `
      UPDATE assignment_study_progress
      SET openai_last_response_id = ?
      WHERE student_id = ? AND assignment_id = ?
    `,
    )
    .run(cleanId, studentId, assignmentId);
}

export function clearOpenAiResponseId(studentId, assignmentId) {
  getDb()
    .prepare(
      `
      UPDATE assignment_study_progress
      SET openai_last_response_id = NULL
      WHERE student_id = ? AND assignment_id = ?
    `,
    )
    .run(studentId, assignmentId);
}

export function isOpenAiSessionExpiredError(error) {
  const message = String(error?.message || error || "").toLowerCase();
  return (
    message.includes("previous_response_id") ||
    message.includes("response not found") ||
    message.includes("invalid response") ||
    message.includes("no such response")
  );
}
