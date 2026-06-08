import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";

const tempDir = mkdtempSync(join(tmpdir(), "littlecode-study-files-"));
process.env.SQLITE_DATABASE_PATH = join(tempDir, "study-files.sqlite");
process.env.STUDY_FILES_DIR = join(tempDir, "study-files");
process.env.STUDY_COACH_MOCK = "true";

const db = await import("../lib/db.js");
const study = await import("../lib/study.js");
const studyFiles = await import("../lib/study-files.js");
const studyExport = await import("../lib/study-export-content.js");

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
    yearLevel: "Year 12",
    classId,
    title: "Fibonacci study",
    request: { difficulty: "medium", dueAt: null },
    generated: {
      source: "test",
      quiz: {
        subject: "Mathematics",
        focus: "Fibonacci sequences",
        yearLevel: "Year 12",
        curriculumSummary: "Understand recursive sequences.",
        learningIntentions: ["Define Fibonacci", "Trace recursion"],
        questions: [
          {
            question: "What is the next term after 1, 1, 2?",
            options: ["2", "3", "4", "5"],
            answer: "3",
            explanation: "Add the previous two terms.",
            imagePrompt: "",
          },
        ],
      },
    },
  });
}

function createStudent(teacher, classId, suffix) {
  return db.createTestStudent({
    name: `Student ${suffix}`,
    email: `${suffix}@study-files.test`,
    username: `student-${suffix}`,
    password: "Learner123!",
    teacherId: teacher.id,
    classId,
  });
}

test("coachPayloadHasExportableContent detects formulas, diagrams, and portions", () => {
  assert.equal(studyExport.coachPayloadHasExportableContent(null), false);
  assert.equal(
    studyExport.coachPayloadHasExportableContent({
      formulas: [{ label: "Rule", expression: "a_n = a_1 + (n-1)d" }],
      steps: [],
    }),
    true,
  );
  assert.equal(
    studyExport.coachPayloadHasExportableContent({
      formulas: [],
      steps: [{ diagramType: "recursion_tree", diagramSpec: { diagramType: "recursion_tree", root: 4, depth: 3 } }],
    }),
    true,
  );
  assert.equal(
    studyExport.coachPayloadHasExportableContent({
      formulas: [],
      steps: [],
      portions: [{ label: "Concept in action", content: "Trace the sequence step by step." }],
    }),
    true,
  );
});

test("parseStoredMessagePayload keeps formulas when portions and steps are empty", async () => {
  const { parseStoredMessagePayload } = await import("../lib/study-message-normalize.js");
  const payloadJson = JSON.stringify({
    topicHeader: "Quadratic equations",
    intro: "Quick reference for solving ax² + bx + c = 0.",
    formulas: [{ label: "Quadratic formula", expression: "x = (-b ± √(b² - 4ac)) / 2a" }],
    portions: [],
    steps: [],
  });

  const parsed = parseStoredMessagePayload(
    { content: "fallback plain text only", payloadJson },
    { forExport: true },
  );

  assert.equal(studyExport.coachPayloadHasExportableContent(parsed), true);
  assert.equal(parsed.formulas.length, 1);
  assert.match(parsed.formulas[0].label, /Quadratic formula/i);
  assert.match(parsed.formulas[0].expression, /x =/);
});

