import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { hashPassword } from "./password.js";
import { isSudokuAssignment, SUDOKU_SUBJECT } from "./assignment-categories.js";
import { ensureQuestionVisuals, normalizeQuizQuestionsForDisplay } from "./question-display.js";
import { canSubmitSudoku, generateSudokuPuzzle, normalizeSudokuGrid, normalizeSudokuDifficulty } from "./sudoku.js";
import { logAudit } from "./audit.js";
import { ensureAuthTokenGuardianPurpose, ensureSchoolsAndAudit } from "./db-migrate-extra.js";
import { ensureBillingSchema } from "./db-migrate-billing.js";
import { ensureMultiSchoolSchema } from "./db-migrate-multischool.js";
import { ensureStudySchema } from "./db-migrate-study.js";
import { ensureSuperAdminSchema } from "./db-migrate-superadmin.js";
import { ensureSupportSchema } from "./db-migrate-support.js";
import { ensureFamilySchema } from "./db-migrate-family.js";
import { ensureFamilyBillingSchema } from "./db-migrate-family-billing.js";
import { ensureQuizJobSchema } from "./db-migrate-quiz-jobs.js";
import { ensureDiagramCacheSchema } from "./db-migrate-diagram-cache.js";
import { ensureQuizTimingSchema } from "./db-migrate-quiz-timing.js";
import { ensureTermsSchema } from "./db-migrate-terms.js";
import { termsAcceptanceFields } from "./terms.js";
import {
  createFamily,
  familyAllowsParentJoin,
  familyAllowsPublicSignup,
  getFamilyById,
  getFamilyByJoinCode,
  setFamilyOwner,
} from "./families.js";
import {
  createSchool,
  getSchoolByJoinCode,
  schoolAllowsPublicSignup,
  schoolAllowsTeacherJoin,
} from "./schools.js";
import {
  assertCanAddFamilyStudents,
  assertCanAddStudents,
  assertFamilySubscription,
  assertSchoolSubscription,
  recordAiQuizGeneration,
  recordFamilyAiQuizGeneration,
} from "./billing-enforcement.js";
import { canSubmitBeforeDue, parseDueAt } from "./dates.js";
import { classNameForYearLevel, normalizeYearLevel } from "./year-levels.js";
import { assertQuizUnlockedForSubmit } from "./study.js";
import { applyTimingToQuestions, computeOverallTimeLimitSeconds } from "./quiz-timing.js";

const dbPath = process.env.SQLITE_DATABASE_PATH || join(process.cwd(), "data", "littlecode.sqlite");

let database;

export function getDb() {
  if (!database) {
    mkdirSync(dirname(dbPath), { recursive: true });
    const db = new DatabaseSync(dbPath);
    db.exec("PRAGMA foreign_keys = ON");
    db.exec("PRAGMA journal_mode = WAL");
    db.exec("PRAGMA busy_timeout = 5000");
    migrate(db);
    database = db;
    seed();
  }
  return database;
}

export function resetDatabaseForTests() {
  if (database) {
    database.close();
  }
  database = undefined;
}

