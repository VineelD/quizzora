import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";

const tempDir = mkdtempSync(join(tmpdir(), "littlecode-limits-"));
process.env.SQLITE_DATABASE_PATH = join(tempDir, "limits.sqlite");
process.env.BILLING_TRIAL_DAYS = "7";
process.env.BILLING_TRIAL_MAX_STUDENTS = "2";
process.env.BILLING_TRIAL_MAX_TEACHERS = "1";
process.env.BILLING_TRIAL_MAX_AI_QUIZZES = "1";
process.env.ALLOW_SCHOOL_SIGNUP = "true";
process.env.ALLOW_TEACHER_JOIN = "true";

const db = await import("../lib/db.js");
const { BillingError, assertSchoolSubscription, getSchoolSubscription } = await import(
  "../lib/billing-enforcement.js"
);
const { incrementSchoolAiQuizUsage } = await import("../lib/school-usage.js");

before(() => {
  db.getDb();
});

after(() => {
  db.resetDatabaseForTests();
  rmSync(tempDir, { recursive: true, force: true });
});

test("trial plan exposes configured caps", () => {
  const { school, admin } = db.createSchoolWithAdmin({
    schoolName: "Cap School",
    schoolSlug: "cap-school",
    name: "Admin",
    email: "cap-admin@cap.example",
    password: "Admin12345!",
  });

  const sub = getSchoolSubscription(school.id);
  assert.equal(sub.planKey, "trial");
  assert.equal(sub.limits.maxStudents, 2);
  assert.equal(sub.limits.maxTeachers, 1);
  assert.equal(sub.limits.maxAiQuizzesPerMonth, 1);
  assert.ok(sub.canAddTeacher);
  assert.ok(sub.canAddStudent);
  assert.ok(sub.canGenerateAi);

  db.createTeacherForAdmin({
    adminId: admin.id,
    name: "Teacher One",
    email: "teacher1@cap.example",
    password: "Teacher12345!",
  });

  const afterTeacher = getSchoolSubscription(school.id);
  assert.equal(afterTeacher.usage.teachers, 1);
  assert.equal(afterTeacher.canAddTeacher, false);

  assert.throws(
    () =>
      db.createTeacherForAdmin({
        adminId: admin.id,
        name: "Teacher Two",
        email: "teacher2@cap.example",
        password: "Teacher12345!",
      }),
    (error) => error instanceof BillingError && error.statusCode === 402,
  );
});

test("student and AI usage limits enforce", () => {
  const { school } = db.createSchoolWithAdmin({
    schoolName: "Usage School",
    schoolSlug: "usage-school",
    name: "Admin",
    email: "usage-admin@usage.example",
    password: "Admin12345!",
  });

  const schoolRow = db.getSchoolById(school.id);
  const { teacher } = db.joinSchoolAsTeacher({
    joinCode: schoolRow.join_code,
    name: "Teacher",
    email: "teacher@usage.example",
    password: "Teacher12345!",
  });

  db.createStudentForTeacher({
    teacherId: teacher.id,
    name: "Student A",
    username: "studenta",
    email: "a@usage.example",
    password: "Student12345!",
    yearLevel: "Year 7",
  });
  db.createStudentForTeacher({
    teacherId: teacher.id,
    name: "Student B",
    username: "studentb",
    email: "b@usage.example",
    password: "Student12345!",
    yearLevel: "Year 7",
  });

  assert.throws(
    () =>
      db.createStudentForTeacher({
        teacherId: teacher.id,
        name: "Student C",
        username: "studentc",
        email: "c@usage.example",
        password: "Student12345!",
        yearLevel: "Year 7",
      }),
    (error) => error instanceof BillingError,
  );

  incrementSchoolAiQuizUsage(school.id);
  assert.throws(
    () => assertSchoolSubscription(school.id, { feature: "ai" }),
    (error) => error instanceof BillingError,
  );
});