test("createStudyCoachFile exports realistic coach payload with portions and formulas", async () => {
  const teacher = db.createTestTeacher({
    name: "Fixture Files Teacher",
    email: "fixture-files@school.example",
    username: "fixture-files-teacher",
    password: "Teacher123!",
  });
  const classRow = db.getDb().prepare("SELECT id FROM classes WHERE teacher_id = ? LIMIT 1").get(teacher.id);
  const student = createStudent(teacher, classRow.id, "fixture");
  const { assignmentId } = createAssignedQuiz(teacher, classRow.id);

  const payload = {
    topicHeader: "Fibonacci sequences",
    intro: "Here's how Fibonacci works in practice.",
    keyIdeas: ["Each term sums the previous two", "Recursion builds the sequence"],
    formulas: [{ label: "Recurrence", expression: "F_n = F_{n-1} + F_{n-2}" }],
    portions: [
      {
        id: "p1",
        label: "Concept in action",
        content: "Trace 1, 1, 2, 3, 5 and explain how each term is formed.",
      },
      {
        id: "p2",
        label: "Your turn",
        content: "Predict the next term after 8 using the recurrence rule.",
      },
    ],
    steps: [
      {
        title: "Hero visual",
        text: "",
        diagramType: "recursion_tree",
        diagramSpec: { diagramType: "recursion_tree", root: 4, depth: 3 },
        diagramTitle: "Fibonacci tree",
        diagramSummary: "Shows recursive calls for F(4).",
      },
    ],
    onTopic: true,
  };

  const messageId = db.getDb()
    .prepare(
      `
      INSERT INTO study_messages (student_id, assignment_id, role, content, flagged, on_topic, payload_json)
      VALUES (?, ?, 'assistant', ?, 0, 1, ?)
    `,
    )
    .run(
      student.id,
      assignmentId,
      "Fibonacci walkthrough with formulas and a concept visual.",
      JSON.stringify(payload),
    ).lastInsertRowid;

  const created = await studyFiles.createStudyCoachFile({
    studentId: student.id,
    assignmentId,
    messageId: Number(messageId),
    assignmentTitle: "Fibonacci study",
  });

  assert.equal(created.created, true);
  const buffer = studyFiles.readStudyCoachFileBuffer(
    studyFiles.getStudyCoachFileForStudent(student.id, created.file.id),
  );
  assert.equal(buffer.subarray(0, 4).toString("utf8"), "%PDF");
  assert.ok(buffer.length > 1500, `expected rich PDF, got ${buffer.length} bytes`);
});

test("createStudyCoachFile stores PDF metadata and dedupes by message", async () => {
  const teacher = db.createTestTeacher({
    name: "Files Teacher",
    email: "files-teacher@school.example",
    username: "files-teacher",
    password: "Teacher123!",
  });
  const classRow = db.getDb().prepare("SELECT id FROM classes WHERE teacher_id = ? LIMIT 1").get(teacher.id);
  const student = createStudent(teacher, classRow.id, "alpha");
  const { assignmentId } = createAssignedQuiz(teacher, classRow.id);

  await study.postStudyMessage({
    studentId: student.id,
    assignmentId,
    message: "Show me a concept visual for Fibonacci",
  });

  const session = study.getStudySession(student.id, assignmentId);
  const assistantMessage = [...session.messages].reverse().find((entry) => entry.role === "assistant");
  assert.ok(assistantMessage?.id);

  const first = await studyFiles.createStudyCoachFile({
    studentId: student.id,
    assignmentId,
    messageId: assistantMessage.id,
    assignmentTitle: "Fibonacci study",
  });

  assert.equal(first.created, true);
  assert.match(first.file.title, /Concept visual|Study notes|Key formulas/i);
  assert.match(first.file.filename, /\.pdf$/);

  const buffer = studyFiles.readStudyCoachFileBuffer(
    studyFiles.getStudyCoachFileForStudent(student.id, first.file.id),
  );
  assert.ok(buffer?.length > 100);
  assert.equal(buffer.subarray(0, 4).toString("utf8"), "%PDF");

  const second = await studyFiles.createStudyCoachFile({
    studentId: student.id,
    assignmentId,
    messageId: assistantMessage.id,
    assignmentTitle: "Fibonacci study",
  });
  assert.equal(second.created, false);
  assert.equal(second.file.id, first.file.id);

  const listed = studyFiles.listStudyCoachFiles(student.id, assignmentId);
  assert.equal(listed.length, 1);
  assert.equal(listed[0].id, first.file.id);
  assert.equal(listed[0].messageId, assistantMessage.id);
});

