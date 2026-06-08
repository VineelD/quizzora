import { getDb } from "./db.js";

export function logAudit({
  actorId = null,
  actorRole = null,
  action,
  entityType = null,
  entityId = null,
  summary = "",
  metadata = null,
}) {
  if (!action) {
    return;
  }

  getDb()
    .prepare(
      `
      INSERT INTO audit_logs (actor_id, actor_role, action, entity_type, entity_id, summary, metadata_json)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    )
    .run(
      actorId,
      actorRole,
      action,
      entityType,
      entityId != null ? String(entityId) : null,
      String(summary || "").slice(0, 500),
      metadata ? JSON.stringify(metadata) : null,
    );
}

function parseMetadata(metadataJson) {
  if (!metadataJson) {
    return null;
  }
  try {
    return JSON.parse(metadataJson);
  } catch {
    return null;
  }
}

export function listAuditLogsForSchool(schoolId, { limit = 100, offset = 0 } = {}) {
  const resolvedSchoolId = Number(schoolId);
  if (!resolvedSchoolId) {
    return [];
  }

  const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 500);
  const safeOffset = Math.max(Number(offset) || 0, 0);

  return getDb()
    .prepare(
      `
      SELECT
        a.id,
        a.actor_id,
        a.actor_role,
        a.action,
        a.entity_type,
        a.entity_id,
        a.summary,
        a.metadata_json,
        a.created_at,
        u.name AS actor_name,
        u.email AS actor_email,
        u.username AS actor_username
      FROM audit_logs a
      LEFT JOIN users u ON u.id = a.actor_id
      WHERE a.actor_id IN (SELECT id FROM users WHERE school_id = ?)
         OR (a.entity_type = 'school' AND a.entity_id = ?)
         OR (
           a.entity_type = 'assignment'
           AND a.entity_id IN (
             SELECT CAST(qa.id AS TEXT)
             FROM quiz_assignments qa
             JOIN classes c ON c.id = qa.class_id
             JOIN users t ON t.id = c.teacher_id
             WHERE t.school_id = ?
           )
         )
      ORDER BY a.created_at DESC
      LIMIT ? OFFSET ?
    `,
    )
    .all(resolvedSchoolId, String(resolvedSchoolId), resolvedSchoolId, safeLimit, safeOffset)
    .map((row) => ({
      id: row.id,
      actorId: row.actor_id,
      actorRole: row.actor_role,
      actorName: row.actor_name || "System",
      actorEmail: row.actor_email || "",
      actorUsername: row.actor_username || "",
      action: row.action,
      entityType: row.entity_type,
      entityId: row.entity_id,
      summary: row.summary,
      metadata: parseMetadata(row.metadata_json),
      createdAt: row.created_at,
    }));
}

export function countAuditLogsForSchool(schoolId) {
  const resolvedSchoolId = Number(schoolId);
  if (!resolvedSchoolId) {
    return 0;
  }

  return getDb()
    .prepare(
      `
      SELECT COUNT(*) AS count
      FROM audit_logs a
      WHERE a.actor_id IN (SELECT id FROM users WHERE school_id = ?)
         OR (a.entity_type = 'school' AND a.entity_id = ?)
         OR (
           a.entity_type = 'assignment'
           AND a.entity_id IN (
             SELECT CAST(qa.id AS TEXT)
             FROM quiz_assignments qa
             JOIN classes c ON c.id = qa.class_id
             JOIN users t ON t.id = c.teacher_id
             WHERE t.school_id = ?
           )
         )
    `,
    )
    .get(resolvedSchoolId, String(resolvedSchoolId), resolvedSchoolId).count;
}
