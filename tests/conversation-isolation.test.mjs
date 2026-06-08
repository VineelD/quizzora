import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";

const tempDir = mkdtempSync(join(tmpdir(), "littlecode-conversation-isolation-"));
process.env.SQLITE_DATABASE_PATH = join(tempDir, "conversation-isolation.sqlite");
process.env.STUDY_COACH_MOCK = "true";

const db = await import("../lib/db.js");
const study = await import("../lib/study.js");
const tickets = await import("../lib/tickets.js");

before(() => {
  db.getDb();
});

after(() => {
  db.resetDatabaseForTests();
  rmSync(tempDir, { recursive: true, force: true });
});

function createAssignedQuiz(teacher, classId) {
  return db.insertGeneratedQuiz({
    teacherId: teacher.id,
    yearLevel: "Year 7",
    classId,
    title: "Isolation quiz",
    request: { difficulty: "medium", dueAt: null },
    generated: {
      source: "test",
      quiz: {
        subject: "Science",
        focus: "Cells",
        yearLevel: "Year 7",
        curriculumSummary: "Understand plant and animal cell structures.",
        learningIntentions: ["Identify organelles"],
        questions: [
          {
            question: "Which organelle controls the cell?",
            options: ["Nucleus", "Ribosome", "Vacuole", "Cell wall"],
            answer: "Nucleus",
            explanation: "The nucleus controls the cell.",
            imagePrompt: "",
          },
        ],
      },
    },
  });
}

function createClassStudents(teacher, classId) {
  const studentA = db.createTestStudent({
    name: "Student Alpha",
    email: "alpha@isolation.test",
    username: "student-alpha",
    password: "Learner123!",
    teacherId: teacher.id,
    classId,
  });
  const studentB = db.createTestStudent({
    name: "Student Beta",
    email: "beta@isolation.test",
    username: "student-beta",
    password: "Learner123!",
    teacherId: teacher.id,
    classId,
  });
  return { studentA, studentB };
}

test("study coach conversations are isolated per student on the same assignment", async () => {
  const teacher = db.createTestTeacher({
    name: "Isolation Teacher",
    email: "isolation-teacher@school.example",
    username: "isolation-teacher",
    password: "Teacher123!",
  });
  const classRow = db.getDb().prepare("SELECT id FROM classes WHERE teacher_id = ? LIMIT 1").get(teacher.id);
  const { studentA, studentB } = createClassStudents(teacher, classRow.id);
  const { assignmentId } = createAssignedQuiz(teacher, classRow.id);

  assert.equal(study.studentCanAccessStudyConversation(studentA.id, assignmentId), true);
  assert.equal(study.studentCanAccessStudyConversation(studentB.id, assignmentId), true);

  const secret = "Unique secret message from student A only";
  await study.postStudyMessage({
    studentId: studentA.id,
    assignmentId,
    message: secret,
  });

  const sessionA = study.getStudySession(studentA.id, assignmentId);
  const sessionB = study.getStudySession(studentB.id, assignmentId);
  const transcriptA = sessionA.messages.map((entry) => entry.content).join("\n");
  const transcriptB = sessionB.messages.map((entry) => entry.content).join("\n");

  assert.match(transcriptA, new RegExp(secret.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.doesNotMatch(transcriptB, new RegExp(secret.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.notEqual(
    sessionA.messages.filter((entry) => entry.role === "student").length,
    sessionB.messages.filter((entry) => entry.role === "student").length,
  );
});

test("students cannot access study conversations for assignments they are not enrolled in", () => {
  const teacher = db.createTestTeacher({
    name: "Access Teacher",
    email: "access-teacher@school.example",
    username: "access-teacher",
    password: "Teacher123!",
  });
  const classRow = db.getDb().prepare("SELECT id FROM classes WHERE teacher_id = ? LIMIT 1").get(teacher.id);
  const outsider = db.createTestStudent({
    name: "Outsider Student",
    email: "outsider@isolation.test",
    username: "student-outsider",
    password: "Learner123!",
    teacherId: teacher.id,
    classId: classRow.id,
  });
  db.getDb().prepare("DELETE FROM class_students WHERE student_id = ?").run(outsider.id);

  const { assignmentId } = createAssignedQuiz(teacher, classRow.id);

  assert.equal(study.studentCanAccessStudyConversation(outsider.id, assignmentId), false);
  assert.equal(study.getStudySession(outsider.id, assignmentId), null);
  assert.equal(db.getStudentAssignment(outsider.id, assignmentId), null);
});

test("support tickets reject cross-user access with forbidden status", () => {
  const teacher = db.createTestTeacher({
    name: "Ticket Teacher",
    email: "ticket-teacher@school.example",
    username: "ticket-teacher",
    password: "Teacher123!",
  });
  const classRow = db.getDb().prepare("SELECT id FROM classes WHERE teacher_id = ? LIMIT 1").get(teacher.id);
  const owner = db.createTestStudent({
    name: "Ticket Owner",
    email: "ticket-owner@isolation.test",
    username: "ticket-owner",
    password: "Learner123!",
    teacherId: teacher.id,
    classId: classRow.id,
  });
  const other = db.createTestStudent({
    name: "Ticket Other",
    email: "ticket-other@isolation.test",
    username: "ticket-other",
    password: "Learner123!",
    teacherId: teacher.id,
    classId: classRow.id,
  });

  const ticket = tickets.createTicket({
    user: { ...owner, school_id: owner.school_id },
    subject: "Private study coach issue",
    body: "Only the ticket owner should read this thread.",
    category: "technical",
  });

  const allowed = tickets.resolveTicketAccess(ticket.id, { ...owner, school_id: owner.school_id });
  assert.equal(allowed.status, "ok");
  assert.equal(allowed.ticket.createdByUserId, owner.id);

  const forbidden = tickets.resolveTicketAccess(ticket.id, { ...other, school_id: other.school_id });
  assert.equal(forbidden.status, "forbidden");
  assert.equal(forbidden.ticket, null);

  const missing = tickets.resolveTicketAccess(999999, { ...owner, school_id: owner.school_id });
  assert.equal(missing.status, "not_found");
});
