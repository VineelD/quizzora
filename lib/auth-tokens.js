import { createHash, randomBytes } from "node:crypto";
import {
  findUserByEmail,
  findUsersByIdentifier,
  getDb,
  getUserById,
  tenantKeyForUser,
  updateUserPassword,
} from "./db.js";
import { isPlatformOperator } from "./platform-auth.js";
import { resolveSchoolForAuth } from "./schools.js";
import { validatePassword } from "./password.js";
import { buildVerificationEmail, getAppBaseUrl, sendAuthEmail } from "./mail.js";

const TOKEN_BYTES = 32;
const RESET_TTL_MINUTES = 60;
const INVITE_TTL_HOURS = 72;
const MAX_REQUESTS_PER_HOUR = 6;

function hashToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

function generateToken() {
  const raw = randomBytes(TOKEN_BYTES).toString("base64url");
  return { raw, hash: hashToken(raw) };
}

function expiresAtMinutes(minutes) {
  return new Date(Date.now() + minutes * 60 * 1000).toISOString();
}

function expiresAtHours(hours) {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

function normalizeEmail(email) {
  return String(email || "")
    .trim()
    .toLowerCase();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function enforceRateLimit(email) {
  const count = getDb()
    .prepare(
      `
      SELECT COUNT(*) AS count
      FROM auth_tokens
      WHERE lower(email) = lower(?)
        AND created_at >= datetime('now', '-1 hour')
    `,
    )
    .get(email).count;
  if (count >= MAX_REQUESTS_PER_HOUR) {
    throw new Error("Too many email requests. Try again in about an hour.");
  }
}

function insertToken({ email, purpose, expiresAt, userId = null, role = null, name = null }) {
  const { raw, hash } = generateToken();
  getDb()
    .prepare(
      `
      INSERT INTO auth_tokens (email, token_hash, purpose, user_id, role, name, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    )
    .run(email, hash, purpose, userId, role, name, expiresAt);
  return raw;
}

async function emailResetLink({ email, rawToken }) {
  const link = `${getAppBaseUrl()}/auth/reset-password?token=${encodeURIComponent(rawToken)}`;
  const content = buildVerificationEmail({
    link,
    heading: "Reset your password",
    body: "Use the button below to choose a new password for your Quizzora account.",
  });
  await sendAuthEmail({ to: email, ...content });
}

function tenantIdFromKey(key) {
  const [, id] = String(key || "").split(":");
  const resolved = Number(id);
  return resolved || null;
}

function resolveTenantFromEmailMatches(tenantScoped, { portalType = "" } = {}) {
  const schoolKeys = [
    ...new Set(tenantScoped.filter((item) => item.school_id).map((item) => tenantKeyForUser(item))),
  ];
  const familyKeys = [
    ...new Set(tenantScoped.filter((item) => item.family_id).map((item) => tenantKeyForUser(item))),
  ];

  if (schoolKeys.length > 1 || familyKeys.length > 1) {
    throw new Error("Enter your school or family code so we can send the reset link to the right account.");
  }

  if (schoolKeys.length === 1 && familyKeys.length === 1) {
    const normalizedPortal = String(portalType || "")
      .trim()
      .toLowerCase();
    if (normalizedPortal === "family") {
      return { family: { id: tenantIdFromKey(familyKeys[0]) } };
    }
    if (normalizedPortal === "school") {
      return { school: { id: tenantIdFromKey(schoolKeys[0]) } };
    }
    throw new Error("Enter your school or family code so we can send the reset link to the right account.");
  }

  if (schoolKeys.length === 1) {
    return { school: { id: tenantIdFromKey(schoolKeys[0]) } };
  }
  if (familyKeys.length === 1) {
    return { family: { id: tenantIdFromKey(familyKeys[0]) } };
  }
  return {};
}

export async function requestPasswordReset(
  emailInput,
  { schoolCode = "", schoolSlug = "", familyCode = "", portalType = "" } = {},
) {
  const email = normalizeEmail(emailInput);
  if (!isValidEmail(email)) {
    throw new Error("Enter a valid email address.");
  }

  let school = null;
  let family = null;
  try {
    const { resolveTenantForAuth } = await import("./tenants.js");
    const tenant = resolveTenantForAuth({ tenantCode: schoolCode || familyCode, schoolCode, familyCode });
    if (tenant?.type === "school") {
      school = tenant.record;
    } else if (tenant?.type === "family") {
      family = tenant.record;
    }
  } catch (error) {
    throw error;
  }

  if (!school && !family) {
    try {
      school = resolveSchoolForAuth({ schoolCode, schoolSlug });
    } catch (error) {
      throw error;
    }
  }

  if (!school && !family) {
    const matches = findUsersByIdentifier(email);
    const tenantScoped = matches.filter((item) => !isPlatformOperator(item));
    const resolved = resolveTenantFromEmailMatches(tenantScoped, { portalType });
    school = resolved.school || null;
    family = resolved.family || null;
  }

  let user = family
    ? findUserByEmail(email, null, family.id)
    : school
      ? findUserByEmail(email, school.id)
      : findUserByEmail(email);

  if (!user) {
    user = findUsersByIdentifier(email).find((item) => isPlatformOperator(item)) || null;
  }
  if (user) {
    enforceRateLimit(email);
    const rawToken = insertToken({
      email,
      purpose: "reset_password",
      userId: user.id,
      expiresAt: expiresAtMinutes(RESET_TTL_MINUTES),
    });
    await emailResetLink({ email, rawToken });
  }

  return {
    ok: true,
    message: "If that account exists, a password reset link has been sent.",
  };
}

export async function sendStudentInviteEmail() {
  // Password-based student accounts no longer require invite email.
}

export function getAuthTokenRow(rawToken) {
  const token = String(rawToken || "").trim();
  if (!token) {
    throw new Error("Missing verification link.");
  }

  const row = getDb()
    .prepare(
      `
      SELECT *
      FROM auth_tokens
      WHERE token_hash = ?
    `,
    )
    .get(hashToken(token));

  if (!row) {
    throw new Error("This link is invalid or has already been used.");
  }
  if (row.used_at) {
    throw new Error("This link has already been used.");
  }

  const expired = getDb()
    .prepare("SELECT 1 AS expired WHERE datetime(?) <= datetime('now')")
    .get(row.expires_at);
  if (expired) {
    throw new Error("This link has expired. Request a new email.");
  }

  return row;
}

export function consumeAuthToken(rawToken) {
  const row = getAuthTokenRow(rawToken);
  getDb().prepare("UPDATE auth_tokens SET used_at = CURRENT_TIMESTAMP WHERE id = ?").run(row.id);

  if (row.purpose === "invite") {
    return getUserById(row.user_id);
  }

  if (row.purpose === "reset_password") {
    return { purpose: "reset_password", userId: row.user_id, email: row.email };
  }

  throw new Error("Unsupported verification link.");
}

export function resetPasswordWithToken(rawToken, password) {
  validatePassword(password);
  const result = consumeAuthToken(rawToken);
  if (result.purpose !== "reset_password") {
    throw new Error("Invalid password reset link.");
  }
  updateUserPassword(result.userId, password);
  return getUserById(result.userId);
}
