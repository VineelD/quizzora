import { logAudit } from "./audit.js";
import { hashPassword } from "./password.js";
import {
  assertEmailAvailable,
  assertFamilyEmailAvailable,
  assertFamilyUsernameAvailable,
  assertUsernameAvailable,
  createParentAccount,
  createStudentForParent,
  createStudentForTeacher,
  createTeacherAccount,
  deleteUserAndDependencies,
  getSchoolById,
  getUserById,
  normalizeStudentEmail,
  updateUserPassword,
  validateStudentEmail,
} from "./db.js";
import { getFamilyById } from "./families.js";
import { getDb } from "./db.js";
import { createSupportUser } from "./support.js";
import { normalizeYearLevel } from "./year-levels.js";

const MANAGED_ROLES = new Set(["admin", "teacher", "student", "support", "parent"]);
const SCHOOL_BOUND_ROLES = new Set(["admin", "teacher", "student"]);
const FAMILY_BOUND_ROLES = new Set(["parent", "student"]);

function toPlainRow(row) {
  return row || null;
}

function toManagedUser(row) {
  if (!row) {
    return null;
  }

  return {
    id: Number(row.id),
    name: row.name,
    username: row.username,
    email: row.email,
    role: row.role,
    schoolId: row.school_id != null ? Number(row.school_id) : null,
    schoolName: row.school_name || null,
    schoolJoinCode: row.school_join_code || null,
    emailVerifiedAt: row.email_verified_at,
    createdAt: row.created_at,
  };
}

function assertManagedRole(role) {
  const cleanRole = String(role || "").trim().toLowerCase();
  if (!MANAGED_ROLES.has(cleanRole)) {
    throw new Error("Role must be admin, teacher, student, or support.");
  }
  return cleanRole;
}

function assertCanManageUser(user, { actorId } = {}) {
  if (!user) {
    throw new Error("User not found.");
  }
  if (Number(user.id) === Number(actorId)) {
    throw new Error("You cannot modify your own account here.");
  }
  if (user.role === "superadmin") {
    throw new Error("Super admin accounts cannot be changed here.");
  }
}

function assertGlobalEmailAvailable(email, excludeUserId = null) {
  const cleanEmail = normalizeStudentEmail(email);
  if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    throw new Error("A valid email is required.");
  }

  const existing = getDb()
    .prepare("SELECT id, role FROM users WHERE lower(email) = lower(?) LIMIT 1")
    .get(cleanEmail);
  if (existing && Number(existing.id) !== Number(excludeUserId)) {
    throw new Error(`Email ${cleanEmail} is already used by another account.`);
  }
  return cleanEmail;
}

function assertGlobalUsernameAvailable(username, excludeUserId = null) {
  const cleanUsername = String(username || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "");
  if (!cleanUsername) {
    throw new Error("Username is required.");
  }

  const existing = getDb()
    .prepare("SELECT id FROM users WHERE lower(username) = lower(?) LIMIT 1")
    .get(cleanUsername);
  if (existing && Number(existing.id) !== Number(excludeUserId)) {
    throw new Error(`Username ${cleanUsername} is already in use.`);
  }
  return cleanUsername;
}

function findTeacherInSchool(schoolId) {
  return (
    getDb()
      .prepare(
        `
        SELECT id
        FROM users
        WHERE school_id = ? AND role = 'teacher'
        ORDER BY id
        LIMIT 1
      `,
      )
      .get(Number(schoolId)) || null
  );
}

export function getManagedUserById(userId) {
  const row = getDb()
    .prepare(
      `
      SELECT
        u.id,
        u.name,
        u.username,
        u.email,
        u.role,
        u.school_id,
        u.email_verified_at,
        u.created_at,
        s.name AS school_name,
        s.join_code AS school_join_code
      FROM users u
      LEFT JOIN schools s ON s.id = u.school_id
      WHERE u.id = ?
      LIMIT 1
    `,
    )
    .get(Number(userId));

  const user = toManagedUser(row);
  if (!user || user.role === "superadmin") {
    return null;
  }
  return user;
}

