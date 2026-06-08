import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";

const tempDir = mkdtempSync(join(tmpdir(), "littlecode-superadmin-"));
process.env.SQLITE_DATABASE_PATH = join(tempDir, "test.sqlite");

const db = await import("../lib/db.js");
const superadmin = await import("../lib/superadmin.js");

before(() => {
  db.getDb();
});

after(() => {
  db.resetDatabaseForTests();
  rmSync(tempDir, { recursive: true, force: true });
});

test("super admin can be created and listed across schools", () => {
  const user = superadmin.createSuperAdminUser({
    name: "Operator",
    email: "superadmin@test.local",
    username: "superadmin",
    password: "very-secure-password",
  });

  assert.equal(user.role, "superadmin");
  assert.equal(user.school_id, null);

  db.createSchoolWithAdmin({
    schoolName: "North High",
    schoolSlug: "north-high",
    name: "North Admin",
    email: "north-admin@north.test",
    password: "password12345",
  });

  const schools = superadmin.listSchoolsWithUserCounts();
  assert.ok(schools.length >= 2);
  const users = superadmin.listUsersAcrossSchools({ role: "admin" });
  assert.ok(users.some((entry) => entry.email === "north-admin@north.test"));
  assert.ok(!users.some((entry) => entry.email === "superadmin@test.local"));
});

test("super admin can create, update, and delete managed accounts", () => {
  const operator = superadmin.createSuperAdminUser({
    name: "Operator",
    email: "operator@test.local",
    username: "operator",
    password: "very-secure-password",
  });

  const { school } = db.createSchoolWithAdmin({
    schoolName: "South High",
    schoolSlug: "south-high",
    name: "South Admin",
    email: "south-admin@south.test",
    password: "password12345",
  });

  const teacher = superadmin.createManagedUser({
    actorId: operator.id,
    schoolId: school.id,
    role: "teacher",
    name: "South Teacher",
    email: "teacher@south.test",
    password: "password12345",
  });

  assert.equal(teacher.role, "teacher");
  assert.equal(teacher.schoolId, school.id);

  const updated = superadmin.updateManagedUser({
    actorId: operator.id,
    userId: teacher.id,
    name: "South Lead Teacher",
    email: "lead@south.test",
  });

  assert.equal(updated.name, "South Lead Teacher");
  assert.equal(updated.email, "lead@south.test");

  const deleted = superadmin.deleteManagedUser({
    actorId: operator.id,
    userId: teacher.id,
  });

  assert.equal(deleted.deleted, true);
  assert.equal(superadmin.getManagedUserById(teacher.id), null);
});

test("super admin cannot delete their own account", () => {
  const operator = superadmin.createSuperAdminUser({
    name: "Operator Two",
    email: "operator2@test.local",
    username: "operator2",
    password: "very-secure-password",
  });

  assert.throws(
    () =>
      superadmin.deleteManagedUser({
        actorId: operator.id,
        userId: operator.id,
      }),
    /cannot modify your own account/i,
  );
});
