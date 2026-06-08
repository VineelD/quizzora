import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { CURRENT_TERMS_VERSION, assertTermsAccepted } from "../lib/terms.js";
import { dataHostingSignupHint, getDataHostingParagraphs } from "../lib/data-hosting.js";
import { getTermsMeta, getTermsSections } from "../lib/terms-content.js";

const tempDir = mkdtempSync(join(tmpdir(), "littlecode-terms-"));
process.env.SQLITE_DATABASE_PATH = join(tempDir, "terms-test.sqlite");
process.env.ALLOW_SCHOOL_SIGNUP = "true";
process.env.ALLOW_TEACHER_JOIN = "true";
process.env.ALLOW_FAMILY_SIGNUP = "true";

const db = await import("../lib/db.js");

before(() => {
  db.getDb();
});

after(() => {
  db.resetDatabaseForTests();
  rmSync(tempDir, { recursive: true, force: true });
});

const REQUIRED_SECTION_IDS = [
  "acceptance",
  "service-description",
  "accounts",
  "ai-content",
  "educational-use",
  "data-hosting-and-storage",
  "limitation-of-liability",
  "indemnification",
  "disclaimers",
  "third-party",
  "termination",
  "governing-law",
  "contact",
];

function simulateSelfRegistration(registerFn, body) {
  try {
    assertTermsAccepted(body);
    return registerFn({ ...body, acceptTerms: true });
  } catch (error) {
    return { error: error.message };
  }
}

test("assertTermsAccepted rejects missing or false acceptance", () => {
  assert.throws(() => assertTermsAccepted({}), /Terms and Conditions/i);
  assert.throws(() => assertTermsAccepted({ acceptedTerms: false }), /Terms and Conditions/i);
  assert.doesNotThrow(() => assertTermsAccepted({ acceptedTerms: true }));
});

test("terms content includes required legal sections", () => {
  const sections = getTermsSections();
  const ids = sections.map((section) => section.id);
  for (const id of REQUIRED_SECTION_IDS) {
    assert.ok(ids.includes(id), `missing section ${id}`);
  }
  assert.equal(getTermsMeta().version, CURRENT_TERMS_VERSION);
});

test("data hosting signup hint mentions on-premises storage in Australia", () => {
  assert.match(dataHostingSignupHint(), /premises in Australia/i);
});

test("signup rejects registration without terms acceptance", () => {
  const result = simulateSelfRegistration(db.createSchoolWithAdmin, {
    schoolName: "Terms Test School",
    schoolSlug: "terms-test-school",
    name: "Terms Admin",
    email: "terms-admin@school.test",
    password: "Admin12345!",
  });

  assert.match(result.error, /Terms and Conditions/i);
});

test("school registration stores terms acceptance on the admin user", () => {
  const result = simulateSelfRegistration(db.createSchoolWithAdmin, {
    schoolName: "Accepted Terms School",
    schoolSlug: "accepted-terms-school",
    name: "Accepted Admin",
    email: "accepted-admin@school.test",
    password: "Admin12345!",
    acceptedTerms: true,
  });

  assert.ok(result.admin);
  const row = db.getDb().prepare("SELECT terms_accepted_at, terms_version FROM users WHERE id = ?").get(result.admin.id);
  assert.ok(row.terms_accepted_at);
  assert.equal(row.terms_version, CURRENT_TERMS_VERSION);
});

test("teacher join rejects registration without terms acceptance", () => {
  const { school } = db.createSchoolWithAdmin({
    schoolName: "Join Terms School",
    schoolSlug: "join-terms-school",
    name: "Join Admin",
    email: "join-admin@school.test",
    password: "Admin12345!",
    acceptTerms: true,
  });

  const result = simulateSelfRegistration(db.joinSchoolAsTeacher, {
    joinCode: school.join_code,
    name: "Join Teacher",
    email: "join-teacher@school.test",
    password: "Teacher123!",
  });

  assert.match(result.error, /Terms and Conditions/i);
});

test("family registration rejects signup without terms acceptance", () => {
  const result = simulateSelfRegistration(db.createFamilyWithParent, {
    familyName: "Terms Family",
    familySlug: "terms-family",
    name: "Terms Parent",
    email: "terms-parent@family.test",
    password: "Parent12345!",
  });

  assert.match(result.error, /Terms and Conditions/i);
});

test("family parent join rejects signup without terms acceptance", () => {
  const { family } = db.createFamilyWithParent({
    familyName: "Join Terms Family",
    familySlug: "join-terms-family",
    name: "Owner Parent",
    email: "owner-parent@family.test",
    password: "Parent12345!",
    acceptTerms: true,
  });

  const result = simulateSelfRegistration(db.joinFamilyAsParent, {
    joinCode: family.join_code,
    name: "Co Parent",
    email: "co-parent@family.test",
    password: "Parent12345!",
  });

  assert.match(result.error, /Terms and Conditions/i);
});

test("data hosting copy includes on-premises storage and safeguard steps", () => {
  const text = getDataHostingParagraphs().join(" ");
  assert.match(text, /premises/i);
  assert.match(text, /safeguard personal information/i);
  assert.match(dataHostingSignupHint(), /safeguard your data and privacy/i);
});

test("terms page content renders all section headings", () => {
  const sections = getTermsSections();
  assert.ok(sections.length >= REQUIRED_SECTION_IDS.length);
  for (const section of sections) {
    assert.ok(section.title.length > 0);
    assert.ok(section.paragraphs.length > 0);
  }
});