export function listFamiliesWithUserCounts() {
  const rows = getDb()
    .prepare(
      `
      SELECT
        f.id,
        f.name,
        f.slug,
        f.join_code,
        f.subscription_status,
        f.trial_ends_at,
        f.created_at,
        SUM(CASE WHEN u.role = 'parent' THEN 1 ELSE 0 END) AS parent_count,
        SUM(CASE WHEN u.role = 'student' THEN 1 ELSE 0 END) AS student_count,
        COUNT(u.id) AS user_count
      FROM families f
      LEFT JOIN users u ON u.family_id = f.id
      GROUP BY f.id
      ORDER BY f.name COLLATE NOCASE
    `,
    )
    .all();

  return rows.map((row) => ({
    id: Number(row.id),
    name: row.name,
    slug: row.slug,
    joinCode: row.join_code,
    subscriptionStatus: row.subscription_status,
    trialEndsAt: row.trial_ends_at,
    createdAt: row.created_at,
    parentCount: Number(row.parent_count || 0),
    studentCount: Number(row.student_count || 0),
    userCount: Number(row.user_count || 0),
  }));
}

export function listSchoolsWithUserCounts() {
  const rows = getDb()
    .prepare(
      `
      SELECT
        s.id,
        s.name,
        s.slug,
        s.join_code,
        s.created_at,
        SUM(CASE WHEN u.role = 'admin' THEN 1 ELSE 0 END) AS admin_count,
        SUM(CASE WHEN u.role = 'teacher' THEN 1 ELSE 0 END) AS teacher_count,
        SUM(CASE WHEN u.role = 'student' THEN 1 ELSE 0 END) AS student_count,
        COUNT(u.id) AS user_count
      FROM schools s
      LEFT JOIN users u ON u.school_id = s.id
      GROUP BY s.id
      ORDER BY s.name COLLATE NOCASE
    `,
    )
    .all();

  return rows.map((row) => ({
    id: Number(row.id),
    name: row.name,
    slug: row.slug,
    joinCode: row.join_code,
    createdAt: row.created_at,
    adminCount: Number(row.admin_count || 0),
    teacherCount: Number(row.teacher_count || 0),
    studentCount: Number(row.student_count || 0),
    userCount: Number(row.user_count || 0),
  }));
}

export function listUsersAcrossSchools({ schoolId = null, familyId = null, role = null, search = "" } = {}) {
  const clauses = ["u.role != 'superadmin'"];
  const params = [];

  if (schoolId != null && Number.isFinite(Number(schoolId))) {
    clauses.push("u.school_id = ?");
    params.push(Number(schoolId));
  }

  if (familyId != null && Number.isFinite(Number(familyId))) {
    clauses.push("u.family_id = ?");
    params.push(Number(familyId));
  }

  if (role) {
    clauses.push("u.role = ?");
    params.push(String(role));
  }

  const term = String(search || "").trim().toLowerCase();
  if (term) {
    clauses.push("(lower(u.name) LIKE ? OR lower(u.email) LIKE ? OR lower(u.username) LIKE ?)");
    const pattern = `%${term}%`;
    params.push(pattern, pattern, pattern);
  }

  const rows = getDb()
    .prepare(
      `
      SELECT
        u.id,
        u.name,
        u.username,
        u.email,
        u.role,
        u.school_id,
        u.family_id,
        u.email_verified_at,
        u.created_at,
        s.name AS school_name,
        s.join_code AS school_join_code,
        f.name AS family_name,
        f.join_code AS family_join_code
      FROM users u
      LEFT JOIN schools s ON s.id = u.school_id
      LEFT JOIN families f ON f.id = u.family_id
      WHERE ${clauses.join(" AND ")}
      ORDER BY COALESCE(s.name, f.name) COLLATE NOCASE, u.role, u.name COLLATE NOCASE
      LIMIT 500
    `,
    )
    .all(...params);

  return rows.map((row) => ({
    id: Number(row.id),
    name: row.name,
    username: row.username,
    email: row.email,
    role: row.role,
    schoolId: row.school_id != null ? Number(row.school_id) : null,
    schoolName: row.school_name || null,
    schoolJoinCode: row.school_join_code || null,
    familyId: row.family_id != null ? Number(row.family_id) : null,
    familyName: row.family_name || null,
    familyJoinCode: row.family_join_code || null,
    emailVerifiedAt: row.email_verified_at,
    createdAt: row.created_at,
  }));
}