test("createStudyCoachFile falls back to latest exportable assistant message", async () => {
  const teacher = db.createTestTeacher({
    name: "Fallback Files Teacher",
    email: "fallback-files@school.example",
    username: "fallback-files-teacher",
    password: "Teacher123!",
  });
  const classRow = db.getDb().prepare("SELECT id FROM classes WHERE teacher_id = ? LIMIT 1").get(teacher.id);
  const student = createStudent(teacher, classRow.id, "fallback");
  const { assignmentId } = createAssignedQuiz(teacher, classRow.id);

  await study.postStudyMessage({
    studentId: student.id,
    assignmentId,
    message: "Explain Fibonacci briefly",
  });
  await study.postStudyMessage({
    studentId: student.id,
    assignmentId,
    message: "Show me a concept visual for Fibonacci",
  });

  const session = study.getStudySession(student.id, assignmentId);
  const assistantMessages = session.messages.filter((entry) => entry.role === "assistant");
  assert.ok(assistantMessages.length >= 2);

  const latestAssistant = assistantMessages.at(-1);
  const created = await studyFiles.createStudyCoachFile({
    studentId: student.id,
    assignmentId,
    messageId: null,
    assignmentTitle: "Fibonacci study",
  });

  assert.equal(created.created, true);
  assert.equal(created.file.messageId, latestAssistant.id);

  const listed = studyFiles.listStudyCoachFiles(student.id, assignmentId);
  assert.equal(listed.length, 1);
  assert.ok(listed.some((file) => file.id === created.file.id));
});

test("renderStudyCoachPdf grows when portion summaries are present", async () => {
  const { renderStudyCoachPdf } = await import("../lib/study-pdf.js");
  const context = {
    yearLevel: "Year 12",
    subject: "Mathematics",
    focus: "Fibonacci sequences",
  };
  const basePayload = {
    topicHeader: "Fibonacci sequences",
    intro: "Here's how Fibonacci works in practice.",
    formulas: [{ label: "Recurrence", expression: "F_n = F_{n-1} + F_{n-2}" }],
    steps: [
      {
        diagramType: "recursion_tree",
        diagramSpec: { diagramType: "recursion_tree", root: 4, depth: 3 },
        diagramTitle: "Fibonacci tree",
        diagramSummary: "Shows recursive calls.",
      },
    ],
  };

  const compactPdf = await renderStudyCoachPdf({
    assignmentTitle: "Fibonacci study",
    context,
    payload: basePayload,
  });
  const richPdf = await renderStudyCoachPdf({
    assignmentTitle: "Fibonacci study",
    context,
    payload: {
      ...basePayload,
      portions: [
        {
          label: "Concept in action",
          content: "Here's how this works in practice when you trace the sequence step by step.",
        },
        {
          label: "Your turn",
          content: "Try explaining the next term using the previous two numbers.",
        },
      ],
    },
  });

  assert.equal(compactPdf.subarray(0, 4).toString("utf8"), "%PDF");
  assert.equal(richPdf.subarray(0, 4).toString("utf8"), "%PDF");
  assert.ok(richPdf.length > compactPdf.length + 80);
});

test("study coach files are isolated per student", async () => {
  const teacher = db.createTestTeacher({
    name: "Isolation Files Teacher",
    email: "isolation-files@school.example",
    username: "isolation-files-teacher",
    password: "Teacher123!",
  });
  const classRow = db.getDb().prepare("SELECT id FROM classes WHERE teacher_id = ? LIMIT 1").get(teacher.id);
  const studentA = createStudent(teacher, classRow.id, "a");
  const studentB = createStudent(teacher, classRow.id, "b");
  const { assignmentId } = createAssignedQuiz(teacher, classRow.id);

  await study.postStudyMessage({
    studentId: studentA.id,
    assignmentId,
    message: "Show me key formulas for Fibonacci",
  });

  const sessionA = study.getStudySession(studentA.id, assignmentId);
  const assistantMessage = [...sessionA.messages].reverse().find((entry) => entry.role === "assistant");

  const created = await studyFiles.createStudyCoachFile({
    studentId: studentA.id,
    assignmentId,
    messageId: assistantMessage.id,
  });

  assert.equal(studyFiles.getStudyCoachFileForStudent(studentB.id, created.file.id), null);
  assert.equal(studyFiles.listStudyCoachFiles(studentB.id, assignmentId).length, 0);

  const studentAFile = studyFiles.getStudyCoachFileForStudent(studentA.id, created.file.id);
  assert.ok(studyFiles.readStudyCoachFileBuffer(studentAFile)?.length > 0);
});
