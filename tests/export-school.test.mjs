import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";

const tempDir = mkdtempSync(join(tmpdir(), "littlecode-export-"));
process.env.SQLITE_DATABASE_PATH = join(tempDir, "export.sqlite");
process.env.ALLOW_SCHOOL_SIGNUP = "true";

const db = await import("../lib/db.js");
const { getAdminOnboardingSnapshot } = await import("../lib/admin-onboarding.js");

before(() => {
  db.getDb();
});

after(() => {
  db.resetDatabaseForTests();
  rmSync(tempDir, { recursive: true, force: true });
});

test("school CSV exports include roster and marks", () => {
  const { school, admin } = db.createSchoolWithAdmin({
    schoolName: "Export High",
    schoolSlug: "export-high",
    name: "Admin",
    email: "export-admin@export.example",
    password: "Admin12345!",
  });

  const teacher = db.createTeacherForAdmin({
    adminId: admin.id,
    name: "Teacher One",
    email: "export-teacher@export.example",
    password: "Teacher12345!",
  });

  db.createStudentForTeacher({
    teacherId: teacher.id,
    name: "Student A",
    username: "studenta",
    email: "a@export.example",
    password: "Student12345!",
    yearLevel: "Year 7",
  });

  const [klass] = db.getTeacherClasses(teacher.id);
  db.insertGeneratedQuiz({
    teacherId: teacher.id,
    classId: klass.id,
    title: "Science: Mixtures",
    request: { subject: "Science", focus: "Mixtures", difficulty: "core", questionCount: 3 },
    generated: {
      source: "Built-in sample",
      quiz: {
        subject: "Science",
        focus: "Mixtures",
        yearLevel: "Year 7",
        curriculumSummary: "Mixtures sample.",
        learningIntentions: ["Separate mixtures."],
        questions: [
          { question: "What is a mixture?", options: ["A", "B", "C", "D"], answer: "A", explanation: "Sample." },
        ],
      },
    },
  });

  const studentsCsv = db.exportSchoolStudentsCsv(school.id);
  assert.match(studentsCsv, /Student A/);
  assert.match(studentsCsv, /Teacher One/);
  assert.match(studentsCsv, /Year 7/);

  const marksCsv = db.exportSchoolMarksCsv(school.id);
  assert.match(marksCsv, /Student A/);
  assert.ok(marksCsv.includes("not_started") || marksCsv.includes("submitted"));
});

test("admin onboarding snapshot tracks setup progress", () => {
  const { school, admin } = db.createSchoolWithAdmin({
    schoolName: "Onboard High",
    schoolSlug: "onboard-high",
    name: "Admin",
    email: "onboard-admin@onboard.example",
    password: "Admin12345!",
  });

  const initial = getAdminOnboardingSnapshot(school.id);
  assert.equal(initial.billingActive, true);
  assert.equal(initial.teacherCount, 0);
  assert.equal(initial.studentCount, 0);

  db.createTeacherForAdmin({
    adminId: admin.id,
    name: "Teacher",
    email: "onboard-teacher@onboard.example",
    password: "Teacher12345!",
  });

  const afterTeacher = getAdminOnboardingSnapshot(school.id);
  assert.equal(afterTeacher.teacherCount, 1);
});
