import "server-only";

import { jwtVerify, SignJWT } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { needsPasswordRehash, verifyPassword } from "./password.js";
import { getSchoolBilling } from "./billing.js";
import { getFamilyBilling } from "./family-billing.js";
import { checkApiBilling } from "./billing-enforcement.js";
import { getUserById, updateUserPassword } from "./db.js";
import {
  identifierNeedsTenantCode,
  isPlatformOperator,
  loginNeedsTenantCode,
  resolveUserForLogin,
  SUPER_ADMIN_ROLE,
} from "./platform-auth.js";
import { getSessionCookieOptions, shouldUseSecureCookie } from "./session-cookie.js";
import { SUPPORT_ROLE } from "./support.js";

export const sessionCookieName = "littlecode_session";
export const EDUCATOR_ROLES = ["teacher", "admin", "parent"];
export { SUPER_ADMIN_ROLE, SUPPORT_ROLE, isPlatformOperator, identifierNeedsTenantCode, loginNeedsTenantCode };

export function isSuperAdmin(user) {
  return user?.role === SUPER_ADMIN_ROLE;
}
export { getSessionCookieOptions, shouldUseSecureCookie };

function getSecret() {
  return new TextEncoder().encode(process.env.AUTH_SECRET || "local-dev-change-this-secret");
}

export async function authenticate(identifier, password, { schoolId = null, familyId = null } = {}) {
  const plainPassword = String(password || "");
  const user = resolveUserForLogin(identifier, { schoolId, familyId, password: plainPassword });
  if (!user || !verifyPassword(plainPassword, user.password_hash)) {
    return null;
  }
  if (needsPasswordRehash(user.password_hash)) {
    updateUserPassword(user.id, plainPassword);
  }
  return {
    id: user.id,
    name: user.name,
    username: user.username,
    email: user.email,
    role: user.role,
    school_id: user.school_id,
    family_id: user.family_id,
  };
}

export function identifierNeedsSchoolCode(identifier) {
  return identifierNeedsTenantCode(identifier);
}

export async function createSession(user) {
  return new SignJWT({
    role: user.role,
    name: user.name,
    username: user.username,
    email: user.email,
    schoolId: user.school_id ?? null,
    familyId: user.family_id ?? null,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(user.id))
    .setIssuedAt()
    .setExpirationTime("8h")
    .sign(getSecret());
}

export async function setSessionForUser(user, request) {
  const token = await createSession(user);
  const cookieStore = await cookies();
  cookieStore.set(sessionCookieName, token, getSessionCookieOptions(request));
  return getUserById(user.id);
}

export async function getSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(sessionCookieName)?.value;
  if (!token) {
    return null;
  }

  try {
    const { payload } = await jwtVerify(token, getSecret());
    const user = getUserById(Number(payload.sub));
    if (!user) {
      return null;
    }
    return user;
  } catch {
    return null;
  }
}

export function homePathForRole(role) {
  if (role === SUPER_ADMIN_ROLE) {
    return "/superadmin";
  }
  if (role === SUPPORT_ROLE) {
    return "/support";
  }
  if (role === "admin") {
    return "/admin";
  }
  if (role === "parent") {
    return "/family";
  }
  if (role === "student") {
    return "/student";
  }
  return "/teacher";
}

function rolesMatch(userRole, allowed) {
  if (!allowed) {
    return true;
  }
  const list = Array.isArray(allowed) ? allowed : [allowed];
  return list.includes(userRole);
}

export async function requireSession(role, options = {}) {
  const user = await getSession();
  if (!user) {
    redirect("/");
  }
  if (!rolesMatch(user.role, role)) {
    redirect(homePathForRole(user.role));
  }

  if (!options.skipBilling && !isPlatformOperator(user)) {
    if (user.family_id) {
      const billing = getFamilyBilling(user.family_id);
      if (billing?.needsPayment) {
        if (user.role === "parent") {
          redirect("/family/billing");
        }
        redirect("/subscription-required");
      }
    } else if (user.school_id) {
      const billing = getSchoolBilling(user.school_id);
      if (billing?.needsPayment) {
        if (user.role === "admin") {
          redirect("/admin/billing");
        }
        redirect("/subscription-required");
      }
    }
  }

  return user;
}

export async function requireApiSession(role, options = {}) {
  const user = await getSession();
  if (!user) {
    return { error: "Authentication required.", status: 401 };
  }
  if (!rolesMatch(user.role, role)) {
    return { error: "Forbidden.", status: 403 };
  }

  const billingCheck = checkApiBilling(user, options);
  if (billingCheck.error) {
    return { error: billingCheck.error, status: billingCheck.status };
  }

  return { user, subscription: billingCheck.subscription };
}
