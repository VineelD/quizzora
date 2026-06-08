import { getSchoolById } from "./db.js";
import { getFamilyById } from "./families.js";
import { SUPER_ADMIN_ROLE } from "./platform-auth.js";
import { isSupportRole } from "./support.js";

function displayName(user) {
  return String(user?.name || user?.username || user?.email || "Account").trim();
}

function formatTenantLine(name, joinCode) {
  const cleanName = String(name || "").trim();
  const cleanCode = String(joinCode || "").trim();
  if (cleanName && cleanCode) {
    return `${cleanName} · ${cleanCode}`;
  }
  return cleanName || cleanCode || null;
}

export function formatSessionIdentity(user) {
  const name = displayName(user);

  if (!user) {
    return {
      name: "Account",
      roleLabel: "Signed in",
      tenantLine: null,
      summary: "Signed in",
    };
  }

  if (user.role === SUPER_ADMIN_ROLE) {
    return {
      name,
      roleLabel: "Platform admin",
      tenantLine: null,
      summary: `Signed in as Platform admin (${name})`,
    };
  }

  if (isSupportRole(user)) {
    return {
      name,
      roleLabel: "Support staff",
      tenantLine: null,
      summary: `Signed in as Support staff (${name})`,
    };
  }

  if (user.role === "parent" && user.family_id != null) {
    const family = getFamilyById(user.family_id);
    const tenantLine = formatTenantLine(family?.name, family?.join_code);
    return {
      name,
      roleLabel: "Family parent",
      tenantLine,
      summary: tenantLine
        ? `Signed in as Family parent at ${tenantLine} (${name})`
        : `Signed in as Family parent (${name})`,
    };
  }

  if (user.role === "admin" && user.school_id != null) {
    const school = getSchoolById(user.school_id);
    const tenantLine = formatTenantLine(school?.name, school?.join_code);
    return {
      name,
      roleLabel: "School admin",
      tenantLine,
      summary: tenantLine
        ? `Signed in as School admin at ${tenantLine} (${name})`
        : `Signed in as School admin (${name})`,
    };
  }

  if (user.role === "teacher" && user.school_id != null) {
    const school = getSchoolById(user.school_id);
    const tenantLine = formatTenantLine(school?.name, school?.join_code);
    return {
      name,
      roleLabel: "School teacher",
      tenantLine,
      summary: tenantLine
        ? `Signed in as School teacher at ${tenantLine} (${name})`
        : `Signed in as School teacher (${name})`,
    };
  }

  if (user.role === "student") {
    if (user.school_id != null) {
      const school = getSchoolById(user.school_id);
      const tenantLine = formatTenantLine(school?.name, school?.join_code);
      return {
        name,
        roleLabel: "Student",
        tenantLine,
        summary: tenantLine
          ? `Signed in as Student at ${tenantLine} (${name})`
          : `Signed in as Student (${name})`,
      };
    }

    if (user.family_id != null) {
      const family = getFamilyById(user.family_id);
      const tenantLine = formatTenantLine(family?.name, family?.join_code);
      return {
        name,
        roleLabel: "Student",
        tenantLine,
        summary: tenantLine
          ? `Signed in as Student in ${tenantLine} (${name})`
          : `Signed in as Student (${name})`,
      };
    }

    return {
      name,
      roleLabel: "Student",
      tenantLine: null,
      summary: `Signed in as Student (${name})`,
    };
  }

  return {
    name,
    roleLabel: user.role ? String(user.role) : "Signed in",
    tenantLine: null,
    summary: `Signed in as ${name}`,
  };
}
