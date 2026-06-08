import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";

const tempDir = mkdtempSync(join(tmpdir(), "littlecode-family-"));
process.env.SQLITE_DATABASE_PATH = join(tempDir, "test.sqlite");

const db = await import("../lib/db.js");
const families = await import("../lib/families.js");

before(() => {
  db.getDb();
});

after(() => {
  db.resetDatabaseForTests();
  rmSync(tempDir, { recursive: true, force: true });
});

test("family can be created with parent admin and family code", () => {
  const { family, parent } = db.createFamilyWithParent({
    familyName: "Davuluri Family",
    familySlug: "davuluri-family",
    name: "Parent One",
    email: "parent@family.test",
    password: "password12345",
  });

  assert.equal(parent.role, "parent");
  assert.equal(parent.family_id, family.id);
  assert.equal(family.owner_user_id, parent.id);
  assert.ok(family.join_code.length >= 6);

  const loaded = families.getFamilyByJoinCode(family.join_code);
  assert.equal(loaded.id, family.id);
});

test("additional parent can join with family code and manage students", () => {
  const { family } = db.createFamilyWithParent({
    familyName: "Join Family",
    familySlug: "join-family",
    name: "Owner Parent",
    email: "owner@family.test",
    password: "password12345",
  });

  const { parent: coParent } = db.joinFamilyAsParent({
    joinCode: family.join_code,
    name: "Co Parent",
    email: "coparent@family.test",
    password: "password12345",
  });

  assert.equal(coParent.role, "parent");
  assert.equal(coParent.family_id, family.id);

  const student = db.createStudentForParent({
    parentId: coParent.id,
    yearLevel: "Year 8",
    name: "Student Child",
    username: "studentchild",
    email: "child@family.test",
    password: "password12345",
  });

  assert.equal(student.username, "studentchild");
  const students = db.listFamilyStudents(family.id);
  assert.equal(students.length, 1);

  const loggedIn = db.findUserByIdentifier("child@family.test", null, family.id);
  assert.equal(loggedIn.role, "student");
  assert.equal(loggedIn.family_id, family.id);
});