function migrate(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      username TEXT,
      email TEXT NOT NULL UNIQUE,
      role TEXT NOT NULL CHECK(role IN ('teacher', 'student', 'admin')),
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS user_profiles (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      display_name TEXT NOT NULL,
      year_level TEXT,
      guardian_email TEXT,
      phone TEXT,
      learning_needs TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS classes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      year_level TEXT NOT NULL,
      teacher_id INTEGER NOT NULL REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS class_students (
      class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      PRIMARY KEY (class_id, student_id)
    );

    CREATE TABLE IF NOT EXISTS quizzes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      subject TEXT NOT NULL,
      focus TEXT NOT NULL,
      year_level TEXT NOT NULL,
      difficulty TEXT NOT NULL,
      source TEXT NOT NULL,
      curriculum_summary TEXT NOT NULL,
      learning_intentions_json TEXT NOT NULL,
      questions_json TEXT NOT NULL,
      teacher_id INTEGER NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS quiz_assignments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      quiz_id INTEGER NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
      class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      due_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS submissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      assignment_id INTEGER NOT NULL REFERENCES quiz_assignments(id) ON DELETE CASCADE,
      student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      answers_json TEXT NOT NULL,
      score INTEGER NOT NULL,
      total INTEGER NOT NULL,
      submitted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (assignment_id, student_id)
    );

    CREATE TABLE IF NOT EXISTS quiz_question_images (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      quiz_id INTEGER REFERENCES quizzes(id) ON DELETE CASCADE,
      content_type TEXT NOT NULL,
      image_data BLOB NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS auth_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      purpose TEXT NOT NULL CHECK(purpose IN ('login', 'register', 'invite')),
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      role TEXT,
      name TEXT,
      metadata_json TEXT,
      expires_at TEXT NOT NULL,
      used_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  ensureColumn(db, "users", "username", "TEXT");
  ensureColumn(db, "users", "email_verified_at", "TEXT");
  db.exec(`
    UPDATE users
    SET username = lower(substr(email, 1, instr(email, '@') - 1))
    WHERE username IS NULL OR trim(username) = '';

    CREATE INDEX IF NOT EXISTS auth_tokens_email_created_idx ON auth_tokens(lower(email), created_at);
  `);
  ensureAuthTokenPurposes(db);
  ensureAuthTokenGuardianPurpose(db);
  ensureSchoolsAndAudit(db);
  ensureBillingSchema(db);
  ensureMultiSchoolSchema(db);
  ensureStudySchema(db);
  ensureSuperAdminSchema(db);
  ensureSupportSchema(db);
  ensureFamilySchema(db);
  ensureFamilyBillingSchema(db);
  ensureQuizJobSchema(db);
  ensureDiagramCacheSchema(db);
  ensureQuizTimingSchema(db);
  ensureTermsSchema(db);
  purgeDemoUsers(db);
  ensureProfiles(db);
}

function seed() {
  ensureProfiles(getDb());
}

function ensureAuthTokenPurposes(db) {
  const row = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'auth_tokens'").get();
  if (row?.sql?.includes("reset_password")) {
    return;
  }

  db.exec(`
    CREATE TABLE auth_tokens_migrated (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      purpose TEXT NOT NULL CHECK(purpose IN ('login', 'register', 'invite', 'reset_password')),
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      role TEXT,
      name TEXT,
      metadata_json TEXT,
      expires_at TEXT NOT NULL,
      used_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    INSERT INTO auth_tokens_migrated (
      id, email, token_hash, purpose, user_id, role, name, metadata_json, expires_at, used_at, created_at
    )
    SELECT
      id, email, token_hash, purpose, user_id, role, name, metadata_json, expires_at, used_at, created_at
    FROM auth_tokens;

    DROP TABLE auth_tokens;
    ALTER TABLE auth_tokens_migrated RENAME TO auth_tokens;
    CREATE INDEX IF NOT EXISTS auth_tokens_email_created_idx ON auth_tokens(lower(email), created_at);
  `);
}

function purgeDemoUsers(db) {
  const demoUsers = db
    .prepare(
      `
      SELECT id, role
      FROM users
      WHERE lower(email) LIKE '%@littlecode.local'
         OR lower(email) IN ('teacher@littlecode.local', 'student@littlecode.local', 'student2@littlecode.local')
    `,
    )
    .all();

  const teachers = demoUsers.filter((user) => user.role === "teacher");
  const students = demoUsers.filter((user) => user.role === "student");

  for (const teacher of teachers) {
    deleteTeacherAndDependencies(db, teacher.id);
  }

  for (const student of students) {
    deleteStudentAndDependencies(db, student.id);
  }

  db.prepare(
    `
    DELETE FROM users
    WHERE lower(email) LIKE '%@littlecode.local'
       OR lower(email) IN ('teacher@littlecode.local', 'student@littlecode.local', 'student2@littlecode.local')
  `,
  ).run();
}

function deleteTeacherAndDependencies(db, teacherId) {
  db.prepare(
    `
    DELETE FROM submissions
    WHERE assignment_id IN (
      SELECT qa.id
      FROM quiz_assignments qa
      JOIN quizzes q ON q.id = qa.quiz_id
      WHERE q.teacher_id = ?
    )
  `,
  ).run(teacherId);
  db.prepare(
    `
    DELETE FROM quiz_assignments
    WHERE quiz_id IN (SELECT id FROM quizzes WHERE teacher_id = ?)
  `,
  ).run(teacherId);
  db.prepare("DELETE FROM quiz_question_images WHERE quiz_id IN (SELECT id FROM quizzes WHERE teacher_id = ?)").run(teacherId);
  db.prepare("DELETE FROM quizzes WHERE teacher_id = ?").run(teacherId);
  db.prepare("DELETE FROM class_students WHERE class_id IN (SELECT id FROM classes WHERE teacher_id = ?)").run(teacherId);
  db.prepare("DELETE FROM classes WHERE teacher_id = ?").run(teacherId);
  db.prepare("DELETE FROM auth_tokens WHERE user_id = ?").run(teacherId);
  db.prepare("DELETE FROM users WHERE id = ?").run(teacherId);
}

function deleteStudentAndDependencies(db, studentId) {
  db.prepare("DELETE FROM study_messages WHERE student_id = ?").run(studentId);
  db.prepare("DELETE FROM assignment_study_progress WHERE student_id = ?").run(studentId);
  db.prepare("DELETE FROM submissions WHERE student_id = ?").run(studentId);
  db.prepare("DELETE FROM class_students WHERE student_id = ?").run(studentId);
  db.prepare("DELETE FROM user_profiles WHERE user_id = ?").run(studentId);
  db.prepare("DELETE FROM auth_tokens WHERE user_id = ?").run(studentId);
  db.prepare("DELETE FROM users WHERE id = ?").run(studentId);
}

export function countTeachers() {
  return getDb().prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'teacher'").get().count;
}

export function markEmailVerified(userId) {
  getDb()
    .prepare(
      `
      UPDATE users
      SET email_verified_at = COALESCE(email_verified_at, CURRENT_TIMESTAMP)
      WHERE id = ?
    `,
    )
    .run(userId);
}

export function findUserByUsername(username, schoolId = null, familyId = null) {
  const cleanUsername = normalizeUsername(username);
  if (!cleanUsername) {
    return null;
  }
  if (familyId != null) {
    return toPlainRow(
      getDb()
        .prepare("SELECT * FROM users WHERE family_id = ? AND lower(username) = lower(?)")
        .get(Number(familyId), cleanUsername),
    );
  }
  if (schoolId != null) {
    return toPlainRow(
      getDb()
        .prepare("SELECT * FROM users WHERE school_id = ? AND lower(username) = lower(?)")
        .get(Number(schoolId), cleanUsername),
    );
  }
  return toPlainRow(getDb().prepare("SELECT * FROM users WHERE lower(username) = lower(?)").get(cleanUsername));
}

function findSchoolEmailConflict(email, excludeSchoolId = null, excludeUserId = null) {
  const cleanEmail = normalizeStudentEmail(email);
  const params = [cleanEmail];
  let sql = `
    SELECT * FROM users
    WHERE lower(email) = lower(?)
      AND school_id IS NOT NULL
  `;
  if (excludeSchoolId != null) {
    sql += " AND school_id != ?";
    params.push(Number(excludeSchoolId));
  }
  if (excludeUserId != null) {
    sql += " AND id != ?";
    params.push(Number(excludeUserId));
  }
  sql += " LIMIT 1";
  return toPlainRow(getDb().prepare(sql).get(...params));
}

function findFamilyEmailConflict(email, excludeFamilyId = null, excludeUserId = null) {
  const cleanEmail = normalizeStudentEmail(email);
  const params = [cleanEmail];
  let sql = `
    SELECT * FROM users
    WHERE lower(email) = lower(?)
      AND family_id IS NOT NULL
  `;
  if (excludeFamilyId != null) {
    sql += " AND family_id != ?";
    params.push(Number(excludeFamilyId));
  }
  if (excludeUserId != null) {
    sql += " AND id != ?";
    params.push(Number(excludeUserId));
  }
  sql += " LIMIT 1";
  return toPlainRow(getDb().prepare(sql).get(...params));
}

function findSchoolUsernameConflict(username, excludeSchoolId = null, excludeUserId = null) {
  const cleanUsername = normalizeUsername(username);
  const params = [cleanUsername];
  let sql = `
    SELECT * FROM users
    WHERE lower(username) = lower(?)
      AND school_id IS NOT NULL
  `;
  if (excludeSchoolId != null) {
    sql += " AND school_id != ?";
    params.push(Number(excludeSchoolId));
  }
  if (excludeUserId != null) {
    sql += " AND id != ?";
    params.push(Number(excludeUserId));
  }
  sql += " LIMIT 1";
  return toPlainRow(getDb().prepare(sql).get(...params));
}

function findFamilyUsernameConflict(username, excludeFamilyId = null, excludeUserId = null) {
  const cleanUsername = normalizeUsername(username);
  const params = [cleanUsername];
  let sql = `
    SELECT * FROM users
    WHERE lower(username) = lower(?)
      AND family_id IS NOT NULL
  `;
  if (excludeFamilyId != null) {
    sql += " AND family_id != ?";
    params.push(Number(excludeFamilyId));
  }
  if (excludeUserId != null) {
    sql += " AND id != ?";
    params.push(Number(excludeUserId));
  }
  sql += " LIMIT 1";
  return toPlainRow(getDb().prepare(sql).get(...params));
}

export function assertEmailAvailable(email, schoolId, excludeUserId = null) {
  const cleanEmail = normalizeStudentEmail(email);
  const resolvedSchoolId = requireSchoolId(schoolId);
  const existing = findUserByEmail(cleanEmail, resolvedSchoolId);
  if (existing && Number(existing.id) !== Number(excludeUserId)) {
    throw new Error(
      `That email is already in use at this school (${existing.role} “${existing.name}”, username ${existing.username}). Delete that account first or use a different email.`,
    );
  }
  const otherSchool = findSchoolEmailConflict(cleanEmail, resolvedSchoolId, excludeUserId);
  if (otherSchool) {
    throw new Error(
      "That email is already registered at another school. Sign in to that school or use a different email address.",
    );
  }
  return cleanEmail;
}

export function assertUsernameAvailable(username, schoolId, excludeUserId = null) {
  const cleanUsername = normalizeUsername(username);
  if (!cleanUsername) {
    throw new Error("Username is required.");
  }
  const resolvedSchoolId = requireSchoolId(schoolId);
  const existing = findUserByUsername(cleanUsername, resolvedSchoolId);
  if (existing && Number(existing.id) !== Number(excludeUserId)) {
    throw new Error(
      `That username is already in use at this school (${existing.role} “${existing.name}”, email ${existing.email}).`,
    );
  }
  const otherSchool = findSchoolUsernameConflict(cleanUsername, resolvedSchoolId, excludeUserId);
  if (otherSchool) {
    throw new Error(
      "That username is already registered at another school. Sign in to that school or use a different username.",
    );
  }
  return cleanUsername;
}

function requireSchoolId(schoolId) {
  const resolved = Number(schoolId);
  if (!resolved) {
    throw new Error("School context is required.");
  }
  return resolved;
}

function requireFamilyId(familyId) {
  const resolved = Number(familyId);
  if (!resolved) {
    throw new Error("Family context is required.");
  }
  return resolved;
}

export function assertFamilyEmailAvailable(email, familyId, excludeUserId = null) {
  const cleanEmail = normalizeStudentEmail(email);
  const resolvedFamilyId = requireFamilyId(familyId);
  const existing = findUserByEmail(cleanEmail, null, resolvedFamilyId);
  if (existing && Number(existing.id) !== Number(excludeUserId)) {
    throw new Error(
      `That email is already in use in this family (${existing.role} “${existing.name}”, username ${existing.username}).`,
    );
  }
  const otherFamily = findFamilyEmailConflict(cleanEmail, resolvedFamilyId, excludeUserId);
  if (otherFamily) {
    throw new Error(
      "That email is already registered with another family. Sign in to that family or use a different email address.",
    );
  }
  return cleanEmail;
}

export function assertFamilyUsernameAvailable(username, familyId, excludeUserId = null) {
  const cleanUsername = normalizeUsername(username);
  if (!cleanUsername) {
    throw new Error("Username is required.");
  }
  const resolvedFamilyId = requireFamilyId(familyId);
  const existing = findUserByUsername(cleanUsername, null, resolvedFamilyId);
  if (existing && Number(existing.id) !== Number(excludeUserId)) {
    throw new Error(
      `That username is already in use in this family (${existing.role} “${existing.name}”, email ${existing.email}).`,
    );
  }
  const otherFamily = findFamilyUsernameConflict(cleanUsername, resolvedFamilyId, excludeUserId);
  if (otherFamily) {
    throw new Error(
      "That username is already registered with another family. Sign in to that family or use a different username.",
    );
  }
  return cleanUsername;
}

export function normalizeStudentEmail(email) {
  return String(email || "")
    .trim()
    .toLowerCase();
}

export function validateStudentEmail(email) {
  const cleanEmail = normalizeStudentEmail(email);
  if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    throw new Error("A valid student email is required.");
  }
  if (cleanEmail.endsWith("@littlecode.local")) {
    throw new Error("Use a real email address the student can access.");
  }
  return cleanEmail;
}

function validateStudentName(name) {
  const trimmed = String(name || "").trim();
  if (trimmed.length < 2) {
    throw new Error("Name must be at least 2 characters.");
  }
  return trimmed;
}

function resolveStudentPassword(password, { required = false } = {}) {
  const value = String(password || "");
  if (!value) {
    if (required) {
      throw new Error("Password is required.");
    }
    return null;
  }
  return hashPassword(value);
}

export function getDefaultSchoolId() {
  return Number(getDb().prepare("SELECT id FROM schools ORDER BY id LIMIT 1").get().id);
}

export function getSchoolById(schoolId) {
  return toPlainRow(getDb().prepare("SELECT * FROM schools WHERE id = ?").get(schoolId));
}

