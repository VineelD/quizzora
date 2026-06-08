import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";

const tempDir = mkdtempSync(join(tmpdir(), "littlecode-study-"));
process.env.SQLITE_DATABASE_PATH = join(tempDir, "test.sqlite");
process.env.APP_BASE_URL = "http://localhost:8080";
process.env.STUDY_COACH_MOCK = "true";
process.env.STUDY_UNLOCK_MIN_SECONDS = "90";
process.env.STUDY_MIN_SECONDS_PER_ON_TOPIC_MESSAGE = "45";
process.env.STUDY_MAX_GAP_SECONDS = "300";

const db = await import("../lib/db.js");
const study = await import("../lib/study.js");
const studyCoach = await import("../lib/study-coach.js");
const studyProgress = await import("../lib/study-progress.js");
const studyTopic = await import("../lib/study-topic.js");

before(() => {
  db.getDb();
});

after(() => {
  db.resetDatabaseForTests();
  rmSync(tempDir, { recursive: true, force: true });
});

function createAssignedQuiz(teacher) {
  const classRow = db
    .getDb()
    .prepare("SELECT id FROM classes WHERE teacher_id = ? LIMIT 1")
    .get(teacher.id);

  return db.insertGeneratedQuiz({
    teacherId: teacher.id,
    yearLevel: "Year 7",
    classId: classRow.id,
    title: "Cells quiz",
    request: { difficulty: "medium", dueAt: null },
    generated: {
      source: "test",
      quiz: {
        subject: "Science",
        focus: "Cells",
        yearLevel: "Year 7",
        curriculumSummary: "Understand plant and animal cell structures.",
        learningIntentions: ["Identify organelles", "Compare cell types"],
        questions: [
          {
            question: "Which organelle controls the cell?",
            options: ["Nucleus", "Ribosome", "Vacuole", "Cell wall"],
            answer: "Nucleus",
            explanation: "Step 1: Recall control centre.\nAnswer: Nucleus",
            imagePrompt: "",
          },
        ],
      },
    },
  });
}

test("study coach refuses direct answer requests", () => {
  assert.equal(studyCoach.shouldRefuseStudentMessage("What is the answer to question 1?"), true);
  assert.equal(studyCoach.shouldRefuseStudentMessage("Explain mitochondria"), false);
});

test("studentRequestsDiagram detects diagram follow-up prompts", () => {
  assert.equal(studyCoach.studentRequestsDiagram("create a similar diagram"), true);
  assert.equal(studyCoach.studentRequestsDiagram("Show me a labelled diagram step by step"), true);
  assert.equal(studyCoach.studentRequestsDiagram("Show me a recursion diagram"), true);
  assert.equal(studyCoach.studentRequestsDiagram("Explain Fibonacci in simple terms"), false);
});

