import { getFamilyByJoinCode } from "./families.js";
import { getSchoolByJoinCode, normalizeJoinCode } from "./schools.js";

export function resolveTenantForAuth({ tenantCode = "", schoolCode = "", familyCode = "" } = {}) {
  const code = normalizeJoinCode(tenantCode || schoolCode || familyCode);
  if (!code || code.length < 6) {
    return null;
  }

  const school = getSchoolByJoinCode(code);
  if (school) {
    return { type: "school", id: school.id, record: school };
  }

  const family = getFamilyByJoinCode(code);
  if (family) {
    return { type: "family", id: family.id, record: family };
  }

  throw new Error("Invalid school or family code. Check with your administrator.");
}