export function createSchoolWithAdmin({ schoolName, schoolSlug, name, email, password, acceptTerms = false }) {
  if (!schoolAllowsPublicSignup()) {
    throw new Error("New school registration is disabled on this site.");
  }
  const school = createSchool({ name: schoolName, slug: schoolSlug });
  const admin = createTeacherAccount({
    name,
    email,
    password,
    schoolId: school.id,
    role: "admin",
    acceptTerms,
  });
  logAudit({
    actorId: admin.id,
    actorRole: "admin",
    action: "school.created",
    entityType: "school",
    entityId: school.id,
    summary: `Registered school ${school.name}`,
    metadata: { slug: school.slug },
  });
  return { school, admin };
}

export function joinSchoolAsTeacher({ joinCode, name, email, password, acceptTerms = false }) {
  if (!schoolAllowsTeacherJoin()) {
    throw new Error("Joining a school with a code is disabled. Ask your administrator to add you.");
  }
  const school = getSchoolByJoinCode(joinCode);
  if (!school) {
    throw new Error("Invalid school code.");
  }
  const teacher = createTeacherAccount({
    name,
    email,
    password,
    schoolId: school.id,
    role: "teacher",
    acceptTerms,
  });
  return { school, teacher };
}

export function createParentAccount({ name, email, password, familyId, username = null, acceptTerms = false }) {
  const db = getDb();
  const resolvedFamilyId = requireFamilyId(familyId);
  const cleanEmail = assertFamilyEmailAvailable(email, resolvedFamilyId);
  const cleanUsername = assertFamilyUsernameAvailable(username || cleanEmail.split("@")[0], resolvedFamilyId);
  const passwordHash = hashPassword(password);
  const trimmedName = validateStudentName(name);
  const terms = acceptTerms ? termsAcceptanceFields() : { termsAcceptedAt: null, termsVersion: null };

  const result = db
    .prepare(
      `
      INSERT INTO users (name, username, email, role, password_hash, email_verified_at, family_id, terms_accepted_at, terms_version)
      VALUES (?, ?, ?, 'parent', ?, CURRENT_TIMESTAMP, ?, ?, ?)
    `,
    )
    .run(
      trimmedName,
      cleanUsername,
      cleanEmail,
      passwordHash,
      resolvedFamilyId,
      terms.termsAcceptedAt,
      terms.termsVersion,
    );

  const parentId = Number(result.lastInsertRowid);
  db.prepare("INSERT INTO user_profiles (user_id, display_name, year_level) VALUES (?, ?, NULL)").run(
    parentId,
    trimmedName,
  );

  logAudit({
    actorId: parentId,
    actorRole: "parent",
    action: "user.created",
    entityType: "user",
    entityId: parentId,
    summary: `Created parent account ${cleanUsername}`,
  });

  return getUserById(parentId);
}

export function createFamilyWithParent({ familyName, familySlug, name, email, password, acceptTerms = false }) {
  if (!familyAllowsPublicSignup()) {
    throw new Error("New family registration is disabled on this site.");
  }
  const family = createFamily({ name: familyName, slug: familySlug });
  const parent = createParentAccount({
    name,
    email,
    password,
    familyId: family.id,
    acceptTerms,
  });
  setFamilyOwner(family.id, parent.id);
  logAudit({
    actorId: parent.id,
    actorRole: "parent",
    action: "family.created",
    entityType: "family",
    entityId: family.id,
    summary: `Registered family ${family.name}`,
    metadata: { slug: family.slug },
  });
  return { family: getFamilyById(family.id), parent };
}

export function joinFamilyAsParent({ joinCode, name, email, password, acceptTerms = false }) {
  if (!familyAllowsParentJoin()) {
    throw new Error("Joining a family with a code is disabled. Ask your family administrator to add you.");
  }
  const family = getFamilyByJoinCode(joinCode);
  if (!family) {
    throw new Error("Invalid family code.");
  }
  assertFamilySubscription(family.id, { feature: "addParent" });
  const parent = createParentAccount({
    name,
    email,
    password,
    familyId: family.id,
    acceptTerms,
  });
  return { family, parent };
}

export function createTeacherAccount({ name, email, password, schoolId, role = null, acceptTerms = false }) {
  const db = getDb();
  const resolvedSchoolId = requireSchoolId(schoolId ?? getDefaultSchoolId());
  const cleanEmail = assertEmailAvailable(email, resolvedSchoolId);
  const username = assertUsernameAvailable(cleanEmail.split("@")[0], resolvedSchoolId);
  const passwordHash = hashPassword(password);
  const resolvedRole = role || "teacher";
  const terms = acceptTerms ? termsAcceptanceFields() : { termsAcceptedAt: null, termsVersion: null };

  const result = db
    .prepare(
      `
      INSERT INTO users (name, username, email, role, password_hash, email_verified_at, school_id, terms_accepted_at, terms_version)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?, ?)
    `,
    )
    .run(
      name.trim(),
      username,
      cleanEmail,
      resolvedRole,
      passwordHash,
      resolvedSchoolId,
      terms.termsAcceptedAt,
      terms.termsVersion,
    );

  const teacherId = Number(result.lastInsertRowid);
  db.prepare(
    `
    INSERT INTO user_profiles (user_id, display_name, year_level)
    VALUES (?, ?, NULL)
  `,
  ).run(teacherId, name.trim());

  logAudit({
    actorId: teacherId,
    actorRole: resolvedRole,
    action: "user.created",
    entityType: "user",
    entityId: teacherId,
    summary: `Created ${resolvedRole} account ${username}`,
  });

  return getUserById(teacherId);
}

export function countAdmins() {
  return getDb().prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'admin'").get().count;
}

export function listSchoolTeachers(schoolId) {
  return toPlainRows(
    getDb()
      .prepare(
        `
        SELECT id, name, username, email, role, created_at
        FROM users
        WHERE school_id = ? AND role IN ('teacher', 'admin')
        ORDER BY role DESC, name
      `,
      )
      .all(schoolId),
  );
}

export function createTeacherForAdmin({ adminId, name, email, password }) {
  const admin = getUserById(adminId);
  if (!admin || admin.role !== "admin") {
    throw new Error("Forbidden.");
  }

  assertSchoolSubscription(admin.school_id, { feature: "addTeacher" });

  const trimmedName = validateStudentName(name);
  const cleanEmail = assertEmailAvailable(email, admin.school_id);
  const username = assertUsernameAvailable(cleanEmail.split("@")[0], admin.school_id);
  const passwordHash = resolveStudentPassword(password, { required: true });
  const db = getDb();

  const result = db
    .prepare(
      `
      INSERT INTO users (name, username, email, role, password_hash, email_verified_at, school_id)
      VALUES (?, ?, ?, 'teacher', ?, CURRENT_TIMESTAMP, ?)
    `,
    )
    .run(trimmedName, username, cleanEmail, passwordHash, admin.school_id);

  const teacherId = Number(result.lastInsertRowid);
  db.prepare("INSERT INTO user_profiles (user_id, display_name, year_level) VALUES (?, ?, NULL)").run(
    teacherId,
    trimmedName,
  );

  logAudit({
    actorId: adminId,
    actorRole: "admin",
    action: "teacher.created",
    entityType: "user",
    entityId: teacherId,
    summary: `Admin created teacher ${username}`,
  });

  return getUserById(teacherId);
}

export function deleteTeacherForAdmin({ adminId, teacherId }) {
  const admin = getUserById(adminId);
  if (!admin || admin.role !== "admin") {
    throw new Error("Forbidden.");
  }

  const teacher = getDb()
    .prepare("SELECT id, role, school_id, username FROM users WHERE id = ?")
    .get(teacherId);

  if (!teacher || teacher.role !== "teacher" || Number(teacher.school_id) !== Number(admin.school_id)) {
    throw new Error("Teacher not found.");
  }

  deleteTeacherAndDependencies(getDb(), teacherId);

  logAudit({
    actorId: adminId,
    actorRole: "admin",
    action: "teacher.deleted",
    entityType: "user",
    entityId: teacherId,
    summary: `Deleted teacher ${teacher.username}`,
  });

  return { id: teacherId, deleted: true };
}

export function getOrCreateClassForYearLevel(teacherId, yearLevel) {
  const db = getDb();
  const cleanYear = normalizeYearLevel(yearLevel);
  const existing = db
    .prepare("SELECT id FROM classes WHERE teacher_id = ? AND year_level = ?")
    .get(teacherId, cleanYear);

  if (existing) {
    return Number(existing.id);
  }

  const result = db
    .prepare("INSERT INTO classes (name, year_level, teacher_id) VALUES (?, ?, ?)")
    .run(classNameForYearLevel(cleanYear), cleanYear, teacherId);
  return Number(result.lastInsertRowid);
}

export function findUserByEmail(email, schoolId = null, familyId = null) {
  if (familyId != null) {
    return toPlainRow(
      getDb()
        .prepare("SELECT * FROM users WHERE family_id = ? AND lower(email) = lower(?)")
        .get(Number(familyId), email),
    );
  }
  if (schoolId != null) {
    return toPlainRow(
      getDb()
        .prepare("SELECT * FROM users WHERE school_id = ? AND lower(email) = lower(?)")
        .get(Number(schoolId), email),
    );
  }
  return toPlainRow(getDb().prepare("SELECT * FROM users WHERE lower(email) = lower(?)").get(email));
}

