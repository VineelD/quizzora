import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { formatFocusLabel, getTopicEntries } from "../lib/curriculum-topics.js";

const tempDir = mkdtempSync(join(tmpdir(), "littlecode-mastery-"));
process.env.SQLITE_DATABASE_PATH = join(tempDir, "test.sqlite");
process.env.APP_BASE_URL = "http://localhost:8080";
process.env.ALLOW_TEACHER_SIGNUP = "true";
process.env.STUDY_COACH_ENABLED = "false";

const db = await import("../lib/db.js");
const reporting = await import("../lib/teacher-reporting.js");

before(() => {
  db.getDb();
});

after(() => {
  db.resetDatabaseForTests();
  rmSync(tempDir, { recursive: true, force: true });
});

function sampleQuizPayload({ subject, focus, answer }) {
  return {
    source: "Built-in sample",
    quiz: {
      subject,
      focus,
      yearLevel: "Year 7",
      curriculumSummary: "Sample curriculum summary.",
      learningIntentions: ["Understand the focus area."],
      questions: [
        {
          question: "Sample question?",
          options: [answer, "Wrong A", "Wrong B", "Wrong C"],
          answer,
          explanation: "Sample explanation.",
        },
      ],
    },
  };
}

function assignAndSubmit({ teacher, klass, student, title, subject, focus, answer }) {
  const saved = db.insertGeneratedQuiz({
    teacherId: teacher.id,
    classId: klass.id,
    title,
    request: { subject, focus, difficulty: "core", questionCount: 1 },
    generated: sampleQuizPayload({ subject, focus, answer }),
  });

  db.submitAssignment({
    studentId: student.id,
    assignmentId: saved.assignmentId,
    answers: { 0: answer },
  });

  return saved;
}

test("computeTrend labels improving, declining, and steady series", () => {
  assert.equal(reporting.computeTrend([40, 45, 80, 85]), "up");
  assert.equal(reporting.computeTrend([90, 88, 50, 45]), "down");
  assert.equal(reporting.computeTrend([70, 72, 71, 73]), "flat");
  assert.equal(reporting.computeTrend([80]), "flat");
});

test("getTopicMasteryReport aggregates topic averages and trends over assignments", () => {
  const teacher = db.createTestTeacher({
    name: "Mastery Teacher",
    email: "mastery-teacher@school.example",
    username: "masteryteacher",
    password: "Teacher123!",
  });
  const [klass] = db.getTeacherClasses(teacher.id);
  const student = db.createTestStudent({
    name: "Mia Mastery",
    email: "mia@school.example",
    username: "mia",
    password: "Student123!",
    teacherId: teacher.id,
    classId: klass.id,
  });

  const scienceTopic = getTopicEntries("Year 7", "Science")[0];
  const focusA = formatFocusLabel(scienceTopic, scienceTopic.subtopics[0]);
  const focusB = formatFocusLabel(scienceTopic, scienceTopic.subtopics[1] || scienceTopic.subtopics[0]);

  const first = assignAndSubmit({
    teacher,
    klass,
    student,
    title: "Science quiz A",
    subject: "Science",
    focus: focusA,
    answer: "Nucleus",
  });

  db.getDb()
    .prepare("UPDATE submissions SET score = 0, total = 1 WHERE student_id = ? AND assignment_id = ?")
    .run(student.id, first.assignmentId);

  assignAndSubmit({
    teacher,
    klass,
    student,
    title: "Science quiz B",
    subject: "Science",
    focus: focusA,
    answer: "Nucleus",
  });

  assignAndSubmit({
    teacher,
    klass,
    student,
    title: "Science quiz C",
    subject: "Science",
    focus: focusB,
    answer: "Nucleus",
  });

  const report = reporting.getTopicMasteryReport({
    teacherId: teacher.id,
    classId: klass.id,
    audit: false,
  });

  assert.ok(report);
  assert.equal(report.assignmentCount, 3);

  const focusRow = report.topics.find((topic) => topic.subtopic === scienceTopic.subtopics[0]);
  assert.ok(focusRow, "expected a row for the first science subtopic");
  assert.equal(focusRow.attempts, 2);
  assert.equal(focusRow.trend, "up");
  assert.ok(focusRow.avgScore >= 50);
});

test("getTopicMasteryReport returns null for students outside teacher roster", () => {
  const teacher = db.createTestTeacher({
    name: "Scope Teacher",
    email: "scope-teacher@school.example",
    username: "scopeteacher",
    password: "Teacher123!",
  });
  const otherTeacher = db.createTestTeacher({
    name: "Other Teacher",
    email: "other-teacher@school.example",
    username: "otherteacher",
    password: "Teacher123!",
  });
  const [otherClass] = db.getTeacherClasses(otherTeacher.id);
  const outsider = db.createTestStudent({
    name: "Outside Student",
    email: "outside@school.example",
    username: "outside",
    password: "Student123!",
    teacherId: otherTeacher.id,
    classId: otherClass.id,
  });

  const scoped = reporting.getTopicMasteryReport({
    teacherId: teacher.id,
    studentId: outsider.id,
    audit: false,
  });

  assert.equal(scoped, null);
});

test("getTopicMasteryReport includes Study Coach engagement totals", () => {
  const teacher = db.createTestTeacher({
    name: "Coach Teacher",
    email: "coach-teacher@school.example",
    username: "coachteacher",
    password: "Teacher123!",
  });
  const [klass] = db.getTeacherClasses(teacher.id);
  const student = db.createTestStudent({
    name: "Coach Student",
    email: "coach-student@school.example",
    username: "coachstudent",
    password: "Student123!",
    teacherId: teacher.id,
    classId: klass.id,
  });

  const saved = assignAndSubmit({
    teacher,
    klass,
    student,
    title: "Coach quiz",
    subject: "Science",
    focus: "Forces and motion — Balanced and unbalanced forces",
    answer: "Force",
  });

  db.getDb()
    .prepare(
      `
      INSERT INTO assignment_study_progress (
        student_id, assignment_id, on_topic_message_count, qualified_study_seconds
      )
      VALUES (?, ?, 4, 900)
    `,
    )
    .run(student.id, saved.assignmentId);

  const report = reporting.getTopicMasteryReport({
    teacherId: teacher.id,
    studentId: student.id,
    audit: false,
  });

  const row = report.topics[0];
  assert.equal(row.studyMessages, 4);
  assert.equal(row.studySeconds, 900);
});
