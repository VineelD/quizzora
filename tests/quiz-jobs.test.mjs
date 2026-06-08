import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";

const tempDir = mkdtempSync(join(tmpdir(), "littlecode-quiz-jobs-"));
process.env.SQLITE_DATABASE_PATH = join(tempDir, "test.sqlite");
process.env.QUIZ_JOB_WORKER_ENABLED = "false";

const db = await import("../lib/db.js");
const quizJobs = await import("../lib/quiz-jobs.js");

before(() => {
  db.getDb();
});

after(() => {
  db.resetDatabaseForTests();
  rmSync(tempDir, { recursive: true, force: true });
});

test("enqueueQuizGenerationJob stores queued job with payload", () => {
  const teacher = db.createTestTeacher({
    name: "Quiz Teacher",
    email: "quiz-teacher@school.example",
    username: "quiz-teacher",
    password: "Teacher123!",
  });

  const payload = quizJobs.parseQuizRequestFromBody({
    yearLevel: "Year 7",
    subject: "Science",
    focus: "Mixtures and separation",
    questionCount: 5,
    difficulty: "mixed",
    questionStyle: "worded",
  });

  const job = quizJobs.enqueueQuizGenerationJob({ userId: teacher.id, payload });

  assert.equal(job.status, "queued");
  assert.equal(job.userId, teacher.id);
  assert.equal(job.payload.subject, "Science");
  assert.equal(job.progressMessage, "Queued");
  assert.ok(job.schoolId);
});

test("getQuizGenerationJobForUser restricts access to job owner", () => {
  const teacher = db.createTestTeacher({
    name: "Owner Teacher",
    email: "owner-teacher@school.example",
    username: "owner-teacher",
    password: "Teacher123!",
  });
  const other = db.createTestTeacher({
    name: "Other Teacher",
    email: "other-teacher@school.example",
    username: "other-teacher",
    password: "Teacher123!",
  });

  const job = quizJobs.enqueueQuizGenerationJob({
    userId: teacher.id,
    payload: quizJobs.parseQuizRequestFromBody({ yearLevel: "Year 8" }),
  });

  assert.ok(quizJobs.getQuizGenerationJobForUser(job.id, teacher.id));
  assert.equal(quizJobs.getQuizGenerationJobForUser(job.id, other.id), null);
});

test("claimNextQuizJob claims oldest queued job atomically", () => {
  while (quizJobs.claimNextQuizJob()) {
    // drain leftover queued jobs from earlier tests
  }

  const teacher = db.createTestTeacher({
    name: "Claim Teacher",
    email: "claim-teacher@school.example",
    username: "claim-teacher",
    password: "Teacher123!",
  });

  const first = quizJobs.enqueueQuizGenerationJob({
    userId: teacher.id,
    payload: quizJobs.parseQuizRequestFromBody({ yearLevel: "Year 7", focus: "First" }),
  });
  const second = quizJobs.enqueueQuizGenerationJob({
    userId: teacher.id,
    payload: quizJobs.parseQuizRequestFromBody({ yearLevel: "Year 8", focus: "Second" }),
  });

  const claimed = quizJobs.claimNextQuizJob();
  assert.equal(claimed.id, first.id);
  assert.equal(claimed.status, "processing");
  assert.match(claimed.progressMessage, /Generating/i);

  const claimedAgain = quizJobs.claimNextQuizJob();
  assert.equal(claimedAgain.id, second.id);

  assert.equal(quizJobs.claimNextQuizJob(), null);
});

test("serializeQuizJobForClient exposes status and result fields", () => {
  const teacher = db.createTestTeacher({
    name: "Serialize Teacher",
    email: "serialize-teacher@school.example",
    username: "serialize-teacher",
    password: "Teacher123!",
  });

  const job = quizJobs.enqueueQuizGenerationJob({
    userId: teacher.id,
    payload: quizJobs.parseQuizRequestFromBody({ yearLevel: "Year 9" }),
  });

  quizJobs.updateQuizGenerationJob(job.id, {
    status: "completed",
    result: { quizId: 42, assignmentId: 99, source: "OpenAI" },
    progressMessage: "Done",
    completedAt: new Date().toISOString(),
  });

  const serialized = quizJobs.serializeQuizJobForClient(quizJobs.getQuizGenerationJob(job.id));
  assert.equal(serialized.status, "completed");
  assert.equal(serialized.quiz.id, 42);
  assert.equal(serialized.assignment.id, 99);
  assert.equal(serialized.source, "OpenAI");
});

test("parseQuizRequestFromBody clamps question count", () => {
  const parsed = quizJobs.parseQuizRequestFromBody({ questionCount: 150, yearLevel: "Year 10" });
  assert.equal(parsed.questionCount, 100);

  const capped = quizJobs.parseQuizRequestFromBody({ questionCount: 80 }, { maxQuestionsPerQuiz: 30 });
  assert.equal(capped.questionCount, 30);
  assert.equal(capped.questionCountClamped, true);

  const small = quizJobs.parseQuizRequestFromBody({ questionCount: 1 });
  assert.equal(small.questionCount, 1);
});