export function findUsersByIdentifier(identifier) {
  return toPlainRows(
    getDb()
      .prepare("SELECT * FROM users WHERE lower(email) = lower(?) OR lower(username) = lower(?)")
      .all(identifier, identifier),
  );
}

export function tenantKeyForUser(user) {
  if (!user) {
    return null;
  }
  if (user.family_id != null) {
    return `family:${user.family_id}`;
  }
  if (user.school_id != null) {
    return `school:${user.school_id}`;
  }
  return `user:${user.id}`;
}

export function findUserByIdentifier(identifier, schoolId = null, familyId = null) {
  if (familyId != null) {
    return toPlainRow(
      getDb()
        .prepare(
          `
          SELECT * FROM users
          WHERE family_id = ?
            AND (lower(email) = lower(?) OR lower(username) = lower(?))
        `,
        )
        .get(Number(familyId), identifier, identifier),
    );
  }

  if (schoolId != null) {
    return toPlainRow(
      getDb()
        .prepare(
          `
          SELECT * FROM users
          WHERE school_id = ?
            AND (lower(email) = lower(?) OR lower(username) = lower(?))
        `,
        )
        .get(Number(schoolId), identifier, identifier),
    );
  }

  const matches = findUsersByIdentifier(identifier);
  if (matches.length === 1) {
    return matches[0];
  }
  if (matches.length > 1) {
    return null;
  }
  return null;
}

export function getUserById(id) {
  return toPlainRow(
    getDb()
      .prepare("SELECT id, name, username, email, role, email_verified_at, school_id, family_id FROM users WHERE id = ?")
      .get(id),
  );
}

export function getTeacherClasses(teacherId) {
  const rows = getDb()
    .prepare(
      `
      SELECT c.*,
        COUNT(cs.student_id) AS student_count
      FROM classes c
      LEFT JOIN class_students cs ON cs.class_id = c.id
      WHERE c.teacher_id = ?
      GROUP BY c.id
      ORDER BY c.name
    `,
    )
    .all(teacherId);
  return toPlainRows(rows);
}

export function getClassStudents(classId) {
  const rows = getDb()
    .prepare(
      `
      SELECT u.id, u.name, u.username, u.email, p.year_level, p.guardian_email, p.learning_needs
      FROM class_students cs
      JOIN users u ON u.id = cs.student_id
      LEFT JOIN user_profiles p ON p.user_id = u.id
      WHERE cs.class_id = ?
      ORDER BY u.name
    `,
    )
    .all(classId);
  return toPlainRows(rows);
}

export function getTeacherStudents(teacherId) {
  const rows = getDb()
    .prepare(
      `
      SELECT
        u.id,
        u.name,
        u.username,
        u.email,
        c.name AS class_name,
        p.year_level,
        p.guardian_email,
        p.learning_needs
      FROM classes c
      JOIN class_students cs ON cs.class_id = c.id
      JOIN users u ON u.id = cs.student_id
      LEFT JOIN user_profiles p ON p.user_id = u.id
      WHERE c.teacher_id = ?
      ORDER BY c.name, u.name
    `,
    )
    .all(teacherId);
  return toPlainRows(rows);
}

export function updateUserPassword(userId, password) {
  const passwordHash = hashPassword(password);
  getDb().prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(passwordHash, userId);
}

export function getTeacherStudent(teacherId, studentId) {
  const row = getDb()
    .prepare(
      `
      SELECT
        u.id,
        u.name,
        u.username,
        u.email,
        c.id AS class_id,
        c.name AS class_name,
        p.year_level,
        p.guardian_email,
        p.learning_needs
      FROM users u
      JOIN class_students cs ON cs.student_id = u.id
      JOIN classes c ON c.id = cs.class_id
      LEFT JOIN user_profiles p ON p.user_id = u.id
      WHERE u.id = ? AND u.role = 'student' AND c.teacher_id = ?
      LIMIT 1
    `,
    )
    .get(studentId, teacherId);
  return row ? toPlainRow(row) : null;
}

export function createStudentForTeacher({
  teacherId,
  yearLevel,
  name,
  username,
  email,
  password,
  guardianEmail,
  learningNeeds,
  actorId = teacherId,
  actorRole = "teacher",
  skipSubscriptionCheck = false,
}) {
  const db = getDb();
  const teacher = getUserById(teacherId);
  if (!teacher) {
    throw new Error("Teacher not found.");
  }

  if (!skipSubscriptionCheck) {
    assertSchoolSubscription(teacher.school_id, { feature: "addStudent" });
  }

  const classId = getOrCreateClassForYearLevel(teacherId, yearLevel);
  const trimmedName = validateStudentName(name);
  const teacherSchoolId = teacher.school_id || getDefaultSchoolId();
  const cleanUsername = assertUsernameAvailable(username, teacherSchoolId);
  const studentEmail = assertEmailAvailable(validateStudentEmail(email), teacherSchoolId);
  const passwordHash = resolveStudentPassword(password, { required: true });

  const insertUser = db.prepare(
    "INSERT INTO users (name, username, email, role, password_hash, email_verified_at, school_id) VALUES (?, ?, ?, 'student', ?, CURRENT_TIMESTAMP, ?)",
  );
  const userResult = insertUser.run(
    trimmedName,
    cleanUsername,
    studentEmail,
    passwordHash,
    teacherSchoolId,
  );
  const studentId = Number(userResult.lastInsertRowid);

  db.prepare(
    `
    INSERT INTO user_profiles (user_id, display_name, year_level, guardian_email, learning_needs)
    VALUES (?, ?, ?, ?, ?)
  `,
  ).run(studentId, trimmedName, normalizeYearLevel(yearLevel), guardianEmail || null, learningNeeds || null);
  db.prepare("INSERT INTO class_students (class_id, student_id) VALUES (?, ?)").run(classId, studentId);

  logAudit({
    actorId,
    actorRole,
    action: "student.created",
    entityType: "student",
    entityId: studentId,
    summary: `Created student ${cleanUsername}`,
  });

  return getTeacherStudent(teacherId, studentId);
}

export function updateStudentForTeacher({
  teacherId,
  studentId,
  yearLevel,
  name,
  username,
  email,
  password,
  guardianEmail,
  learningNeeds,
}) {
  const existing = getTeacherStudent(teacherId, studentId);
  if (!existing) {
    throw new Error("Student not found.");
  }

  const db = getDb();
  const teacher = getUserById(teacherId);
  const teacherSchoolId = teacher?.school_id || getDefaultSchoolId();
  const trimmedName = validateStudentName(name);
  const cleanUsername = assertUsernameAvailable(username, teacherSchoolId, studentId);
  const studentEmail = assertEmailAvailable(validateStudentEmail(email), teacherSchoolId, studentId);
  const passwordHash = resolveStudentPassword(password);

  db.prepare("UPDATE users SET name = ?, username = ?, email = ? WHERE id = ?").run(
    trimmedName,
    cleanUsername,
    studentEmail,
    studentId,
  );
  if (passwordHash) {
    db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(passwordHash, studentId);
  }

  db.prepare(
    `
    UPDATE user_profiles
    SET display_name = ?, year_level = ?, guardian_email = ?, learning_needs = ?, updated_at = CURRENT_TIMESTAMP
    WHERE user_id = ?
  `,
  ).run(trimmedName, normalizeYearLevel(yearLevel), guardianEmail || null, learningNeeds || null, studentId);

  const classId = getOrCreateClassForYearLevel(teacherId, yearLevel);
  db.prepare(
    `
    DELETE FROM class_students
    WHERE student_id = ? AND class_id IN (SELECT id FROM classes WHERE teacher_id = ?)
  `,
  ).run(studentId, teacherId);
  db.prepare("INSERT INTO class_students (class_id, student_id) VALUES (?, ?)").run(classId, studentId);

  logAudit({
    actorId: teacherId,
    actorRole: "teacher",
    action: "student.updated",
    entityType: "student",
    entityId: studentId,
    summary: `Updated student ${cleanUsername}`,
  });

  return getTeacherStudent(teacherId, studentId);
}

export function deleteStudentForTeacher({ teacherId, studentId, actorId = teacherId, actorRole = "teacher" }) {
  const existing = getTeacherStudent(teacherId, studentId);
  if (!existing) {
    throw new Error("Student not found.");
  }

  deleteStudentAndDependencies(getDb(), studentId);

  logAudit({
    actorId,
    actorRole,
    action: "student.deleted",
    entityType: "student",
    entityId: studentId,
    summary: `Deleted student ${existing.username}`,
  });

  return { id: studentId, deleted: true };
}

export function listFamilyStudents(familyId) {
  return toPlainRows(
    getDb()
      .prepare(
        `
        SELECT
          u.id,
          u.name,
          u.username,
          u.email,
          p.year_level,
          p.learning_needs
        FROM users u
        LEFT JOIN user_profiles p ON p.user_id = u.id
        WHERE u.family_id = ? AND u.role = 'student'
        ORDER BY u.name
      `,
      )
      .all(Number(familyId)),
  );
}

