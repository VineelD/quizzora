import { findUserByIdentifier, findUsersByIdentifier, tenantKeyForUser } from "./db.js";
import { verifyPassword } from "./password.js";
import { isSupportRole } from "./support.js";

export const SUPER_ADMIN_ROLE = "superadmin";

export function isPlatformOperator(user) {
  return user?.role === SUPER_ADMIN_ROLE || isSupportRole(user);
}

export function findPlatformOperatorMatch(identifier) {
  const matches = findUsersByIdentifier(String(identifier || "").trim());
  return matches.find((item) => isPlatformOperator(item)) || null;
}

function findPasswordMatches(identifier, password) {
  const plainPassword = String(password || "");
  if (!plainPassword) {
    return [];
  }

  return findUsersByIdentifier(String(identifier || "").trim()).filter((user) =>
    verifyPassword(plainPassword, user.password_hash),
  );
}

function resolveUserFromPasswordMatches(passwordMatches) {
  if (passwordMatches.length === 1) {
    return passwordMatches[0];
  }
  return null;
}

export function resolveUserForLogin(identifier, { schoolId = null, familyId = null, password = "" } = {}) {
  const cleanIdentifier = String(identifier || "").trim();

  if (schoolId != null || familyId != null) {
    let user = findUserByIdentifier(cleanIdentifier, schoolId, familyId);
    if (!user) {
      user = findPlatformOperatorMatch(cleanIdentifier);
    }
    return user;
  }

  const matches = findUsersByIdentifier(cleanIdentifier);
  if (matches.length === 0) {
    return null;
  }
  if (matches.length === 1) {
    return matches[0];
  }

  return resolveUserFromPasswordMatches(findPasswordMatches(cleanIdentifier, password));
}

export function identifierNeedsTenantCode(identifier) {
  const matches = findUsersByIdentifier(String(identifier || "").trim());
  const tenantScoped = matches.filter((item) => !isPlatformOperator(item));
  if (tenantScoped.length === 0) {
    return false;
  }
  const tenantKeys = new Set(tenantScoped.map((item) => tenantKeyForUser(item)).filter(Boolean));
  return tenantKeys.size > 1;
}

/**
 * True when the identifier matches multiple accounts that share the same password.
 * Wrong passwords should fall through to a generic invalid-credentials response.
 */
export function loginNeedsTenantCode(identifier, password, { schoolId = null, familyId = null } = {}) {
  if (schoolId != null || familyId != null) {
    return false;
  }

  const passwordMatches = findPasswordMatches(identifier, password);
  return passwordMatches.length > 1;
}
