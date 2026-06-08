import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { verifyPassword } from "../lib/password.js";

const tempDir = mkdtempSync(join(tmpdir(), "littlecode-platform-auth-"));
process.env.SQLITE_DATABASE_PATH = join(tempDir, "platform-auth.sqlite");
process.env.ALLOW_SCHOOL_SIGNUP = "true";
process.env.ALLOW_FAMILY_SIGNUP = "true";

const db = await import("../lib/db.js");
const families = await import("../lib/families.js");
const superadmin = await import("../lib/superadmin.js");
const support = await import("../lib/support.js");
const platformAuth = await import("../lib/platform-auth.js");
const authTokens = await import("../lib/auth-tokens.js");

let school;

before(() => {
  db.getDb();
  ({ school } = db.createSchoolWithAdmin({
    schoolName: "Platform Auth School",
    schoolSlug: "platform-auth-school",
    name: "School Admin",
    email: "admin@platform-auth.test",
    password: "Admin12345!",
  }));
});

after(() => {
  db.resetDatabaseForTests();
  rmSync(tempDir, { recursive: true, force: true });
});

function login(identifier, password, options = {}) {
  const user = platformAuth.resolveUserForLogin(identifier, { ...options, password });
  if (!user || !verifyPassword(password, user.password_hash)) {
    return null;
  }
  return user;
}

test("super admin can sign in without a tenant code", () => {
  const operator = superadmin.createSuperAdminUser({
    name: "Platform Owner",
    email: "superadmin@test.local",
    username: "superadmin",
    password: "SuperAdmin123!",
  });

  const user = login("superadmin@test.local", "SuperAdmin123!");
  assert.equal(user?.id, operator.id);
  assert.equal(user?.role, "superadmin");
});

test("super admin sign in ignores a mistaken school code", () => {
  const user = login("superadmin", "SuperAdmin123!", { schoolId: school.id });
  assert.equal(user?.role, "superadmin");
});

test("identifierNeedsTenantCode ignores platform-only accounts", () => {
  assert.equal(platformAuth.identifierNeedsTenantCode("superadmin@test.local"), false);
});

test("duplicate email is rejected across different schools", () => {
  db.createSchoolWithAdmin({
    schoolName: "East Auth School",
    schoolSlug: "east-auth-school",
    name: "East Admin",
    email: "dup-auth@example.com",
    password: "Admin12345!",
  });

  assert.throws(
    () =>
      db.createSchoolWithAdmin({
        schoolName: "West Auth School",
        schoolSlug: "west-auth-school",
        name: "West Admin",
        email: "dup-auth@example.com",
        password: "OtherPass123!",
      }),
    /another school/i,
  );
});

test("same email may exist in one school and one family", () => {
  db.createSchoolWithAdmin({
    schoolName: "Shared Email School",
    schoolSlug: "shared-email-school",
    name: "School Admin",
    email: "shared@example.com",
    password: "Admin12345!",
  });

  assert.doesNotThrow(() =>
    db.createFamilyWithParent({
      familyName: "Shared Email Family",
      familySlug: "shared-email-family",
      name: "Family Parent",
      email: "shared@example.com",
      password: "Parent12345!",
    }),
  );
});

test("duplicate email is rejected across different families", () => {
  db.createFamilyWithParent({
    familyName: "Alpha Family",
    familySlug: "alpha-family",
    name: "Alpha Parent",
    email: "dup-family@example.com",
    password: "Parent12345!",
  });

  assert.throws(
    () =>
      db.createFamilyWithParent({
        familyName: "Beta Family",
        familySlug: "beta-family",
        name: "Beta Parent",
        email: "dup-family@example.com",
        password: "OtherParent123!",
      }),
    /another family/i,
  );
});

test("duplicate username is rejected across different schools", () => {
  db.createSchoolWithAdmin({
    schoolName: "East Username School",
    schoolSlug: "east-username-school",
    name: "East Admin",
    email: "dup-user@east.example.com",
    password: "Admin12345!",
  });

  assert.throws(
    () =>
      db.createSchoolWithAdmin({
        schoolName: "West Username School",
        schoolSlug: "west-username-school",
        name: "West Admin",
        email: "dup-user@west.example.com",
        password: "OtherPass123!",
      }),
    /another school/i,
  );
});

