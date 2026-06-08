import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";

const tempDir = mkdtempSync(join(tmpdir(), "littlecode-multischool-"));
process.env.SQLITE_DATABASE_PATH = join(tempDir, "multischool.sqlite");
process.env.ALLOW_SCHOOL_SIGNUP = "true";
process.env.ALLOW_TEACHER_JOIN = "true";

const db = await import("../lib/db.js");
const schools = await import("../lib/schools.js");
const platformAuth = await import("../lib/platform-auth.js");
const password = await import("../lib/password.js");

function authenticate(identifier, plainPassword, schoolId = null) {
  const user = platformAuth.resolveUserForLogin(identifier, {
    schoolId,
    familyId: null,
    password: plainPassword,
  });
  if (!user || !password.verifyPassword(plainPassword, user.password_hash)) {
    return null;
  }
  return user;
}

function seedSchoolUser({ schoolId, name, email, username, plainPassword, role }) {
  const result = db
    .getDb()
    .prepare(
      `
      INSERT INTO users (name, username, email, role, password_hash, email_verified_at, school_id)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)
    `,
    )
    .run(name, username, email, role, password.hashPassword(plainPassword), Number(schoolId));
  return Number(result.lastInsertRowid);
}

before(() => {
  db.getDb();
});

after(() => {
  db.resetDatabaseForTests();
  rmSync(tempDir, { recursive: true, force: true });
});

test("duplicate email is rejected across schools when joining as teacher", () => {
  db.createSchoolWithAdmin({
    schoolName: "North High",
    schoolSlug: "north-high",
    name: "North Admin",
    email: "shared@example.com",
    password: "Admin12345!",
  });

  const schoolB = schools.createSchool({ name: "South High", slug: "south-high" });

  assert.throws(
    () =>
      db.createTeacherAccount({
        name: "South Teacher",
        email: "shared@example.com",
        password: "Teacher123!",
        schoolId: schoolB.id,
        role: "teacher",
      }),
    /another school/i,
  );
});

test("login resolves duplicate emails by matching password", () => {
  const east = schools.createSchool({ name: "East", slug: "east" });
  const west = schools.createSchool({ name: "West", slug: "west" });
  seedSchoolUser({
    schoolId: east.id,
    name: "East Admin",
    email: "multi@example.com",
    username: "east.admin",
    plainPassword: "Admin12345!",
    role: "admin",
  });
  seedSchoolUser({
    schoolId: west.id,
    name: "West Teacher",
    email: "multi@example.com",
    username: "west.teacher",
    plainPassword: "Teacher123!",
    role: "teacher",
  });

  assert.equal(platformAuth.identifierNeedsTenantCode("multi@example.com"), true);

  const eastLogin = authenticate("multi@example.com", "Admin12345!", null);
  assert.equal(eastLogin.role, "admin");

  const westLogin = authenticate("multi@example.com", "Teacher123!", null);
  assert.equal(westLogin.role, "teacher");
});

test("login still needs school code when the same password matches multiple schools", () => {
  const alpha = schools.createSchool({ name: "Alpha", slug: "alpha" });
  const beta = schools.createSchool({ name: "Beta", slug: "beta" });
  seedSchoolUser({
    schoolId: alpha.id,
    name: "Alpha Admin",
    email: "shared-pass@example.com",
    username: "alpha.admin",
    plainPassword: "SharedPass123!",
    role: "admin",
  });
  seedSchoolUser({
    schoolId: beta.id,
    name: "Beta Teacher",
    email: "shared-pass@example.com",
    username: "beta.teacher",
    plainPassword: "SharedPass123!",
    role: "teacher",
  });

  assert.equal(authenticate("shared-pass@example.com", "SharedPass123!", null), null);
  assert.equal(platformAuth.loginNeedsTenantCode("shared-pass@example.com", "SharedPass123!"), true);

  const withSchool = authenticate("shared-pass@example.com", "SharedPass123!", alpha.id);
  assert.equal(withSchool.role, "admin");
});

test("teacher can join school with join code", () => {
  const { school } = db.createSchoolWithAdmin({
    schoolName: "Join High",
    schoolSlug: "join-high",
    name: "Join Admin",
    email: "join-admin@join.example",
    password: "Admin12345!",
  });

  const { teacher } = db.joinSchoolAsTeacher({
    joinCode: school.join_code,
    name: "New Teacher",
    email: "teacher@join.example",
    password: "Teacher123!",
  });

  assert.equal(teacher.school_id, school.id);
  assert.equal(teacher.role, "teacher");
});
