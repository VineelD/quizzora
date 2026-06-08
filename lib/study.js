import { logAudit } from "./audit.js";
import { isSudokuAssignment } from "./assignment-categories.js";
import { getDb, getUserById } from "./db.js";
import { getStudyMaxMessagesForTenantType, resolveTenantTypeForUser } from "./plans.js";
import { generateStudyCoachReply } from "./study-coach.js";
import { normalizeStudyMessage } from "./study-message-payload.js";
import {
  clearOpenAiResponseId,
  getStoredOpenAiResponseId,
  isOpenAiSessionExpiredError,
  saveOpenAiResponseId,
} from "./study-openai-session.js";
import {
  accumulateQualifiedStudySeconds,
  getStudyUnlockRequirements,
  getUnlockProgress,
  isQuizUnlocked,
  isStudyCoachEnabled,
} from "./study-progress.js";

const WELCOME_MESSAGE =
  "Welcome to Study Coach. I'll explain this topic step by step — often with labelled diagrams you reveal one step at a time. Ask questions, try mini challenges, and stay on-topic for about 30 minutes of focused study to unlock the quiz. I will not give you answers to the graded assessment.";

function getStudyUnlockRequirementsForStudent(studentId) {
  const user = getUserById(studentId);
  const tenantType = resolveTenantTypeForUser(user);
  const maxMessagesPerAssignment = tenantType
    ? getStudyMaxMessagesForTenantType(tenantType)
    : undefined;
  return getStudyUnlockRequirements({ maxMessagesPerAssignment });
}

export function studyCoachAvailableForAssignment(assignment) {
  if (!isStudyCoachEnabled()) {
    return false;
  }
  if (!assignment) {
    return false;
  }
  return !isSudokuAssignment(assignment);
}

export function studyCoachRequiredForAssignment(assignment) {
  if (!studyCoachAvailableForAssignment(assignment)) {
    return false;
  }
  if (assignment.submitted_at) {
    return false;
  }
  return true;
}

export function studentCanAccessStudyConversation(studentId, assignmentId) {
  return Boolean(getAssignmentStudyContext(studentId, assignmentId));
}

export function getAssignmentStudyContext(studentId, assignmentId) {
  const row = getDb()
    .prepare(
      `
      SELECT
        qa.id AS assignment_id,
        q.title,
        q.subject,
        q.focus,
        q.year_level,
        q.curriculum_summary,
        q.learning_intentions_json,
        q.selected_topics_json,
        q.selected_subtopics_json
      FROM quiz_assignments qa
      JOIN quizzes q ON q.id = qa.quiz_id
      JOIN classes c ON c.id = qa.class_id
      JOIN class_students cs ON cs.class_id = c.id
      WHERE cs.student_id = ? AND qa.id = ?
    `,
    )
    .get(studentId, assignmentId);

  if (!row) {
    return null;
  }

  return {
    assignmentId: Number(row.assignment_id),
    title: row.title,
    subject: row.subject,
    focus: row.focus,
    yearLevel: row.year_level,
    curriculumSummary: row.curriculum_summary,
    learningIntentions: JSON.parse(row.learning_intentions_json || "[]"),
    selectedTopicKeys: JSON.parse(row.selected_topics_json || "[]"),
    selectedSubtopics: JSON.parse(row.selected_subtopics_json || "[]"),
  };
}

function getOrCreateProgress(studentId, assignmentId) {
  const db = getDb();
  const existing = db
    .prepare(
      `
      SELECT *
      FROM assignment_study_progress
      WHERE student_id = ? AND assignment_id = ?
    `,
    )
    .get(studentId, assignmentId);

  if (existing) {
    return existing;
  }

  db.prepare(
    `
    INSERT INTO assignment_study_progress (student_id, assignment_id)
    VALUES (?, ?)
  `,
  ).run(studentId, assignmentId);

  return db
    .prepare(
      `
      SELECT *
      FROM assignment_study_progress
      WHERE student_id = ? AND assignment_id = ?
    `,
    )
    .get(studentId, assignmentId);
}

function listStudyMessages(studentId, assignmentId, limit = 80) {
  return getDb()
    .prepare(
      `
      SELECT id, role, content, flagged, on_topic, payload_json, created_at
      FROM study_messages
      WHERE student_id = ? AND assignment_id = ?
      ORDER BY created_at ASC, id ASC
      LIMIT ?
    `,
    )
    .all(studentId, assignmentId, limit)
    .map((row) =>
      normalizeStudyMessage({
        id: row.id,
        role: row.role,
        content: row.content,
        flagged: row.flagged === 1,
        onTopic: row.on_topic == null ? null : row.on_topic === 1,
        payloadJson: row.payload_json || null,
        createdAt: row.created_at,
      }),
    );
}

