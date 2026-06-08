import { randomBytes } from "node:crypto";
import { getDb } from "./db.js";
import { initFamilyTrial } from "./family-billing.js";

export function normalizeFamilySlug(value) {
  const slug = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (slug.length < 3) {
    throw new Error("Family URL must be at least 3 characters (letters and numbers).");
  }
  if (slug.length > 48) {
    throw new Error("Family URL is too long.");
  }
  return slug;
}

export function normalizeFamilyCode(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function generateFamilyCode() {
  return randomBytes(4).toString("hex").toUpperCase();
}

export function getFamilyBySlug(slug) {
  const clean = normalizeFamilySlug(slug);
  const row = getDb().prepare("SELECT * FROM families WHERE lower(slug) = lower(?)").get(clean);
  return row ? { ...row, id: Number(row.id), owner_user_id: row.owner_user_id != null ? Number(row.owner_user_id) : null } : null;
}

export function getFamilyByJoinCode(code) {
  const clean = normalizeFamilyCode(code);
  if (clean.length < 6) {
    return null;
  }
  const row = getDb().prepare("SELECT * FROM families WHERE upper(join_code) = ?").get(clean);
  return row ? { ...row, id: Number(row.id), owner_user_id: row.owner_user_id != null ? Number(row.owner_user_id) : null } : null;
}

export function getFamilyById(familyId) {
  const row = getDb().prepare("SELECT * FROM families WHERE id = ?").get(Number(familyId));
  return row ? { ...row, id: Number(row.id), owner_user_id: row.owner_user_id != null ? Number(row.owner_user_id) : null } : null;
}

export function assertFamilySlugAvailable(slug) {
  const clean = normalizeFamilySlug(slug);
  const existing = getDb().prepare("SELECT id FROM families WHERE lower(slug) = lower(?)").get(clean);
  if (existing) {
    throw new Error("That family URL is already taken. Choose another.");
  }
  return clean;
}

export function createFamily({ name, slug }) {
  const trimmedName = String(name || "").trim();
  if (trimmedName.length < 2) {
    throw new Error("Family name is required.");
  }
  const cleanSlug = assertFamilySlugAvailable(slug);
  const joinCode = generateFamilyCode();

  const db = getDb();
  const result = db.prepare("INSERT INTO families (name, slug, join_code) VALUES (?, ?, ?)").run(trimmedName, cleanSlug, joinCode);
  const familyId = Number(result.lastInsertRowid);
  initFamilyTrial(db, familyId);
  return getFamilyById(familyId);
}

export function setFamilyOwner(familyId, ownerUserId) {
  getDb().prepare("UPDATE families SET owner_user_id = ? WHERE id = ?").run(Number(ownerUserId), Number(familyId));
  return getFamilyById(familyId);
}

export function regenerateFamilyJoinCode(familyId) {
  const family = getFamilyById(familyId);
  if (!family) {
    throw new Error("Family not found.");
  }
  const joinCode = generateFamilyCode();
  getDb().prepare("UPDATE families SET join_code = ? WHERE id = ?").run(joinCode, family.id);
  return getFamilyById(family.id);
}

export function resolveFamilyForAuth({ familySlug, familyCode }) {
  const slug = String(familySlug || "").trim();
  const code = String(familyCode || "").trim();

  if (slug) {
    const family = getFamilyBySlug(slug);
    if (!family) {
      throw new Error("Unknown family URL. Check with your family administrator.");
    }
    return family;
  }

  if (code) {
    const family = getFamilyByJoinCode(code);
    if (!family) {
      throw new Error("Invalid family code. Check with your family administrator.");
    }
    return family;
  }

  return null;
}

export function familyAllowsPublicSignup() {
  return String(process.env.ALLOW_FAMILY_SIGNUP || "true").trim().toLowerCase() !== "false";
}

export function familyAllowsParentJoin() {
  return String(process.env.ALLOW_PARENT_JOIN || "true").trim().toLowerCase() !== "false";
}
