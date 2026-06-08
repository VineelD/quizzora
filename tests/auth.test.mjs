import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";

const tempDir = mkdtempSync(join(tmpdir(), "littlecode-auth-"));
process.env.SQLITE_DATABASE_PATH = join(tempDir, "auth-test.sqlite");
process.env.ALLOW_SCHOOL_SIGNUP = "true";
process.env.ALLOW_TEACHER_JOIN = "true";

const db = await import("../lib/db.js");
const password = await import("../lib/password.js");

function loginWithIdentifier(identifier, plainPassword, schoolId = null) {
  const user = db.findUserByIdentifier(String(identifier || "").trim(), schoolId);
  if (!user || !password.verifyPassword(plainPassword, user.password_hash)) {
    return null;
  }
  return user;
}

before(() => {
  db.getDb();
});

after(() => {
  db.resetDatabaseForTests();
  rmSync(tempDir, { recursive: true, force: true });
});

test("login accepts email or username with the correct password", () => {
  const teacher = db.createTestTeacher({
    name: "Login Teacher",
    email: "login.teacher@school.example",
    username: "login.teacher",
    password: "Teacher123!",
  });
  const schoolId = teacher.school_id || db.getDefaultSchoolId();

  const byEmail = loginWithIdentifier("login.teacher@school.example", "Teacher123!", schoolId);
  const byUsername = loginWithIdentifier("login.teacher", "Teacher123!", schoolId);
  const wrongPassword = loginWithIdentifier("login.teacher", "WrongPass123!", schoolId);
  const unknownUser = loginWithIdentifier("missing.user", "Teacher123!", schoolId);

  assert.equal(byEmail.id, teacher.id);
  assert.equal(byUsername.id, teacher.id);
  assert.equal(wrongPassword, null);
  assert.equal(unknownUser, null);
});

test("duplicate email is rejected within the same school", () => {
  const schoolId = db.getDefaultSchoolId();
  db.createTeacherAccount({
    name: "First Teacher",
    email: "dup@school.example",
    password: "Teacher123!",
    schoolId,
    role: "teacher",
  });

  assert.throws(
    () =>
      db.createTeacherAccount({
        name: "Second Teacher",
        email: "dup@school.example",
        password: "Teacher123!",
        schoolId,
        role: "teacher",
      }),
    /already in use at this school/i,
  );
});

test("school admin can create students from the educator console", () => {
  const admin = db.createTeacherAccount({
    name: "School Admin",
    email: "admin-educator@school.example",
    password: "Admin12345!",
    schoolId: db.getDefaultSchoolId(),
    role: "admin",
  });

  const student = db.createStudentForTeacher({
    teacherId: admin.id,
    name: "Enrolled Student",
    username: "enrolled.student",
    email: "enrolled.student@school.example",
    password: "Student123!",
    yearLevel: "Year 8",
    actorId: admin.id,
    actorRole: "admin",
  });

  assert.equal(student.year_level, "Year 8");
  assert.equal(db.getTeacherStudents(admin.id).length, 1);
});

test("duplicate derived username is rejected within the same school", () => {
  const schoolId = db.getDefaultSchoolId();
  db.createTeacherAccount({
    name: "Asha Patel",
    email: "ash.patel@school.example",
    password: "Teacher123!",
    schoolId,
    role: "teacher",
  });

  assert.throws(
    () =>
      db.createTeacherAccount({
        name: "Another Asha",
        email: "ash.patel@other.example",
        password: "Teacher123!",
        schoolId,
        role: "teacher",
      }),
    /username is already in use at this school/i,
  );
});

test("duplicate derived username is rejected across different schools", () => {
  db.createSchoolWithAdmin({
    schoolName: "North Username School",
    schoolSlug: "north-username-school",
    name: "North Admin",
    email: "cross.user@north.example",
    password: "Admin12345!",
  });

  assert.throws(
    () =>
      db.createSchoolWithAdmin({
        schoolName: "South Username School",
        schoolSlug: "south-username-school",
        name: "South Admin",
        email: "cross.user@south.example",
        password: "OtherPass123!",
      }),
    /another school/i,
  );
});
