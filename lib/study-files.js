import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { getDb } from "./db.js";
import { normalizeStudyMessage } from "./study-message-normalize.js";
import {
  coachPayloadHasExportableContent,
  coachPayloadHasPdfBodyContent,
} from "./study-export-content.js";
import { getAssignmentStudyContext, studentCanAccessStudyConversation } from "./study.js";
import { buildStudyFileFilename, buildStudyFileTitle, renderStudyCoachPdf } from "./study-pdf.js";

const studyFilesRoot =
  process.env.STUDY_FILES_DIR || join(/* turbopackIgnore: true */ process.cwd(), "data", "study-files");

function getStudyMessage(studentId, assignmentId, messageId) {
  return getDb()
    .prepare(
      `
      SELECT id, role, content, payload_json, created_at
      FROM study_messages
      WHERE id = ? AND student_id = ? AND assignment_id = ?
    `,
    )
    .get(messageId, studentId, assignmentId);
}

function getLatestExportableAssistantMessage(studentId, assignmentId) {
  const rows = getDb()
    .prepare(
      `
      SELECT id, role, content, payload_json, created_at
      FROM study_messages
      WHERE student_id = ? AND assignment_id = ? AND role = 'assistant'
      ORDER BY created_at DESC, id DESC
      LIMIT 20
    `,
    )
    .all(studentId, assignmentId);

  for (const row of rows) {
    const payload = normalizeStudyMessage({
      content: row.content,
      payloadJson: row.payload_json,
    }).payload;
    if (coachPayloadHasExportableContent(payload)) {
      return { row, payload };
    }
  }

  return null;
}

function ensureStudyFilesDir(...segments) {
  const dir = join(studyFilesRoot, ...segments.map(String));
  mkdirSync(dir, { recursive: true });
  return dir;
}

function mapStudyFileRow(row) {
  return {
    id: row.id,
    assignmentId: row.assignment_id,
    messageId: row.message_id,
    title: row.title,
    filename: row.filename,
    contentType: row.content_type,
    createdAt: row.created_at,
    downloadUrl: `/api/student/study/files/${row.id}`,
  };
}

export function listStudyCoachFiles(studentId, assignmentId) {
  return getDb()
    .prepare(
      `
      SELECT id, assignment_id, message_id, title, filename, content_type, created_at
      FROM study_coach_files
      WHERE student_id = ? AND assignment_id = ?
      ORDER BY created_at DESC, id DESC
    `,
    )
    .all(studentId, assignmentId)
    .map(mapStudyFileRow);
}

export function getStudyCoachFileForStudent(studentId, fileId) {
  const row = getDb()
    .prepare(
      `
      SELECT *
      FROM study_coach_files
      WHERE id = ? AND student_id = ?
    `,
    )
    .get(fileId, studentId);

  if (!row) {
    return null;
  }

  return {
    ...mapStudyFileRow(row),
    path: row.path,
  };
}

export function readStudyCoachFileBuffer(fileRecord) {
  if (!fileRecord?.path || !existsSync(fileRecord.path)) {
    return null;
  }
  return readFileSync(fileRecord.path);
}

export async function createStudyCoachFile({
  studentId,
  assignmentId,
  messageId = null,
  assignmentTitle = "",
}) {
  if (!studentCanAccessStudyConversation(studentId, assignmentId)) {
    throw new Error("Assignment not found.");
  }

  const context = getAssignmentStudyContext(studentId, assignmentId);
  if (!context) {
    throw new Error("Assignment not found.");
  }

  let messageRow = null;
  let payload = null;

  if (messageId) {
    messageRow = getStudyMessage(studentId, assignmentId, messageId);
    if (!messageRow) {
      throw new Error("Study message not found.");
    }
    if (messageRow.role !== "assistant") {
      throw new Error("Only Study Coach replies can be saved to files.");
    }
    payload = normalizeStudyMessage({
      content: messageRow.content,
      payloadJson: messageRow.payload_json,
    }).payload;
  } else {
    const latest = getLatestExportableAssistantMessage(studentId, assignmentId);
    if (!latest) {
      throw new Error("No Study Coach message with formulas or diagrams is available yet.");
    }
    messageRow = latest.row;
    payload = latest.payload;
    messageId = messageRow.id;
  }

  if (!coachPayloadHasExportableContent(payload)) {
    throw new Error("This message has no study content to export.");
  }

  if (!coachPayloadHasPdfBodyContent(payload)) {
    throw new Error("This message has no exportable content for a PDF.");
  }

  const existing = getDb()
    .prepare(
      `
      SELECT id, assignment_id, message_id, title, filename, content_type, created_at, path
      FROM study_coach_files
      WHERE student_id = ? AND message_id = ?
    `,
    )
    .get(studentId, messageId);

  if (existing) {
    return {
      file: mapStudyFileRow(existing),
      created: false,
    };
  }

  const title = buildStudyFileTitle(payload, context);
  const pdfBuffer = await renderStudyCoachPdf({
    assignmentTitle: assignmentTitle || context.title,
    context,
    payload,
  });

  const insert = getDb().prepare(
    `
    INSERT INTO study_coach_files (student_id, assignment_id, message_id, title, filename, path)
    VALUES (?, ?, ?, ?, ?, ?)
  `,
  );

  const dir = ensureStudyFilesDir(studentId, assignmentId);
  const result = insert.run(studentId, assignmentId, messageId, title, "pending.pdf", join(dir, "pending.pdf"));
  const fileId = Number(result.lastInsertRowid);
  const filename = buildStudyFileFilename(title, fileId);
  const path = join(dir, filename);

  writeFileSync(path, pdfBuffer);

  getDb()
    .prepare(
      `
      UPDATE study_coach_files
      SET filename = ?, path = ?
      WHERE id = ? AND student_id = ?
    `,
    )
    .run(filename, path, fileId, studentId);

  const row = getDb()
    .prepare(
      `
      SELECT id, assignment_id, message_id, title, filename, content_type, created_at
      FROM study_coach_files
      WHERE id = ? AND student_id = ?
    `,
    )
    .get(fileId, studentId);

  return {
    file: mapStudyFileRow(row),
    created: true,
  };
}