export function getFamilyStudent(familyId, studentId) {
  const row = getDb()
    .prepare(
      `
      SELECT
        u.id,
        u.name,
        u.username,
        u.email,
        p.year_level,
        p.learning_needs
      FROM users u
      LEFT JOIN user_profiles p ON p.user_id = u.id
      WHERE u.id = ? AND u.role = 'student' AND u.family_id = ?
      LIMIT 1
    `,
    )
    .get(studentId, Number(familyId));
  return row ? toPlainRow(row) : null;
}

export function createStudentForParent({
  parentId,
  yearLevel,
  name,
  username,
  email,
  password,
  learningNeeds,
  actorId = parentId,
  actorRole = "parent",
}) {
  const db = getDb();
  const parent = getUserById(parentId);
  if (!parent || parent.role !== "parent" || !parent.family_id) {
    throw new Error("Parent not found.");
  }

  const familyId = parent.family_id;
  assertCanAddFamilyStudents(familyId);
  const normalizedYear = normalizeYearLevel(yearLevel);
  const classId = getOrCreateClassForYearLevel(parentId, normalizedYear);
  const trimmedName = validateStudentName(name);
  const cleanUsername = assertFamilyUsernameAvailable(username, familyId);
  const studentEmail = assertFamilyEmailAvailable(validateStudentEmail(email), familyId);
  const passwordHash = resolveStudentPassword(password, { required: true });

  const insertUser = db.prepare(
    "INSERT INTO users (name, username, email, role, password_hash, email_verified_at, family_id) VALUES (?, ?, ?, 'student', ?, CURRENT_TIMESTAMP, ?)",
  );
  const userResult = insertUser.run(trimmedName, cleanUsername, studentEmail, passwordHash, familyId);
  const studentId = Number(userResult.lastInsertRowid);

  db.prepare(
    `
    INSERT INTO user_profiles (user_id, display_name, year_level, guardian_email, learning_needs)
    VALUES (?, ?, ?, ?, ?)
  `,
  ).run(studentId, trimmedName, normalizedYear, parent.email, learningNeeds || null);

  db.prepare("INSERT INTO class_students (class_id, student_id) VALUES (?, ?)").run(classId, studentId);

  logAudit({
    actorId,
    actorRole,
    action: "student.created",
    entityType: "student",
    entityId: studentId,
    summary: `Parent created student ${cleanUsername}`,
  });

  return getFamilyStudent(familyId, studentId);
}

export function updateStudentForParent({
  parentId,
  studentId,
  yearLevel,
  name,
  username,
  email,
  password,
  learningNeeds,
}) {
  const parent = getUserById(parentId);
  if (!parent || parent.role !== "parent" || !parent.family_id) {
    throw new Error("Parent not found.");
  }

  const existing = getFamilyStudent(parent.family_id, studentId);
  if (!existing) {
    throw new Error("Student not found.");
  }

  const db = getDb();
  const trimmedName = validateStudentName(name);
  const cleanUsername = assertFamilyUsernameAvailable(username, parent.family_id, studentId);
  const studentEmail = assertFamilyEmailAvailable(validateStudentEmail(email), parent.family_id, studentId);
  const passwordHash = resolveStudentPassword(password);

  db.prepare("UPDATE users SET name = ?, username = ?, email = ? WHERE id = ?").run(
    trimmedName,
    cleanUsername,
    studentEmail,
    studentId,
  );
  if (passwordHash) {
    db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(passwordHash, studentId);
  }

  const normalizedYear = normalizeYearLevel(yearLevel);
  db.prepare(
    `
    UPDATE user_profiles
    SET display_name = ?, year_level = ?, learning_needs = ?, updated_at = CURRENT_TIMESTAMP
    WHERE user_id = ?
  `,
  ).run(trimmedName, normalizedYear, learningNeeds || null, studentId);

  const classId = getOrCreateClassForYearLevel(parentId, normalizedYear);
  db.prepare(
    `
    DELETE FROM class_students
    WHERE student_id = ? AND class_id IN (SELECT id FROM classes WHERE teacher_id = ?)
  `,
  ).run(studentId, parentId);
  db.prepare("INSERT INTO class_students (class_id, student_id) VALUES (?, ?)").run(classId, studentId);

  logAudit({
    actorId: parentId,
    actorRole: "parent",
    action: "student.updated",
    entityType: "student",
    entityId: studentId,
    summary: `Parent updated student ${cleanUsername}`,
  });

  return getFamilyStudent(parent.family_id, studentId);
}

export function deleteStudentForParent({ parentId, studentId, actorId = parentId, actorRole = "parent" }) {
  const parent = getUserById(parentId);
  if (!parent || parent.role !== "parent" || !parent.family_id) {
    throw new Error("Parent not found.");
  }

  const existing = getFamilyStudent(parent.family_id, studentId);
  if (!existing) {
    throw new Error("Student not found.");
  }

  deleteStudentAndDependencies(getDb(), studentId);

  logAudit({
    actorId,
    actorRole,
    action: "student.deleted",
    entityType: "student",
    entityId: studentId,
    summary: `Parent deleted student ${existing.username}`,
  });

  return { id: studentId, deleted: true };
}

export function deleteUserAndDependencies(userId) {
  const user = getUserById(userId);
  if (!user) {
    throw new Error("User not found.");
  }

  const db = getDb();
  if (user.role === "teacher" || user.role === "admin") {
    deleteTeacherAndDependencies(db, userId);
    return { id: userId, deleted: true, role: user.role };
  }

  if (user.role === "student") {
    deleteStudentAndDependencies(db, userId);
    return { id: userId, deleted: true, role: user.role };
  }

  if (user.role === "support") {
    db.prepare("UPDATE support_tickets SET assigned_to_user_id = NULL WHERE assigned_to_user_id = ?").run(userId);
    db.prepare("DELETE FROM auth_tokens WHERE user_id = ?").run(userId);
    db.prepare("DELETE FROM user_profiles WHERE user_id = ?").run(userId);
    db.prepare("DELETE FROM users WHERE id = ?").run(userId);
    return { id: userId, deleted: true, role: user.role };
  }

  throw new Error(`Cannot delete user with role “${user.role}”.`);
}