function insertStudyMessage({
  studentId,
  assignmentId,
  role,
  content,
  flagged = false,
  onTopic = null,
  payload = null,
}) {
  const payloadJson = payload ? JSON.stringify(payload) : null;
  const result = getDb()
    .prepare(
      `
      INSERT INTO study_messages (student_id, assignment_id, role, content, flagged, on_topic, payload_json)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    )
    .run(
      studentId,
      assignmentId,
      role,
      String(content).trim(),
      flagged ? 1 : 0,
      onTopic == null ? null : onTopic ? 1 : 0,
      payloadJson,
    );
  return Number(result.lastInsertRowid);
}

function recordStudentStudyActivity(studentId, assignmentId, { onTopic }) {
  const db = getDb();
  const now = new Date();
  const progress = getOrCreateProgress(studentId, assignmentId);
  const qualifiedSeconds = accumulateQualifiedStudySeconds(progress, { onTopic, now });
  const nowIso = now.toISOString();

  db.prepare(
    `
    UPDATE assignment_study_progress
    SET
      student_message_count = student_message_count + 1,
      session_started_at = COALESCE(session_started_at, ?),
      last_active_at = ?,
      qualified_study_seconds = ?,
      last_qualified_at = CASE WHEN ? THEN ? ELSE last_qualified_at END,
      on_topic_message_count = on_topic_message_count + ?
    WHERE student_id = ? AND assignment_id = ?
  `,
  ).run(
    nowIso,
    nowIso,
    qualifiedSeconds,
    onTopic ? 1 : 0,
    nowIso,
    onTopic ? 1 : 0,
    studentId,
    assignmentId,
  );

  return db
    .prepare(
      `
      SELECT *
      FROM assignment_study_progress
      WHERE student_id = ? AND assignment_id = ?
    `,
    )
    .get(studentId, assignmentId);
}

function touchProgress(studentId, assignmentId) {
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `
    UPDATE assignment_study_progress
    SET last_active_at = ?
    WHERE student_id = ? AND assignment_id = ?
  `,
    )
    .run(now, studentId, assignmentId);
}

function maybeUnlockQuiz(studentId, assignmentId, progress) {
  if (progress.quiz_unlocked_at || !isQuizUnlocked(progress)) {
    return progress;
  }

  const unlockedAt = new Date().toISOString();
  getDb()
    .prepare(
      `
      UPDATE assignment_study_progress
      SET quiz_unlocked_at = ?
      WHERE student_id = ? AND assignment_id = ?
    `,
    )
    .run(unlockedAt, studentId, assignmentId);

  logAudit({
    actorId: studentId,
    actorRole: "student",
    action: "study.quiz_unlocked",
    entityType: "assignment",
    entityId: assignmentId,
    summary: "Quiz unlocked after topic-focused study time completed",
    metadata: getUnlockProgress({ ...progress, quiz_unlocked_at: unlockedAt }),
  });

  return getDb()
    .prepare(
      `
      SELECT *
      FROM assignment_study_progress
      WHERE student_id = ? AND assignment_id = ?
    `,
    )
    .get(studentId, assignmentId);
}

export function getStudySession(studentId, assignmentId) {
  const context = getAssignmentStudyContext(studentId, assignmentId);
  if (!context) {
    return null;
  }

  const progress = getOrCreateProgress(studentId, assignmentId);
  let messages = listStudyMessages(studentId, assignmentId);

  if (!messages.length) {
    insertStudyMessage({
      studentId,
      assignmentId,
      role: "system",
      content: WELCOME_MESSAGE,
    });
    messages = listStudyMessages(studentId, assignmentId);
  }

  const unlockedProgress = maybeUnlockQuiz(studentId, assignmentId, progress);

  return {
    context,
    requirements: getStudyUnlockRequirementsForStudent(studentId),
    progress: getUnlockProgress(unlockedProgress),
    messages,
    enabled: isStudyCoachEnabled(),
    openAiResponseId: getStoredOpenAiResponseId(unlockedProgress),
    quizSubmitted: Boolean(getStudentAssignmentSubmitted(studentId, assignmentId)),
  };
}

function getStudentAssignmentSubmitted(studentId, assignmentId) {
  const row = getDb()
    .prepare(
      `
      SELECT s.submitted_at
      FROM submissions s
      JOIN quiz_assignments qa ON qa.id = s.assignment_id
      JOIN classes c ON c.id = qa.class_id
      JOIN class_students cs ON cs.class_id = c.id AND cs.student_id = s.student_id
      WHERE s.student_id = ? AND s.assignment_id = ?
      LIMIT 1
    `,
    )
    .get(studentId, assignmentId);
  return Boolean(row?.submitted_at);
}

export async function postStudyMessage({ studentId, assignmentId, message, requestNarration = false }) {
  const context = getAssignmentStudyContext(studentId, assignmentId);
  if (!context) {
    throw new Error("Assignment not found.");
  }

  const trimmed = String(message || "").trim();
  if (!trimmed) {
    throw new Error("Message is required.");
  }
  if (trimmed.length > 2000) {
    throw new Error("Message is too long.");
  }

  const requirements = getStudyUnlockRequirementsForStudent(studentId);
  const totalMessages = getDb()
    .prepare(
      `
      SELECT COUNT(*) AS count
      FROM study_messages
      WHERE student_id = ? AND assignment_id = ? AND role = 'student'
    `,
    )
    .get(studentId, assignmentId);

  if (Number(totalMessages.count) >= requirements.maxMessagesPerAssignment) {
    throw new Error("You have reached the study message limit for this assignment.");
  }

  const progress = getOrCreateProgress(studentId, assignmentId);
  const previousResponseId = getStoredOpenAiResponseId(progress);
  const allHistory = listStudyMessages(studentId, assignmentId).filter(
    (entry) => entry.role === "student" || entry.role === "assistant",
  );
  const history = allHistory.slice(-12);
  const assignmentSubmitted = Boolean(getStudentAssignmentSubmitted(studentId, assignmentId));

  let coach;
  try {
    coach = await generateStudyCoachReply({
      context,
      history,
      message: trimmed,
      previousResponseId,
      requestNarration: Boolean(requestNarration),
    });
  } catch (error) {
    if (previousResponseId && isOpenAiSessionExpiredError(error)) {
      clearOpenAiResponseId(studentId, assignmentId);
      coach = await generateStudyCoachReply({
        context,
        history: allHistory.slice(-24),
        message: trimmed,
        previousResponseId: null,
        requestNarration: Boolean(requestNarration),
      });
    } else {
      throw error;
    }
  }

  if (coach.responseId) {
    saveOpenAiResponseId(studentId, assignmentId, coach.responseId);
  }

  const studentOnTopic = coach.flagged ? false : coach.onTopic;

  insertStudyMessage({
    studentId,
    assignmentId,
    role: "student",
    content: trimmed,
    flagged: coach.flagged,
    onTopic: studentOnTopic,
  });

  const updatedProgress = assignmentSubmitted
    ? touchProgressOnly(studentId, assignmentId)
    : recordStudentStudyActivity(studentId, assignmentId, { onTopic: studentOnTopic });

  insertStudyMessage({
    studentId,
    assignmentId,
    role: "assistant",
    content: coach.content,
    flagged: coach.flagged,
    onTopic: studentOnTopic,
    payload: coach.payload || null,
  });

  if (!assignmentSubmitted) {
    touchProgress(studentId, assignmentId);
  }
  const finalProgress = assignmentSubmitted
    ? getOrCreateProgress(studentId, assignmentId)
    : maybeUnlockQuiz(studentId, assignmentId, updatedProgress);

  logAudit({
    actorId: studentId,
    actorRole: "student",
    action: coach.flagged ? "study.refusal" : studentOnTopic ? "study.message" : "study.off_topic",
    entityType: "assignment",
    entityId: assignmentId,
    summary: coach.flagged
      ? "Study Coach refused a quiz-help request"
      : studentOnTopic
        ? "Student used Study Coach on topic"
        : "Student sent an off-topic Study Coach message",
    metadata: { source: coach.source, flagged: coach.flagged, onTopic: studentOnTopic },
  });

  return {
    reply: coach.content,
    payload: coach.payload || null,
    flagged: coach.flagged,
    onTopic: studentOnTopic,
    followUps: coach.followUps || [],
    progress: getUnlockProgress(finalProgress),
    messages: listStudyMessages(studentId, assignmentId),
    openAiResponseId: coach.responseId || getStoredOpenAiResponseId(finalProgress),
    quizSubmitted: assignmentSubmitted,
  };
}

function touchProgressOnly(studentId, assignmentId) {
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `
      UPDATE assignment_study_progress
      SET last_active_at = ?
      WHERE student_id = ? AND assignment_id = ?
    `,
    )
    .run(now, studentId, assignmentId);
  return getOrCreateProgress(studentId, assignmentId);
}

export function assertQuizUnlockedForSubmit(studentId, assignmentId, assignment) {
  if (!studyCoachRequiredForAssignment(assignment)) {
    return;
  }

  const progress = getOrCreateProgress(studentId, assignmentId);
  const unlockedProgress = maybeUnlockQuiz(studentId, assignmentId, progress);
  if (!isQuizUnlocked(unlockedProgress)) {
    const unlock = getUnlockProgress(unlockedProgress);
    const minutesStudied = Math.floor(unlock.qualifiedStudySeconds / 60);
    const minutesRequired = Math.ceil(unlock.minQualifiedStudySeconds / 60);
    throw new Error(
      `Complete ${minutesRequired} minutes of topic-focused Study Coach first (${minutesStudied}/${minutesRequired} min). Keep chatting about ${assignment.focus || "this topic"}.`,
    );
  }
}
