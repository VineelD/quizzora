import { getSchoolBilling } from "./billing.js";
import { countSchoolAssignments, countSchoolStudents, countSchoolTeachers } from "./school-usage.js";

export function getAdminOnboardingSnapshot(schoolId) {
  const billing = schoolId ? getSchoolBilling(schoolId) : null;

  return {
    billingActive: Boolean(billing?.hasAccess),
    billingStatus: billing?.status || "unknown",
    teacherCount: schoolId ? countSchoolTeachers(schoolId) : 0,
    studentCount: schoolId ? countSchoolStudents(schoolId) : 0,
    assignmentCount: schoolId ? countSchoolAssignments(schoolId) : 0,
  };
}
