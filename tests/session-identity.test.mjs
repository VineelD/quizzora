import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";

const tempDir = mkdtempSync(join(tmpdir(), "littlecode-session-identity-"));
process.env.SQLITE_DATABASE_PATH = join(tempDir, "session-identity.sqlite");
process.env.ALLOW_FAMILY_SIGNUP = "true";
process.env.ALLOW_SCHOOL_SIGNUP = "true";

const db = await import("../lib/db.js");
const superadmin = await import("../lib/superadmin.js");
const support = await import("../lib/support.js");
const { formatSessionIdentity } = await import("../lib/session-identity.js");

before(() => {
  db.getDb();
});

after(() => {
  db.resetDatabaseForTests();
  rmSync(tempDir, { recursive: true, force: true });
});

test("formatSessionIdentity labels platform and school roles", () => {
  superadmin.createSuperAdminUser({
    name: "Platform Owner",
    email: "super@test.local",
    username: "superadmin",
    password: "SuperAdmin123!",
  });

  const platform = formatSessionIdentity(
    db.findUserByIdentifier("super@test.local", null, null),
  );
  assert.equal(platform.roleLabel, "Platform admin");
  assert.equal(platform.tenantLine, null);

  const { admin, school } = db.createSchoolWithAdmin({
    schoolName: "Riverside High",
    schoolSlug: "riverside-high",
    name: "River Admin",
    email: "admin@riverside.test",
    password: "Admin12345!",
  });

  const schoolAdmin = formatSessionIdentity(admin);
  assert.equal(schoolAdmin.roleLabel, "School admin");
  assert.match(schoolAdmin.tenantLine, /Riverside High/);
  assert.match(schoolAdmin.tenantLine, new RegExp(school.join_code));

  const teacher = db.createTeacherAccount({
    name: "River Teacher",
    email: "teacher@riverside.test",
    password: "Teacher123!",
    schoolId: school.id,
    role: "teacher",
  });

  const schoolTeacher = formatSessionIdentity(teacher);
  assert.equal(schoolTeacher.roleLabel, "School teacher");
  assert.match(schoolTeacher.tenantLine, /Riverside High/);
});

test("formatSessionIdentity labels family and student contexts", () => {
  const { parent } = db.createFamilyWithParent({
    familyName: "Davuluri Family",
    familySlug: "davuluri-family",
    name: "Parent One",
    email: "parent@family.test",
    password: "Parent12345!",
  });

  const parentIdentity = formatSessionIdentity(parent);
  assert.equal(parentIdentity.roleLabel, "Family parent");
  assert.match(parentIdentity.tenantLine, /Davuluri Family/);

  const createdStudent = db.createStudentForParent({
    parentId: parent.id,
    name: "Student One",
    username: "student.one",
    email: "student@family.test",
    password: "Student123!",
    yearLevel: "Year 8",
  });

  const studentIdentity = formatSessionIdentity(db.getUserById(createdStudent.id));
  assert.equal(studentIdentity.roleLabel, "Student");
  assert.match(studentIdentity.tenantLine, /Davuluri Family/);

  support.createSupportUser({
    name: "Support Agent",
    email: "support@test.local",
    username: "support",
    password: "Support12345!",
  });

  const supportIdentity = formatSessionIdentity(
    db.findUserByIdentifier("support@test.local", null, null),
  );
  assert.equal(supportIdentity.roleLabel, "Support staff");
});