export function insertGeneratedQuiz({ teacherId, yearLevel, classId, title, request, generated }) {
  const resolvedClassId = classId || getOrCreateClassForYearLevel(teacherId, yearLevel || request?.yearLevel || generated?.quiz?.yearLevel);
  const db = getDb();
  const quiz = generated.quiz;
  const timedMode = request?.timedMode !== false;
  const questionsWithTiming = applyTimingToQuestions(quiz.questions, {
    questionStyle: request?.questionStyle,
    difficulty: request?.difficulty,
  });
  const overallTimeLimitSeconds = timedMode ? computeOverallTimeLimitSeconds(questionsWithTiming) : null;

  const insertQuiz = db.prepare(`
    INSERT INTO quizzes (
      title, subject, focus, year_level, difficulty, source, curriculum_summary,
      learning_intentions_json, questions_json, teacher_id,
      selected_topics_json, selected_subtopics_json
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const quizResult = insertQuiz.run(
    title,
    quiz.subject,
    quiz.focus,
    quiz.yearLevel,
    request.difficulty,
    generated.source,
    quiz.curriculumSummary,
    JSON.stringify(quiz.learningIntentions),
    JSON.stringify(questionsWithTiming),
    teacherId,
    JSON.stringify(request.selectedTopics || []),
    JSON.stringify(request.selectedSubtopics || []),
  );
  const dueAt = parseDueAt(request.dueAt);
  const assignmentResult = db
    .prepare(
      "INSERT INTO quiz_assignments (quiz_id, class_id, due_at, timed_mode, overall_time_limit_seconds) VALUES (?, ?, ?, ?, ?)",
    )
    .run(
      quizResult.lastInsertRowid,
      resolvedClassId,
      dueAt,
      timedMode ? 1 : 0,
      overallTimeLimitSeconds,
    );

  const quizId = Number(quizResult.lastInsertRowid);
  const assignmentId = Number(assignmentResult.lastInsertRowid);
  attachQuizImagesToQuiz(quizId, questionsWithTiming);

  logAudit({
    actorId: teacherId,
    actorRole: "teacher",
    action: "assignment.created",
    entityType: "assignment",
    entityId: assignmentId,
    summary: `Assigned quiz ${title}`,
    metadata: { quizId, classId: resolvedClassId, dueAt },
  });

  const teacher = getUserById(teacherId);
  if (teacher?.family_id) {
    recordFamilyAiQuizGeneration(teacher.family_id, generated.source);
  } else if (teacher?.school_id) {
    recordAiQuizGeneration(teacher.school_id, generated.source);
  }

  return { quizId, assignmentId };
}

export function insertSudokuAssignment({ teacherId, yearLevel, difficulty, dueAt = null }) {
  const normalizedYear = normalizeYearLevel(yearLevel);
  const normalizedDifficulty = normalizeSudokuDifficulty(difficulty);
  const puzzlePayload = generateSudokuPuzzle(normalizedDifficulty);
  const resolvedClassId = getOrCreateClassForYearLevel(teacherId, normalizedYear);
  const db = getDb();
  const insertQuiz = db.prepare(`
    INSERT INTO quizzes (
      title, subject, focus, year_level, difficulty, source, curriculum_summary,
      learning_intentions_json, questions_json, teacher_id
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const quizResult = insertQuiz.run(
    `Sudoku: ${normalizedDifficulty}`,
    SUDOKU_SUBJECT,
    normalizedDifficulty,
    normalizedYear,
    normalizedDifficulty.toLowerCase(),
    "Generated puzzle",
    "Complete the 9×9 Sudoku grid. Each row, column, and 3×3 box must contain digits 1–9 without repeats.",
    JSON.stringify([]),
    JSON.stringify(puzzlePayload),
    teacherId,
  );
  const parsedDueAt = parseDueAt(dueAt);
  const assignmentResult = db
    .prepare("INSERT INTO quiz_assignments (quiz_id, class_id, due_at) VALUES (?, ?, ?)")
    .run(quizResult.lastInsertRowid, resolvedClassId, parsedDueAt);

  const assignmentId = Number(assignmentResult.lastInsertRowid);
  logAudit({
    actorId: teacherId,
    actorRole: "teacher",
    action: "assignment.created",
    entityType: "assignment",
    entityId: assignmentId,
    summary: `Assigned Sudoku ${normalizedDifficulty}`,
    metadata: { dueAt: parsedDueAt },
  });

  return {
    quizId: Number(quizResult.lastInsertRowid),
    assignmentId,
  };
}

export function listTeacherQuizzes(teacherId) {
  return toPlainRows(
    getDb()
      .prepare(
        `
        SELECT id, title, subject, focus, year_level, created_at
        FROM quizzes
        WHERE teacher_id = ?
        ORDER BY created_at DESC
        LIMIT 100
      `,
      )
      .all(teacherId),
  );
}

export function assignExistingQuiz({ teacherId, quizId, yearLevel, dueAt = null }) {
  const quiz = getDb()
    .prepare("SELECT id, title, teacher_id FROM quizzes WHERE id = ? AND teacher_id = ?")
    .get(quizId, teacherId);
  if (!quiz) {
    throw new Error("Quiz not found.");
  }

  const classId = getOrCreateClassForYearLevel(teacherId, yearLevel);
  const parsedDueAt = parseDueAt(dueAt);
  const assignmentResult = getDb()
    .prepare("INSERT INTO quiz_assignments (quiz_id, class_id, due_at) VALUES (?, ?, ?)")
    .run(quizId, classId, parsedDueAt);

  const assignmentId = Number(assignmentResult.lastInsertRowid);
  logAudit({
    actorId: teacherId,
    actorRole: "teacher",
    action: "assignment.created",
    entityType: "assignment",
    entityId: assignmentId,
    summary: `Re-assigned quiz ${quiz.title}`,
    metadata: { quizId, dueAt: parsedDueAt },
  });

  return { quizId, assignmentId };
}

export function getTeacherClassDashboard(teacherId) {
  return toPlainRows(
    getDb()
      .prepare(
        `
        SELECT
          c.id AS class_id,
          c.name AS class_name,
          c.year_level,
          COUNT(DISTINCT cs.student_id) AS student_count,
          COUNT(DISTINCT qa.id) AS assignment_count,
          COUNT(slots.slot_id) AS total_slots,
          SUM(CASE WHEN slots.submitted_at IS NOT NULL THEN 1 ELSE 0 END) AS submitted_count,
          SUM(
            CASE
              WHEN slots.submitted_at IS NULL AND slots.answers_json IS NOT NULL AND TRIM(slots.answers_json) != ''
              THEN 1
              ELSE 0
            END
          ) AS in_progress_count,
          SUM(
            CASE
              WHEN slots.submitted_at IS NULL
                AND (slots.answers_json IS NULL OR TRIM(slots.answers_json) = '')
              THEN 1
              ELSE 0
            END
          ) AS not_started_count,
          COALESCE(ROUND(AVG(CASE WHEN slots.total > 0 THEN 100.0 * slots.score / slots.total END)), 0) AS average_percent,
          MAX(slots.submitted_at) AS last_activity_at
        FROM classes c
        LEFT JOIN class_students cs ON cs.class_id = c.id
        LEFT JOIN quiz_assignments qa ON qa.class_id = c.id
        LEFT JOIN (
          SELECT
            cs.class_id,
            cs.student_id || '-' || qa.id AS slot_id,
            s.submitted_at,
            s.answers_json,
            s.score,
            s.total
          FROM class_students cs
          JOIN quiz_assignments qa ON qa.class_id = cs.class_id
          JOIN classes c2 ON c2.id = cs.class_id
          LEFT JOIN submissions s ON s.assignment_id = qa.id AND s.student_id = cs.student_id
          WHERE c2.teacher_id = ?
        ) slots ON slots.class_id = c.id
        WHERE c.teacher_id = ?
        GROUP BY c.id
        ORDER BY c.name
      `,
      )
      .all(teacherId, teacherId),
  );
}

export function updateSchoolForAdmin({ adminId, name, allowLateSubmissions }) {
  const admin = getUserById(adminId);
  if (!admin || admin.role !== "admin") {
    throw new Error("Forbidden.");
  }

  const school = getSchoolById(admin.school_id);
  if (!school) {
    throw new Error("School not found.");
  }

  const nextName = name !== undefined ? String(name).trim() : school.name;
  if (nextName.length < 2) {
    throw new Error("School name is required.");
  }

  const allowLate =
    allowLateSubmissions === undefined ? school.allow_late_submissions : allowLateSubmissions ? 1 : 0;

  getDb()
    .prepare("UPDATE schools SET name = ?, allow_late_submissions = ? WHERE id = ?")
    .run(nextName, allowLate, school.id);

  logAudit({
    actorId: adminId,
    actorRole: "admin",
    action: "school.updated",
    entityType: "school",
    entityId: school.id,
    summary: `Updated school settings for ${nextName}`,
    metadata: { allowLateSubmissions: allowLate === 1 },
  });

  return getSchoolById(school.id);
}

export function exportSchoolStudentsCsv(schoolId) {
  const rows = getDb()
    .prepare(
      `
      SELECT
        u.name,
        u.username,
        u.email,
        p.year_level,
        c.name AS class_name,
        t.name AS teacher_name,
        t.email AS teacher_email,
        p.guardian_email
      FROM users u
      JOIN class_students cs ON cs.student_id = u.id
      JOIN classes c ON c.id = cs.class_id
      JOIN users t ON t.id = c.teacher_id
      LEFT JOIN user_profiles p ON p.user_id = u.id
      WHERE u.school_id = ? AND u.role = 'student'
      ORDER BY t.name, c.name, u.name
    `,
    )
    .all(Number(schoolId));

  const headers = [
    "Name",
    "Username",
    "Email",
    "Year level",
    "Class",
    "Teacher",
    "Teacher email",
    "Guardian email",
  ];
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(
      [
        csvEscape(row.name),
        csvEscape(row.username),
        csvEscape(row.email),
        csvEscape(row.year_level),
        csvEscape(row.class_name),
        csvEscape(row.teacher_name),
        csvEscape(row.teacher_email),
        csvEscape(row.guardian_email),
      ].join(","),
    );
  }
  return lines.join("\n");
}

export function exportSchoolMarksCsv(schoolId) {
  const rows = getDb()
    .prepare(
      `
      SELECT
        q.title,
        q.subject,
        c.name AS class_name,
        t.name AS teacher_name,
        stu.name AS student_name,
        stu.email AS student_email,
        stu.username AS student_username,
        CASE
          WHEN s.submitted_at IS NOT NULL THEN 'submitted'
          WHEN s.answers_json IS NOT NULL AND TRIM(s.answers_json) != '' THEN 'in_progress'
          ELSE 'not_started'
        END AS status,
        s.score,
        s.total,
        CASE WHEN s.total > 0 THEN ROUND(100.0 * s.score / s.total) ELSE NULL END AS percent,
        s.submitted_at
      FROM quiz_assignments qa
      JOIN quizzes q ON q.id = qa.quiz_id
      JOIN classes c ON c.id = qa.class_id
      JOIN users t ON t.id = c.teacher_id
      JOIN class_students cs ON cs.class_id = c.id
      JOIN users stu ON stu.id = cs.student_id
      LEFT JOIN submissions s ON s.assignment_id = qa.id AND s.student_id = stu.id
      WHERE t.school_id = ?
      ORDER BY qa.created_at DESC, stu.name
    `,
    )
    .all(Number(schoolId));

  const headers = [
    "Quiz",
    "Subject",
    "Class",
    "Teacher",
    "Student",
    "Email",
    "Username",
    "Status",
    "Score",
    "Total",
    "Percent",
    "Submitted at",
  ];
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(
      [
        csvEscape(row.title),
        csvEscape(row.subject),
        csvEscape(row.class_name),
        csvEscape(row.teacher_name),
        csvEscape(row.student_name),
        csvEscape(row.student_email),
        csvEscape(row.student_username),
        csvEscape(row.status),
        row.score ?? "",
        row.total ?? "",
        row.percent ?? "",
        csvEscape(row.submitted_at || ""),
      ].join(","),
    );
  }
  return lines.join("\n");
}

