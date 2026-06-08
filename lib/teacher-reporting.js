import { logAudit } from "./audit.js";
import { parseFocusLabel } from "./curriculum-topics.js";
import { getDb, getTeacherStudent } from "./db.js";

export const DEFAULT_MASTERY_LIMIT = 20;
export const TREND_THRESHOLD_POINTS = 5;

/**
 * Compare earlier vs later assignment averages to label mastery direction.
 * @param {number[]} assignmentAverages Chronological average % per assignment (oldest first).
 * @returns {'up'|'down'|'flat'}
 */
export function computeTrend(assignmentAverages) {
  const scores = (assignmentAverages || []).filter((value) => Number.isFinite(value));
  if (scores.length < 2) {
    return "flat";
  }

  const midpoint = Math.floor(scores.length / 2);
  const early = scores.slice(0, midpoint);
  const late = scores.slice(midpoint);
  const average = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;
  const delta = average(late) - average(early);

  if (delta >= TREND_THRESHOLD_POINTS) {
    return "up";
  }
  if (delta <= -TREND_THRESHOLD_POINTS) {
    return "down";
  }
  return "flat";
}

function teacherOwnsClass(db, teacherId, classId) {
  return Boolean(db.prepare("SELECT id FROM classes WHERE id = ? AND teacher_id = ?").get(classId, teacherId));
}

function fetchSubmissionRows(db, { teacherId, classId, studentId, fromDate, toDate }) {
  const conditions = ["q.teacher_id = ?", "q.subject != 'Sudoku'", "s.submitted_at IS NOT NULL", "s.total > 0"];
  const params = [teacherId];

  if (classId != null) {
    conditions.push("c.id = ?");
    params.push(classId);
  }
  if (studentId != null) {
    conditions.push("s.student_id = ?");
    params.push(studentId);
  }
  if (fromDate) {
    conditions.push("qa.created_at >= ?");
    params.push(fromDate);
  }
  if (toDate) {
    conditions.push("qa.created_at <= ?");
    params.push(toDate);
  }

  return db
    .prepare(
      `
      SELECT
        q.subject,
        q.focus,
        qa.id AS assignment_id,
        qa.created_at AS assignment_at,
        ROUND(100.0 * s.score / s.total) AS percent,
        COALESCE(asp.on_topic_message_count, 0) AS on_topic_messages,
        COALESCE(asp.qualified_study_seconds, 0) AS study_seconds
      FROM submissions s
      JOIN quiz_assignments qa ON qa.id = s.assignment_id
      JOIN quizzes q ON q.id = qa.quiz_id
      JOIN classes c ON c.id = qa.class_id
      LEFT JOIN assignment_study_progress asp
        ON asp.assignment_id = s.assignment_id AND asp.student_id = s.student_id
      WHERE ${conditions.join(" AND ")}
      ORDER BY qa.created_at ASC, s.submitted_at ASC
    `,
    )
    .all(...params);
}

function limitRowsToRecentAssignments(rows, limit) {
  const assignmentOrder = [];
  const seen = new Set();
  for (const row of rows) {
    if (!seen.has(row.assignment_id)) {
      seen.add(row.assignment_id);
      assignmentOrder.push(row.assignment_id);
    }
  }

  const allowed =
    assignmentOrder.length > limit ? new Set(assignmentOrder.slice(-limit)) : new Set(assignmentOrder);
  return rows.filter((row) => allowed.has(row.assignment_id));
}

function aggregateTopicMastery(rows) {
  const groups = new Map();

  for (const row of rows) {
    const parsed = parseFocusLabel(row.focus);
    const topic = parsed.topic || String(row.focus || "Other").trim() || "Other";
    const subtopic = parsed.subtopic || topic;
    const key = `${row.subject}::${topic}::${subtopic}`;

    if (!groups.has(key)) {
      groups.set(key, {
        subject: row.subject,
        topic,
        subtopic,
        attempts: 0,
        studyMessages: 0,
        studySeconds: 0,
        assignmentBuckets: new Map(),
      });
    }

    const group = groups.get(key);
    group.attempts += 1;
    group.studyMessages += Number(row.on_topic_messages) || 0;
    group.studySeconds += Number(row.study_seconds) || 0;

    if (!group.assignmentBuckets.has(row.assignment_id)) {
      group.assignmentBuckets.set(row.assignment_id, {
        assignmentAt: row.assignment_at,
        percents: [],
      });
    }
    group.assignmentBuckets.get(row.assignment_id).percents.push(Number(row.percent) || 0);
  }

  const topics = [];
  for (const group of groups.values()) {
    const assignmentAverages = [...group.assignmentBuckets.entries()]
      .sort((left, right) => String(left[1].assignmentAt).localeCompare(String(right[1].assignmentAt)))
      .map(([, bucket]) => {
        const sum = bucket.percents.reduce((total, value) => total + value, 0);
        return Math.round(sum / bucket.percents.length);
      });

    const allPercents = [...group.assignmentBuckets.values()].flatMap((bucket) => bucket.percents);
    const avgScore = allPercents.length
      ? Math.round(allPercents.reduce((total, value) => total + value, 0) / allPercents.length)
      : null;

    topics.push({
      subject: group.subject,
      topic: group.topic,
      subtopic: group.subtopic,
      attempts: group.attempts,
      avgScore,
      trend: computeTrend(assignmentAverages),
      studyMessages: group.studyMessages,
      studySeconds: group.studySeconds,
    });
  }

  topics.sort(
    (left, right) =>
      left.subject.localeCompare(right.subject) ||
      left.topic.localeCompare(right.topic) ||
      left.subtopic.localeCompare(right.subtopic),
  );

  return topics;
}

/**
 * Topic-level mastery trends for a teacher's class or student.
 * Returns null when class/student scope is invalid for the teacher.
 */
export function getTopicMasteryReport({
  teacherId,
  classId = null,
  studentId = null,
  limit = DEFAULT_MASTERY_LIMIT,
  fromDate = null,
  toDate = null,
  audit = true,
}) {
  const db = getDb();
  const normalizedLimit = Math.max(1, Math.min(Number(limit) || DEFAULT_MASTERY_LIMIT, 100));

  if (studentId != null && !getTeacherStudent(teacherId, studentId)) {
    return null;
  }
  if (classId != null && !teacherOwnsClass(db, teacherId, classId)) {
    return null;
  }

  const rows = limitRowsToRecentAssignments(
    fetchSubmissionRows(db, { teacherId, classId, studentId, fromDate, toDate }),
    normalizedLimit,
  );

  const assignmentIds = new Set(rows.map((row) => row.assignment_id));
  const topics = aggregateTopicMastery(rows);

  if (audit) {
    logAudit({
      actorId: teacherId,
      actorRole: "teacher",
      action: "report.mastery_viewed",
      entityType: "teacher",
      entityId: teacherId,
      summary: "Viewed topic mastery trends",
      metadata: {
        classId,
        studentId,
        limit: normalizedLimit,
        fromDate,
        toDate,
        topicCount: topics.length,
      },
    });
  }

  return {
    topics,
    assignmentCount: assignmentIds.size,
    filters: {
      classId: classId ?? null,
      studentId: studentId ?? null,
      limit: normalizedLimit,
      fromDate: fromDate ?? null,
      toDate: toDate ?? null,
    },
  };
}