export function getSuperAdminByEmail(email) {
  return toPlainRow(
    getDb()
      .prepare(
        `
        SELECT id, name, username, email, role, school_id, email_verified_at
        FROM users
        WHERE role = 'superadmin' AND lower(email) = lower(?)
      `,
      )
      .get(String(email || "").trim()),
  );
}

export function createSuperAdminUser({ name, email, username, password }) {
  const cleanEmail = String(email || "").trim().toLowerCase();
  const cleanName = String(name || "Super Admin").trim();
  const cleanUsername = String(username || "superadmin").trim().toLowerCase();
  const cleanPassword = String(password || "");

  if (!cleanEmail || !cleanPassword || cleanPassword.length < 12) {
    throw new Error("Super admin requires an email and a password with at least 12 characters.");
  }

  const existing = getSuperAdminByEmail(cleanEmail);
  if (existing) {
    return existing;
  }

  const conflict = getDb()
    .prepare("SELECT id, role FROM users WHERE lower(email) = lower(?) LIMIT 1")
    .get(cleanEmail);
  if (conflict) {
    throw new Error(`Email ${cleanEmail} is already used by another account.`);
  }

  const passwordHash = hashPassword(cleanPassword);
  const result = getDb()
    .prepare(
      `
      INSERT INTO users (name, username, email, role, password_hash, email_verified_at, school_id)
      VALUES (?, ?, ?, 'superadmin', ?, CURRENT_TIMESTAMP, NULL)
    `,
    )
    .run(cleanName, cleanUsername, cleanEmail, passwordHash);

  return getDb()
    .prepare("SELECT id, name, username, email, role, school_id, email_verified_at FROM users WHERE id = ?")
    .get(Number(result.lastInsertRowid));
}

function findParentInFamily(familyId) {
  return (
    getDb()
      .prepare(
        `
        SELECT id
        FROM users
        WHERE family_id = ? AND role = 'parent'
        ORDER BY id
        LIMIT 1
      `,
      )
      .get(Number(familyId)) || null
  );
}

export function createManagedUser({
  actorId,
  schoolId = null,
  familyId = null,
  role,
  name,
  email,
  username = "",
  password,
  yearLevel = "Year 7",
  teacherId = null,
}) {
  const resolvedRole = assertManagedRole(role);
  const trimmedName = String(name || "").trim();
  if (trimmedName.length < 2) {
    throw new Error("Name must be at least 2 characters.");
  }
  if (!String(password || "").trim()) {
    throw new Error("Password is required.");
  }

  let createdUser = null;

  if (resolvedRole === "support") {
    createdUser = createSupportUser({
      name: trimmedName,
      email,
      username: username || "support",
      password,
    });
  } else if (resolvedRole === "parent" || (resolvedRole === "student" && familyId)) {
    const resolvedFamilyId = Number(familyId);
    if (!resolvedFamilyId || !getFamilyById(resolvedFamilyId)) {
      throw new Error("A valid family is required.");
    }

    if (resolvedRole === "parent") {
      createdUser = createParentAccount({
        name: trimmedName,
        email,
        password,
        familyId: resolvedFamilyId,
        username,
      });
    } else {
      const resolvedParentId = teacherId ? Number(teacherId) : Number(findParentInFamily(resolvedFamilyId)?.id || 0);
      if (!resolvedParentId) {
        throw new Error("Add a parent to this family before creating students.");
      }
      createdUser = createStudentForParent({
        parentId: resolvedParentId,
        yearLevel: normalizeYearLevel(yearLevel),
        name: trimmedName,
        username: username || email.split("@")[0],
        email,
        password,
        actorId,
        actorRole: "superadmin",
      });
    }
  } else {
    const resolvedSchoolId = Number(schoolId);
    if (!resolvedSchoolId || !getSchoolById(resolvedSchoolId)) {
      throw new Error("A valid school is required.");
    }

    if (resolvedRole === "student") {
      const resolvedTeacherId = teacherId ? Number(teacherId) : Number(findTeacherInSchool(resolvedSchoolId)?.id || 0);
      if (!resolvedTeacherId) {
        throw new Error("Add a teacher to this school before creating students.");
      }

      const teacher = getUserById(resolvedTeacherId);
      if (!teacher || teacher.role !== "teacher" || Number(teacher.school_id) !== resolvedSchoolId) {
        throw new Error("Teacher not found in that school.");
      }

      createdUser = createStudentForTeacher({
        teacherId: resolvedTeacherId,
        yearLevel: normalizeYearLevel(yearLevel),
        name: trimmedName,
        username: username || email.split("@")[0],
        email,
        password,
        guardianEmail: null,
        learningNeeds: null,
        actorId,
        actorRole: "superadmin",
        skipSubscriptionCheck: true,
      });
    } else {
      createdUser = createTeacherAccount({
        name: trimmedName,
        email,
        password,
        schoolId: resolvedSchoolId,
        role: resolvedRole,
      });
    }
  }

  logAudit({
    actorId,
    actorRole: "superadmin",
    action: "user.created",
    entityType: "user",
    entityId: createdUser.id,
    summary: `Super admin created ${createdUser.role} ${createdUser.username || createdUser.email}`,
  });

  return getManagedUserById(createdUser.id);
}

