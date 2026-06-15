import { randomBytes } from "node:crypto";
import { initSchoolTrial } from "./billing.js";
import { getDb } from "./db.js";

export function normalizeSchoolSlug(value) {
  const slug = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (slug.length < 3) {
    throw new Error("School URL must be at least 3 characters (letters and numbers).");
  }
  if (slug.length > 48) {
    throw new Error("School URL is too long.");
  }
  return slug;
}

export function normalizeJoinCode(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function generateJoinCode() {
  return randomBytes(4).toString("hex").toUpperCase();
}

export function getSchoolBySlug(slug) {
  const clean = normalizeSchoolSlug(slug);
  const row = getDb().prepare("SELECT * FROM schools WHERE lower(slug) = lower(?)").get(clean);
  return row ? { ...row, id: Number(row.id) } : null;
}

export function getSchoolByJoinCode(code) {
  const clean = normalizeJoinCode(code);
  if (clean.length < 6) {
    return null;
  }
  const row = getDb().prepare("SELECT * FROM schools WHERE upper(join_code) = ?").get(clean);
  return row ? { ...row, id: Number(row.id) } : null;
}

export function getSchoolById(schoolId) {
  const row = getDb().prepare("SELECT * FROM schools WHERE id = ?").get(Number(schoolId));
  return row ? { ...row, id: Number(row.id) } : null;
}


export function assertSchoolSlugAvailable(slug) {
  const clean = normalizeSchoolSlug(slug);
  const existing = getDb().prepare("SELECT id FROM schools WHERE lower(slug) = lower(?)").get(clean);
  if (existing) {
    throw new Error("That school URL is already taken. Choose another.");
  }
  return clean;
}

export function createSchool({ name, slug }) {
  const trimmedName = String(name || "").trim();
  if (trimmedName.length < 2) {
    throw new Error("School name is required.");
  }
  const cleanSlug = assertSchoolSlugAvailable(slug);
  const joinCode = generateJoinCode();

  const result = getDb()
    .prepare("INSERT INTO schools (name, slug, join_code) VALUES (?, ?, ?)")
    .run(trimmedName, cleanSlug, joinCode);

  const schoolId = Number(result.lastInsertRowid);
  initSchoolTrial(getDb(), schoolId);

  return getSchoolById(schoolId);
}

export function regenerateSchoolJoinCode(schoolId) {
  const school = getSchoolById(schoolId);
  if (!school) {
    throw new Error("School not found.");
  }
  const joinCode = generateJoinCode();
  getDb().prepare("UPDATE schools SET join_code = ? WHERE id = ?").run(joinCode, school.id);
  return getSchoolById(school.id);
}

export function resolveSchoolForAuth({ schoolSlug, schoolCode }) {
  const slug = String(schoolSlug || "").trim();
  const code = String(schoolCode || "").trim();

  if (slug) {
    const school = getSchoolBySlug(slug);
    if (!school) {
      throw new Error("Unknown school URL. Check with your administrator.");
    }
    return school;
  }

  if (code) {
    const school = getSchoolByJoinCode(code);
    if (!school) {
      throw new Error("Invalid school code. Check with your administrator.");
    }
    return school;
  }

  return null;
}

export function schoolAllowsPublicSignup() {
  return String(process.env.ALLOW_SCHOOL_SIGNUP || "true").trim().toLowerCase() !== "false";
}

export function schoolAllowsTeacherJoin() {
  return String(process.env.ALLOW_TEACHER_JOIN || "true").trim().toLowerCase() !== "false";
}
