import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";

const tempDir = mkdtempSync(join(tmpdir(), "littlecode-study-openai-"));
process.env.SQLITE_DATABASE_PATH = join(tempDir, "study-openai.sqlite");
process.env.STUDY_COACH_MOCK = "true";
process.env.STUDY_UNLOCK_MIN_SECONDS = "90";
process.env.STUDY_MIN_SECONDS_PER_ON_TOPIC_MESSAGE = "45";

const db = await import("../lib/db.js");
const study = await import("../lib/study.js");
const {
  getStoredOpenAiResponseId,
  saveOpenAiResponseId,
} = await import("../lib/study-openai-session.js");

before(() => {
  db.getDb();
});

after(() => {
  db.resetDatabaseForTests();
  rmSync(tempDir, { recursive: true, force: true });
});

function createAssignedQuiz(teacher) {
  const classRow = db.getDb().prepare("SELECT id FROM classes WHERE teacher_id = ? LIMIT 1").get(teacher.id);
  return db.insertGeneratedQuiz({
    teacherId: teacher.id,
    yearLevel: "Year 7",
    classId: classRow.id,
    title: "Session quiz",
    request: { difficulty: "medium", dueAt: null },
    generated: {
      source: "test",
      quiz: {
        subject: "Science",
        focus: "Cells",
        yearLevel: "Year 7",
        curriculumSummary: "Cell structures.",
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

test("study coach stores OpenAI response id for chained context", async () => {
  const teacher = db.createTestTeacher({
    name: "Session Teacher",
    email: "session-teacher@school.example",
    username: "session-teacher",
    password: "Teacher123!",
  });
  const classRow = db.getDb().prepare("SELECT id FROM classes WHERE teacher_id = ? LIMIT 1").get(teacher.id);
  const student = db.createTestStudent({
    name: "Session Student",
    email: "session-student@school.example",
    username: "session-student",
    password: "Learner123!",
    teacherId: teacher.id,
    classId: classRow.id,
  });
  const { assignmentId } = createAssignedQuiz(teacher);

  await study.postStudyMessage({
    studentId: student.id,
    assignmentId,
    message: "Explain the nucleus",
  });

  const session = study.getStudySession(student.id, assignmentId);
  assert.ok(session.openAiResponseId);
  assert.equal(session.messages.filter((entry) => entry.role === "student").length, 1);

  await study.postStudyMessage({
    studentId: student.id,
    assignmentId,
    message: "What about mitochondria?",
  });

  const resumed = study.getStudySession(student.id, assignmentId);
  assert.ok(resumed.openAiResponseId);
  assert.notEqual(resumed.openAiResponseId, session.openAiResponseId);
  assert.equal(resumed.messages.filter((entry) => entry.role === "student").length, 2);
});

test("study coach remains available after quiz submission", async () => {
  const teacher = db.createTestTeacher({
    name: "Resume Teacher",
    email: "resume-teacher@school.example",
    username: "resume-teacher",
    password: "Teacher123!",
  });
  const classRow = db.getDb().prepare("SELECT id FROM classes WHERE teacher_id = ? LIMIT 1").get(teacher.id);
  const student = db.createTestStudent({
    name: "Resume Student",
    email: "resume-student@school.example",
    username: "resume-student",
    password: "Learner123!",
    teacherId: teacher.id,
    classId: classRow.id,
  });
  const { assignmentId } = createAssignedQuiz(teacher);

  await study.postStudyMessage({
    studentId: student.id,
    assignmentId,
    message: "Explain the nucleus in simple terms",
  });
  await study.postStudyMessage({
    studentId: student.id,
    assignmentId,
    message: "Give me a worked example about cell walls",
  });

  const assignment = db.getStudentAssignment(student.id, assignmentId);
  assert.equal(study.studyCoachRequiredForAssignment(assignment), true);
  assert.equal(study.studyCoachAvailableForAssignment(assignment), true);

  db.submitAssignment({ studentId: student.id, assignmentId, answers: { 0: "Nucleus" } });
  const submitted = db.getStudentAssignment(student.id, assignmentId);

  assert.equal(study.studyCoachRequiredForAssignment(submitted), false);
  assert.equal(study.studyCoachAvailableForAssignment(submitted), true);

  const result = await study.postStudyMessage({
    studentId: student.id,
    assignmentId,
    message: "Can we review organelles again?",
  });

  assert.ok(result.messages.length >= 4);
  assert.equal(result.quizSubmitted, true);
});

test("saveOpenAiResponseId persists on progress row", () => {
  const progress = { openai_last_response_id: "resp_test_123" };
  assert.equal(getStoredOpenAiResponseId(progress), "resp_test_123");
});