test("same username may exist in one school and one family", () => {
  db.createSchoolWithAdmin({
    schoolName: "Shared Username School",
    schoolSlug: "shared-username-school",
    name: "School Admin",
    email: "shared-user@school.example.com",
    password: "Admin12345!",
  });

  assert.doesNotThrow(() =>
    db.createFamilyWithParent({
      familyName: "Shared Username Family",
      familySlug: "shared-username-family",
      name: "Family Parent",
      email: "shared-user@family.example.com",
      password: "Parent12345!",
    }),
  );
});

test("duplicate username is rejected across different families", () => {
  db.createFamilyWithParent({
    familyName: "Alpha Username Family",
    familySlug: "alpha-username-family",
    name: "Alpha Parent",
    email: "dup-user@alpha.example.com",
    password: "Parent12345!",
  });

  assert.throws(
    () =>
      db.createFamilyWithParent({
        familyName: "Beta Username Family",
        familySlug: "beta-username-family",
        name: "Beta Parent",
        email: "dup-user@beta.example.com",
        password: "OtherParent123!",
      }),
    /another family/i,
  );
});

test("loginNeedsTenantCode applies when the same username exists in one school and one family", () => {
  db.createSchoolWithAdmin({
    schoolName: "Shared Login School",
    schoolSlug: "shared-login-school",
    name: "School Admin",
    email: "shared.login@school.example.com",
    password: "SharedPass123!",
  });
  db.createFamilyWithParent({
    familyName: "Shared Login Family",
    familySlug: "shared-login-family",
    name: "Family Parent",
    email: "shared.login@family.example.com",
    password: "SharedPass123!",
  });

  assert.equal(platformAuth.identifierNeedsTenantCode("shared.login"), true);
  assert.equal(platformAuth.loginNeedsTenantCode("shared.login", "SharedPass123!"), true);
});

test("forgot password uses portalType when email exists in one school and one family", async () => {
  const { admin: schoolAdmin } = db.createSchoolWithAdmin({
    schoolName: "Reset School",
    schoolSlug: "reset-school",
    name: "Reset School Admin",
    email: "reset-both@example.com",
    password: "Admin12345!",
  });
  const { parent: familyParent } = db.createFamilyWithParent({
    familyName: "Reset Family",
    familySlug: "reset-family",
    name: "Reset Family Parent",
    email: "reset-both@example.com",
    password: "Parent12345!",
  });

  await authTokens.requestPasswordReset("reset-both@example.com", { portalType: "school" });
  const schoolToken = db
    .getDb()
    .prepare("SELECT user_id FROM auth_tokens WHERE lower(email) = lower(?) ORDER BY id DESC LIMIT 1")
    .get("reset-both@example.com");
  assert.equal(Number(schoolToken.user_id), schoolAdmin.id);

  await authTokens.requestPasswordReset("reset-both@example.com", { portalType: "family" });
  const familyToken = db
    .getDb()
    .prepare("SELECT user_id FROM auth_tokens WHERE lower(email) = lower(?) ORDER BY id DESC LIMIT 1")
    .get("reset-both@example.com");
  assert.equal(Number(familyToken.user_id), familyParent.id);
});

test("forgot password requires join code when portalType is missing for school and family accounts", async () => {
  db.createSchoolWithAdmin({
    schoolName: "Ambiguous School",
    schoolSlug: "ambiguous-school",
    name: "Ambiguous School Admin",
    email: "reset-ambiguous@example.com",
    password: "Admin12345!",
  });
  db.createFamilyWithParent({
    familyName: "Ambiguous Family",
    familySlug: "ambiguous-family",
    name: "Ambiguous Family Parent",
    email: "reset-ambiguous@example.com",
    password: "Parent12345!",
  });

  await assert.rejects(
    () => authTokens.requestPasswordReset("reset-ambiguous@example.com"),
    /school or family code/i,
  );
});

test("support account can sign in with a mistaken family code", () => {
  const family = families.createFamily({
    name: "Platform Auth Family",
    slug: "platform-auth-family",
  });

  const agent = support.createSupportUser({
    name: "Support Agent",
    email: "support@test.local",
    username: "support",
    password: "Support12345!",
  });

  const user = login("support@test.local", "Support12345!", { familyId: family.id });
  assert.equal(user?.id, agent.id);
  assert.equal(user?.role, "support");
});