export function exportAssignmentMarksCsv(teacherId, assignmentId) {
  const report = getAssignmentReport(teacherId, assignmentId);
  if (!report) {
    throw new Error("Assignment not found.");
  }

  const headers = ["Student", "Email", "Username", "Status", "Score", "Total", "Percent", "Submitted"];
  const lines = [headers.join(",")];
  for (const student of report.students) {
    lines.push(
      [
        csvEscape(student.name),
        csvEscape(student.email),
        csvEscape(student.username),
        csvEscape(student.status),
        student.score ?? "",
        student.total ?? "",
        student.percent ?? "",
        csvEscape(student.submitted_at || ""),
      ].join(","),
    );
  }
  return lines.join("\n");
}

function csvEscape(value) {
  const text = String(value ?? "");
  if (text.includes(",") || text.includes('"') || text.includes("\n")) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function importStudentsFromCsv({ teacherId, rows }) {
  const teacher = getUserById(teacherId);
  if (!teacher) {
    throw new Error("Teacher not found.");
  }

  assertSchoolSubscription(teacher.school_id, { feature: "csvImport" });
  assertCanAddStudents(teacher.school_id, rows.length);

  const results = { created: 0, errors: [] };
  for (const [index, row] of rows.entries()) {
    try {
      createStudentForTeacher({
        teacherId,
        name: row.name,
        username: row.username,
        email: row.email,
        password: row.password,
        yearLevel: row.yearLevel || "Year 7",
        guardianEmail: row.guardianEmail || "",
        learningNeeds: row.learningNeeds || "",
      });
      results.created += 1;
    } catch (error) {
      results.errors.push({ row: index + 2, message: error.message });
    }
  }
  logAudit({
    actorId: teacherId,
    actorRole: "teacher",
    action: "students.imported",
    entityType: "class",
    entityId: teacherId,
    summary: `CSV import: ${results.created} created, ${results.errors.length} errors`,
  });
  return results;
}

export function insertQuizImage(imageData, contentType = "image/png", quizId = null) {
  const result = getDb()
    .prepare(
      `
      INSERT INTO quiz_question_images (quiz_id, content_type, image_data)
      VALUES (?, ?, ?)
    `,
    )
    .run(quizId, contentType, imageData);
  return Number(result.lastInsertRowid);
}

export function getQuizImage(imageId) {
  const row = getDb()
    .prepare(
      `
      SELECT content_type, image_data
      FROM quiz_question_images
      WHERE id = ?
    `,
    )
    .get(imageId);

  if (!row) {
    return null;
  }

  const imageData = Buffer.isBuffer(row.image_data) ? row.image_data : Buffer.from(row.image_data);
  return {
    contentType: row.content_type,
    imageData,
  };
}

export function attachQuizImagesToQuiz(quizId, questions) {
  const attach = getDb().prepare(
    `
    UPDATE quiz_question_images
    SET quiz_id = ?
    WHERE id = ? AND (quiz_id IS NULL OR quiz_id = ?)
  `,
  );

  for (const question of questions) {
    const imageId = extractQuizImageId(question.imageUrl);
    if (imageId) {
      attach.run(quizId, imageId, quizId);
    }
  }
}

export function updateQuizQuestions(quizId, questions) {
  getDb()
    .prepare("UPDATE quizzes SET questions_json = ? WHERE id = ?")
    .run(JSON.stringify(questions), quizId);
  attachQuizImagesToQuiz(quizId, questions);
}

export function extractQuizImageId(imageUrl) {
  if (!imageUrl || String(imageUrl).startsWith("data:")) {
    return null;
  }

  const match = String(imageUrl).match(/\/api\/quiz-media\/(\d+)(?:\.[a-z0-9]+)?$/i);
  return match ? Number(match[1]) : null;
}

export function getTeacherAssignments(teacherId) {
  const rows = getDb()
    .prepare(
      `
      SELECT
        qa.id AS assignment_id,
        q.id AS quiz_id,
        q.title,
        q.subject,
        q.focus,
        q.source,
        c.name AS class_name,
        COUNT(DISTINCT cs.student_id) AS student_count,
        COUNT(DISTINCT s.student_id) AS submitted_count,
        COALESCE(ROUND(AVG(CASE WHEN s.total > 0 THEN 100.0 * s.score / s.total END)), 0) AS average_percent
      FROM quiz_assignments qa
      JOIN quizzes q ON q.id = qa.quiz_id
      JOIN classes c ON c.id = qa.class_id
      LEFT JOIN class_students cs ON cs.class_id = c.id
      LEFT JOIN submissions s ON s.assignment_id = qa.id
      WHERE q.teacher_id = ?
      GROUP BY qa.id
      ORDER BY qa.created_at DESC
    `,
    )
    .all(teacherId);
  return toPlainRows(rows);
}

export function getAssignmentReport(teacherId, assignmentId) {
  const db = getDb();
  const assignment = db
    .prepare(
      `
      SELECT qa.id AS assignment_id, q.*, c.name AS class_name, c.id AS class_id
      FROM quiz_assignments qa
      JOIN quizzes q ON q.id = qa.quiz_id
      JOIN classes c ON c.id = qa.class_id
      WHERE qa.id = ? AND q.teacher_id = ?
    `,
    )
    .get(assignmentId, teacherId);

  if (!assignment) {
    return null;
  }

  const rows = toPlainRows(
    db
      .prepare(
        `
      SELECT u.id, u.name, u.username, u.email, s.score, s.total, s.submitted_at, s.answers_json
      FROM class_students cs
      JOIN users u ON u.id = cs.student_id
      LEFT JOIN submissions s ON s.assignment_id = ? AND s.student_id = u.id
      WHERE cs.class_id = ?
      ORDER BY u.name
    `,
      )
      .all(assignmentId, assignment.class_id),
  );

  const report = mapQuizRow(assignment);
  logAudit({
    actorId: teacherId,
    actorRole: "teacher",
    action: "report.viewed",
    entityType: "assignment",
    entityId: assignmentId,
    summary: `Viewed report for ${report.title}`,
  });
  return {
    ...report,
    students: rows.map((row) => {
      let sudokuSubmission = null;
      if (row.answers_json) {
        try {
          sudokuSubmission = JSON.parse(row.answers_json);
        } catch {
          sudokuSubmission = null;
        }
      }
      return {
        ...row,
        username: row.username,
        status: row.submitted_at ? "Submitted" : "Not submitted",
        percent: row.total ? Math.round((row.score / row.total) * 100) : null,
        sudokuSubmission,
      };
    }),
  };
}

export function getStudentAssignments(studentId) {
  return getDb()
    .prepare(
      `
      SELECT
        qa.id AS assignment_id,
        qa.due_at,
        qa.timed_mode,
        qa.overall_time_limit_seconds,
        q.*,
        c.name AS class_name,
        COALESCE(sch.allow_late_submissions, fam.allow_late_submissions, 1) AS allow_late,
        s.score,
        s.total,
        s.submitted_at
      FROM quiz_assignments qa
      JOIN quizzes q ON q.id = qa.quiz_id
      JOIN classes c ON c.id = qa.class_id
      JOIN class_students cs ON cs.class_id = c.id
      JOIN users stu ON stu.id = cs.student_id
      LEFT JOIN schools sch ON sch.id = stu.school_id
      LEFT JOIN families fam ON fam.id = stu.family_id
      LEFT JOIN submissions s ON s.assignment_id = qa.id AND s.student_id = ?
      WHERE cs.student_id = ?
      ORDER BY qa.created_at DESC
    `,
    )
    .all(studentId, studentId)
    .map(mapQuizRow);
}

export function getStudentAssignment(studentId, assignmentId) {
  const row = getDb()
    .prepare(
      `
      SELECT qa.id AS assignment_id, qa.due_at, qa.timed_mode, qa.overall_time_limit_seconds, q.*, c.name AS class_name, COALESCE(sch.allow_late_submissions, 1) AS allow_late, s.answers_json, s.score, s.total, s.submitted_at
      FROM quiz_assignments qa
      JOIN quizzes q ON q.id = qa.quiz_id
      JOIN classes c ON c.id = qa.class_id
      JOIN class_students cs ON cs.class_id = c.id
      JOIN users stu ON stu.id = cs.student_id
      LEFT JOIN schools sch ON sch.id = stu.school_id
      LEFT JOIN submissions s ON s.assignment_id = qa.id AND s.student_id = ?
      WHERE cs.student_id = ? AND qa.id = ?
    `,
    )
    .get(studentId, studentId, assignmentId);
  return row ? mapQuizRow(row, { includeSudokuSolution: false }) : null;
}

function getStudentAssignmentForSubmit(studentId, assignmentId) {
  const row = getDb()
    .prepare(
      `
      SELECT qa.id AS assignment_id, qa.due_at, qa.timed_mode, qa.overall_time_limit_seconds, q.*, c.name AS class_name, COALESCE(sch.allow_late_submissions, 1) AS allow_late, s.answers_json, s.score, s.total, s.submitted_at
      FROM quiz_assignments qa
      JOIN quizzes q ON q.id = qa.quiz_id
      JOIN classes c ON c.id = qa.class_id
      JOIN class_students cs ON cs.class_id = c.id
      JOIN users stu ON stu.id = cs.student_id
      LEFT JOIN schools sch ON sch.id = stu.school_id
      LEFT JOIN submissions s ON s.assignment_id = qa.id AND s.student_id = ?
      WHERE cs.student_id = ? AND qa.id = ?
    `,
    )
    .get(studentId, studentId, assignmentId);
  return row ? mapQuizRow(row, { includeSudokuSolution: true }) : null;
}

export function submitAssignment({
  studentId,
  assignmentId,
  answers,
  timeSpentMs,
  overallElapsedMs,
  timedOutQuestions,
  sudokuGrid,
  elapsedSeconds,
  mistakes,
}) {
  const assignment = getStudentAssignmentForSubmit(studentId, assignmentId);
  if (!assignment) {
    throw new Error("Assignment not found.");
  }
  if (assignment.submitted_at) {
    throw new Error("This assignment has already been submitted.");
  }

  if (!canSubmitBeforeDue({ dueAt: assignment.due_at, allowLate: assignment.allow_late !== 0 })) {
    throw new Error("This assignment is past its due date.");
  }

  assertQuizUnlockedForSubmit(studentId, assignmentId, assignment);

  if (isSudokuAssignment(assignment)) {
    return submitSudokuAssignment({
      studentId,
      assignmentId,
      assignment,
      grid: sudokuGrid,
      elapsedSeconds,
      mistakes,
    });
  }

  const questions = normalizeQuizQuestionsForDisplay(assignment.questions);
  if (!Array.isArray(questions)) {
    throw new Error("Invalid quiz assignment.");
  }

  const normalizedAnswers = normalizeAnswerMap(answers);
  const score = questions.reduce((total, question, index) => {
    return total + (normalizedAnswers[String(index)] === question.answer ? 1 : 0);
  }, 0);

  const submissionPayload = buildQuizSubmissionPayload({
    answers: normalizedAnswers,
    timeSpentMs,
    overallElapsedMs,
    timedOutQuestions,
  });

  getDb()
    .prepare(
      `
      INSERT INTO submissions (assignment_id, student_id, answers_json, score, total)
      VALUES (?, ?, ?, ?, ?)
    `,
    )
    .run(assignmentId, studentId, JSON.stringify(submissionPayload), score, questions.length);

  return { score, total: questions.length };
}

function normalizeAnswerMap(answers) {
  if (!answers || typeof answers !== "object") {
    return {};
  }
  if (answers.answers && typeof answers.answers === "object") {
    return answers.answers;
  }
  return answers;
}

function buildQuizSubmissionPayload({ answers, timeSpentMs, overallElapsedMs, timedOutQuestions }) {
  const hasTiming =
    (timeSpentMs && Object.keys(timeSpentMs).length > 0) ||
    Number.isFinite(Number(overallElapsedMs)) ||
    (timedOutQuestions && Object.keys(timedOutQuestions).length > 0);

  if (!hasTiming) {
    return answers;
  }

  return {
    answers,
    timeSpentMs: timeSpentMs || {},
    overallElapsedMs: Number.isFinite(Number(overallElapsedMs)) ? Math.round(Number(overallElapsedMs)) : null,
    timedOutQuestions: timedOutQuestions || {},
  };
}

function submitSudokuAssignment({ studentId, assignmentId, assignment, grid, elapsedSeconds, mistakes }) {
  const puzzle = assignment.questions;
  if (!puzzle || puzzle.type !== "sudoku" || !puzzle.solution) {
    throw new Error("Invalid Sudoku assignment.");
  }

  const normalizedGrid = normalizeSudokuGrid(grid);
  if (!normalizedGrid || !canSubmitSudoku(normalizedGrid, puzzle.puzzle)) {
    throw new Error("Complete the puzzle correctly before submitting.");
  }

  const payload = {
    grid: normalizedGrid,
    elapsedSeconds: Math.max(0, Number(elapsedSeconds) || 0),
    mistakes: Math.max(0, Number(mistakes) || 0),
    complete: true,
  };

  getDb()
    .prepare(
      `
      INSERT INTO submissions (assignment_id, student_id, answers_json, score, total)
      VALUES (?, ?, ?, ?, ?)
    `,
    )
    .run(assignmentId, studentId, JSON.stringify(payload), 1, 1);

  return { score: 1, total: 1, ...payload };
}

function parseQuestionsJson(json) {
  const parsed = JSON.parse(json || "[]");
  if (parsed?.type === "sudoku") {
    return parsed;
  }
  if (Array.isArray(parsed)) {
    return ensureQuestionVisuals(parsed);
  }
  return [];
}

function stripSudokuSolution(payload) {
  if (!payload || payload.type !== "sudoku") {
    return payload;
  }
  const { solution, ...rest } = payload;
  return rest;
}

function mapQuizRow(row, options = {}) {
  const plainRow = toPlainRow(row);
  const questions = parseQuestionsJson(plainRow.questions_json);
  const includeSolution = options.includeSudokuSolution !== false;
  let safeQuestions =
    questions?.type === "sudoku" && !includeSolution ? stripSudokuSolution(questions) : questions;

  if (Array.isArray(safeQuestions)) {
    safeQuestions = normalizeQuizQuestionsForDisplay(safeQuestions);
  }

  let submission = null;
  if (plainRow.answers_json) {
    try {
      submission = JSON.parse(plainRow.answers_json);
    } catch {
      submission = null;
    }
  }

  return {
    ...plainRow,
    learningIntentions: JSON.parse(plainRow.learning_intentions_json || "[]"),
    questions: safeQuestions,
    submission,
    timedMode: Number(plainRow.timed_mode) === 1,
    overallTimeLimitSeconds:
      plainRow.overall_time_limit_seconds != null
        ? Number(plainRow.overall_time_limit_seconds)
        : null,
    percent: plainRow.total ? Math.round((plainRow.score / plainRow.total) * 100) : null,
  };
}

function toPlainRow(row) {
  return row ? { ...row } : null;
}

function toPlainRows(rows) {
  return rows.map(toPlainRow);
}

function ensureColumn(db, tableName, columnName, columnType) {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
  if (!columns.some((column) => column.name === columnName)) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnType}`);
  }
}

function ensureProfiles(db) {
  const users = db
    .prepare(
      `
      SELECT u.id, u.name, u.role
      FROM users u
      LEFT JOIN user_profiles p ON p.user_id = u.id
      WHERE p.user_id IS NULL
    `,
    )
    .all();
  const insertProfile = db.prepare(
    `
    INSERT INTO user_profiles (user_id, display_name, year_level)
    VALUES (?, ?, ?)
  `,
  );
  for (const user of users) {
    insertProfile.run(user.id, user.name, user.role === "student" ? "Year 7" : null);
  }
}

function normalizeUsername(username) {
  return String(username || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "");
}

function randomPlaceholderSecret() {
  return `${Date.now()}-${Math.random()}-${process.pid}`;
}

export function createTestTeacher({ name, email, username, password }) {
  const db = getDb();
  const passwordHash = hashPassword(password);
  const schoolId = getDefaultSchoolId();
  const result = db
    .prepare(
      `
      INSERT INTO users (name, username, email, role, password_hash, email_verified_at, school_id)
      VALUES (?, ?, ?, 'teacher', ?, CURRENT_TIMESTAMP, ?)
    `,
    )
    .run(name, username, email, passwordHash, schoolId);
  const teacherId = Number(result.lastInsertRowid);
  db.prepare("INSERT INTO user_profiles (user_id, display_name) VALUES (?, ?)").run(teacherId, name);
  db.prepare("INSERT INTO classes (name, year_level, teacher_id) VALUES (?, ?, ?)").run("Year 7 Science", "Year 7", teacherId);
  return findUserByEmail(email);
}

export function createTestStudent({ name, email, username, password, teacherId, classId }) {
  const db = getDb();
  const passwordHash = hashPassword(password);
  const schoolId = getDefaultSchoolId();
  const result = db
    .prepare(
      `
      INSERT INTO users (name, username, email, role, password_hash, email_verified_at, school_id)
      VALUES (?, ?, ?, 'student', ?, CURRENT_TIMESTAMP, ?)
    `,
    )
    .run(name, username, email, passwordHash, schoolId);
  const studentId = Number(result.lastInsertRowid);
  db.prepare("INSERT INTO user_profiles (user_id, display_name, year_level) VALUES (?, ?, ?)").run(studentId, name, "Year 7");
  db.prepare("INSERT INTO class_students (class_id, student_id) VALUES (?, ?)").run(classId, studentId);
  return findUserByEmail(email);
}