test("ensureDiagramResponse forces diagram steps even when coach marks off-topic", () => {
  const context = {
    yearLevel: "Year 12",
    subject: "Mathematics",
    focus: "Fibonacci sequences",
  };
  const offTopicPayload = {
    intro: "OFF-TOPIC: Let's stay focused.",
    onTopic: false,
    portions: [],
    steps: [
      {
        title: "Step 1",
        text: "### Diagram:\nF0 --> F1\n\n### Labels:\n- F0\n\nRecursion formulae here.",
      },
    ],
    followUps: [],
  };

  const upgraded = studyCoach.ensureDiagramResponse(offTopicPayload, context, "create a recursion diagram");

  assert.equal(upgraded.onTopic, false);
  assert.match(upgraded.steps[0].diagramPrompt, /recursion tree/i);
  assert.equal(upgraded.steps[0].diagramType, "recursion_tree");
  assert.equal(upgraded.steps[0].diagramSpec?.diagramType, "recursion_tree");
  assert.ok(Number(upgraded.steps[0].diagramSpec?.depth) >= 3);
  assert.doesNotMatch(upgraded.steps[0].text, /### Diagram:/i);
  assert.doesNotMatch(upgraded.steps[0].text, /### Labels:/i);
  assert.doesNotMatch(upgraded.steps[0].text, /F0 --> F1/);
});

test("off-topic messages are detected and do not count toward unlock time", () => {
  const context = {
    subject: "Science",
    focus: "Cells",
    learningIntentions: ["Identify organelles"],
  };
  assert.equal(studyTopic.isLikelyOnTopicMessage(context, "Explain the nucleus in simple terms"), true);
  assert.equal(studyTopic.isLikelyOnTopicMessage(context, "Who won the football game last night?"), false);
});

test("politics and election questions are forced off-topic", () => {
  const context = {
    subject: "Science",
    focus: "Cells",
    learningIntentions: ["Identify organelles"],
  };

  assert.equal(studyTopic.shouldForceOffTopic(context, "Who should I vote for?"), true);
  assert.equal(studyTopic.shouldForceOffTopic(context, "What do you think about the election?"), true);
  assert.equal(studyTopic.isLikelyOnTopicMessage(context, "Who should I vote for?"), false);
  assert.equal(studyTopic.isLikelyOnTopicMessage(context, "What do you think about the election?"), false);
  assert.match(studyTopic.buildOffTopicRedirect(context), /I focus on this assignment's topics/i);
});

test("politics questions return off-topic coach payload in mock mode", async () => {
  const context = {
    yearLevel: "Year 7",
    subject: "Science",
    focus: "Cells",
    curriculumSummary: "Understand plant and animal cell structures.",
    learningIntentions: ["Identify organelles"],
  };

  const reply = await studyCoach.generateStudyCoachReply({
    context,
    history: [],
    message: "Who should I vote for?",
  });

  assert.equal(reply.onTopic, false);
  assert.match(reply.content, /I focus on this assignment's topics/i);
  assert.equal(reply.payload.onTopic, false);
});

test("quiz stays locked until topic-focused study time is met", async () => {
  const teacher = db.createTestTeacher({
    name: "Coach Teacher",
    email: "coach-teacher@school.example",
    username: "coach-teacher",
    password: "Teacher123!",
  });
  const classRow = db.getDb().prepare("SELECT id FROM classes WHERE teacher_id = ? LIMIT 1").get(teacher.id);
  const student = db.createTestStudent({
    name: "Study Student",
    email: "study-student@school.example",
    username: "study-student",
    password: "Learner123!",
    teacherId: teacher.id,
    classId: classRow.id,
  });
  const { assignmentId } = createAssignedQuiz(teacher);

  const assignment = db.getStudentAssignment(student.id, assignmentId);
  assert.ok(study.studyCoachRequiredForAssignment(assignment));

  assert.throws(
    () => db.submitAssignment({ studentId: student.id, assignmentId, answers: { 0: "Nucleus" } }),
    /Complete .* minutes of topic-focused Study Coach first/,
  );

  await study.postStudyMessage({
    studentId: student.id,
    assignmentId,
    message: "Who won the football game last night?",
  });

  let session = study.getStudySession(student.id, assignmentId);
  assert.equal(session.progress.unlocked, false);
  assert.equal(session.progress.qualifiedStudySeconds, 0);

  await study.postStudyMessage({
    studentId: student.id,
    assignmentId,
    message: "Explain the nucleus in simple terms",
  });

  session = study.getStudySession(student.id, assignmentId);
  assert.equal(session.progress.unlocked, false);
  assert.ok(session.progress.qualifiedStudySeconds >= 45);

  await study.postStudyMessage({
    studentId: student.id,
    assignmentId,
    message: "Give me a worked example about cell walls",
  });

  const unlockedSession = study.getStudySession(student.id, assignmentId);
  assert.equal(unlockedSession.progress.unlocked, true);
  assert.ok(unlockedSession.progress.qualifiedStudySeconds >= 90);

  const conceptReply = unlockedSession.messages
    .filter((entry) => entry.role === "assistant" && entry.payloadJson)
    .map((entry) => JSON.parse(entry.payloadJson))
    .find((payload) => Array.isArray(payload.portions) && payload.portions.length >= 2);
  assert.ok(conceptReply, "expected an application-based coach payload with portions");
  assert.ok(conceptReply.portions[0].content?.length > 0);
  assert.ok(conceptReply.steps?.length >= 1, "expected a hero visual step");
  assert.equal(conceptReply.visualSequence, false);
  assert.ok(conceptReply.steps[0].diagramPrompt || conceptReply.steps[0].diagramSpec || conceptReply.steps[0].diagramMermaid);
  assert.ok(conceptReply.steps[0].engagementHook);

  const result = db.submitAssignment({ studentId: student.id, assignmentId, answers: { 0: "Nucleus" } });
  assert.equal(result.score, 1);
});

test("study context excludes quiz answers from coach metadata", () => {
  const teacher = db.createTestTeacher({
    name: "Meta Teacher",
    email: "meta-teacher@school.example",
    username: "meta-teacher",
    password: "Teacher123!",
  });
  const classRow = db.getDb().prepare("SELECT id FROM classes WHERE teacher_id = ? LIMIT 1").get(teacher.id);
  const student = db.createTestStudent({
    name: "Meta Student",
    email: "meta-student@school.example",
    username: "meta-student",
    password: "Learner123!",
    teacherId: teacher.id,
    classId: classRow.id,
  });
  const { assignmentId } = createAssignedQuiz(teacher);

  const context = study.getAssignmentStudyContext(student.id, assignmentId);
  assert.equal(context.focus, "Cells");
  assert.ok(Array.isArray(context.learningIntentions));
  assert.equal("questions" in context, false);
  assert.equal("answer" in context, false);
});

test("unlock progress tracks qualified study seconds", () => {
  const progress = {
    qualified_study_seconds: 30,
    on_topic_message_count: 1,
  };
  const unlock = studyProgress.getUnlockProgress(progress);
  assert.equal(unlock.qualifiedStudySeconds, 30);
  assert.equal(unlock.minQualifiedStudySeconds, 90);
  assert.equal(unlock.unlocked, false);
  assert.ok(unlock.percentComplete > 0);
});

test("unlock progress respects configured thresholds", () => {
  const progress = {
    qualified_study_seconds: 120,
    on_topic_message_count: 3,
  };
  const unlock = studyProgress.getUnlockProgress(progress);
  assert.equal(unlock.unlocked, true);
});