export function updateManagedUser({
  actorId,
  userId,
  schoolId = undefined,
  familyId = undefined,
  role = undefined,
  name = undefined,
  email = undefined,
  username = undefined,
  password = undefined,
}) {
  const existing = getUserById(userId);
  assertCanManageUser(existing, { actorId });

  const nextRole = role === undefined ? existing.role : assertManagedRole(role);
  const nextName = name === undefined ? existing.name : String(name || "").trim();
  if (nextName.length < 2) {
    throw new Error("Name must be at least 2 characters.");
  }

  let nextSchoolId =
    schoolId === undefined || schoolId === null || schoolId === ""
      ? existing.school_id
      : Number(schoolId);

  let nextFamilyId =
    familyId === undefined || familyId === null || familyId === ""
      ? existing.family_id
      : Number(familyId);

  if (SCHOOL_BOUND_ROLES.has(nextRole)) {
    if (!nextSchoolId || !getSchoolById(nextSchoolId)) {
      throw new Error("A valid school is required for this role.");
    }
    nextFamilyId = null;
  } else if (FAMILY_BOUND_ROLES.has(nextRole)) {
    if (!nextFamilyId || !getFamilyById(nextFamilyId)) {
      throw new Error("A valid family is required for this role.");
    }
    nextSchoolId = null;
  } else if (nextRole === "support") {
    nextSchoolId = null;
    nextFamilyId = null;
  }

  let nextEmail = existing.email;
  if (email !== undefined) {
    if (nextRole === "support") {
      nextEmail = assertGlobalEmailAvailable(email, userId);
    } else if (FAMILY_BOUND_ROLES.has(nextRole)) {
      nextEmail = assertFamilyEmailAvailable(validateStudentEmail(email), nextFamilyId, userId);
    } else {
      nextEmail = assertEmailAvailable(validateStudentEmail(email), nextSchoolId, userId);
    }
  }

  let nextUsername = existing.username;
  if (username !== undefined) {
    const cleanUsername = String(username || "").trim();
    if (nextRole === "support") {
      nextUsername = assertGlobalUsernameAvailable(cleanUsername, userId);
    } else if (FAMILY_BOUND_ROLES.has(nextRole)) {
      nextUsername = assertFamilyUsernameAvailable(cleanUsername, nextFamilyId, userId);
    } else {
      nextUsername = assertUsernameAvailable(cleanUsername, nextSchoolId, userId);
    }
  }

  getDb()
    .prepare("UPDATE users SET name = ?, username = ?, email = ?, role = ?, school_id = ?, family_id = ? WHERE id = ?")
    .run(nextName, nextUsername, nextEmail, nextRole, nextSchoolId, nextFamilyId, userId);

  if (String(password || "").trim()) {
    updateUserPassword(userId, password);
  }

  logAudit({
    actorId,
    actorRole: "superadmin",
    action: "user.updated",
    entityType: "user",
    entityId: userId,
    summary: `Super admin updated ${nextUsername || nextEmail}`,
    metadata: { role: nextRole, schoolId: nextSchoolId },
  });

  return getManagedUserById(userId);
}

export function deleteManagedUser({ actorId, userId }) {
  const existing = getUserById(userId);
  assertCanManageUser(existing, { actorId });

  const result = deleteUserAndDependencies(userId);

  logAudit({
    actorId,
    actorRole: "superadmin",
    action: "user.deleted",
    entityType: "user",
    entityId: userId,
    summary: `Super admin deleted ${existing.username || existing.email}`,
    metadata: { role: existing.role },
  });

  return result;
}
