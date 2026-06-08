import { getSchoolBilling } from "./billing.js";
import { getFamilyBilling } from "./family-billing.js";
import { incrementFamilyAiQuizUsage } from "./family-usage.js";
import { getFamilyUsageSnapshot } from "./family-usage.js";
import { incrementSchoolAiQuizUsage } from "./school-usage.js";
import {
  getLimitsForBilling,
  getLimitsForFamilyBilling,
  isAiGeneratedSource,
  isUnlimitedCap,
  resolvePlanKey,
} from "./plans.js";
import { getSchoolUsageSnapshot } from "./school-usage.js";

export class BillingError extends Error {
  constructor(message, statusCode = 402) {
    super(message);
    this.name = "BillingError";
    this.statusCode = statusCode;
  }
}

export function serializeSubscriptionForClient(subscription) {
  if (!subscription) {
    return null;
  }

  return {
    planKey: subscription.planKey,
    teachersRemaining: subscription.teachersRemaining,
    studentsRemaining: subscription.studentsRemaining,
    aiRemaining: subscription.aiRemaining,
    canAddTeacher: subscription.canAddTeacher,
    canAddStudent: subscription.canAddStudent,
    canGenerateAi: subscription.canGenerateAi,
    canReuseQuiz: subscription.canReuseQuiz,
    canUseSudoku: subscription.canUseSudoku,
    canCsvImport: subscription.canCsvImport,
    canCsvExport: subscription.canCsvExport,
    canGuardianLinks: subscription.canGuardianLinks,
    billing: {
      hasAccess: subscription.billing.hasAccess,
      isTrialing: subscription.billing.isTrialing,
      trialDaysLeft: subscription.billing.trialDaysLeft,
      needsPayment: subscription.billing.needsPayment,
      status: subscription.billing.status,
      planInterval: subscription.billing.planInterval,
    },
    limits: {
      planName: subscription.limits.planName,
      maxTeachers: subscription.limits.maxTeachers,
      maxStudents: subscription.limits.maxStudents,
      maxAiQuizzesPerMonth: subscription.limits.maxAiQuizzesPerMonth,
      features: { ...subscription.limits.features },
    },
    usage: { ...subscription.usage },
  };
}

export function getSchoolSubscription(schoolId) {
  const billing = getSchoolBilling(schoolId);
  if (!billing) {
    return null;
  }

  const limits = getLimitsForBilling(billing);
  const usage = getSchoolUsageSnapshot(schoolId);
  const planKey = resolvePlanKey(billing);

  const teachersRemaining = isUnlimitedCap(limits.maxTeachers)
    ? null
    : Math.max(0, limits.maxTeachers - usage.teachers);
  const studentsRemaining = isUnlimitedCap(limits.maxStudents)
    ? null
    : Math.max(0, limits.maxStudents - usage.students);
  const aiRemaining = isUnlimitedCap(limits.maxAiQuizzesPerMonth)
    ? null
    : Math.max(0, limits.maxAiQuizzesPerMonth - usage.aiQuizzesThisMonth);

  const canAddTeacher = billing.hasAccess && (teachersRemaining === null || teachersRemaining > 0);
  const canAddStudent = billing.hasAccess && (studentsRemaining === null || studentsRemaining > 0);
  const canGenerateAi =
    billing.hasAccess &&
    limits.features.aiQuizGeneration &&
    (aiRemaining === null || aiRemaining > 0);

  return {
    billing,
    planKey,
    limits,
    usage,
    teachersRemaining,
    studentsRemaining,
    aiRemaining,
    canAddTeacher,
    canAddStudent,
    canGenerateAi,
    canReuseQuiz: billing.hasAccess && limits.features.quizBankReuse,
    canUseSudoku: billing.hasAccess && limits.features.sudoku,
    canCsvImport: billing.hasAccess && limits.features.csvImport,
    canCsvExport: billing.hasAccess && limits.features.csvExport,
    canGuardianLinks: billing.hasAccess && limits.features.guardianLinks,
  };
}

export function getFamilySubscription(familyId) {
  const billing = getFamilyBilling(familyId);
  if (!billing) {
    return null;
  }

  const limits = getLimitsForFamilyBilling(billing);
  const usage = getFamilyUsageSnapshot(familyId);
  const planKey = resolvePlanKey(billing);

  const parentsRemaining = isUnlimitedCap(limits.maxParents)
    ? null
    : Math.max(0, limits.maxParents - usage.parents);
  const studentsRemaining = isUnlimitedCap(limits.maxStudents)
    ? null
    : Math.max(0, limits.maxStudents - usage.students);
  const aiRemaining = isUnlimitedCap(limits.maxAiQuizzesPerMonth)
    ? null
    : Math.max(0, limits.maxAiQuizzesPerMonth - usage.aiQuizzesThisMonth);

  const canAddParent = billing.hasAccess && (parentsRemaining === null || parentsRemaining > 0);
  const canAddStudent = billing.hasAccess && (studentsRemaining === null || studentsRemaining > 0);
  const canGenerateAi =
    billing.hasAccess &&
    limits.features.aiQuizGeneration &&
    (aiRemaining === null || aiRemaining > 0);

  return {
    billing,
    planKey,
    limits,
    usage,
    parentsRemaining,
    studentsRemaining,
    aiRemaining,
    canAddParent,
    canAddStudent,
    canGenerateAi,
    canReuseQuiz: billing.hasAccess && limits.features.quizBankReuse,
    canUseSudoku: billing.hasAccess && limits.features.sudoku,
    canCsvImport: billing.hasAccess && limits.features.csvImport,
    canCsvExport: billing.hasAccess && limits.features.csvExport,
    canGuardianLinks: billing.hasAccess && limits.features.guardianLinks,
  };
}

export function serializeFamilySubscriptionForClient(subscription) {
  if (!subscription) {
    return null;
  }

  return {
    planKey: subscription.planKey,
    parentsRemaining: subscription.parentsRemaining,
    studentsRemaining: subscription.studentsRemaining,
    aiRemaining: subscription.aiRemaining,
    canAddParent: subscription.canAddParent,
    canAddStudent: subscription.canAddStudent,
    canGenerateAi: subscription.canGenerateAi,
    canReuseQuiz: subscription.canReuseQuiz,
    canUseSudoku: subscription.canUseSudoku,
    canCsvImport: subscription.canCsvImport,
    canCsvExport: subscription.canCsvExport,
    canGuardianLinks: subscription.canGuardianLinks,
    billing: {
      hasAccess: subscription.billing.hasAccess,
      isTrialing: subscription.billing.isTrialing,
      trialDaysLeft: subscription.billing.trialDaysLeft,
      needsPayment: subscription.billing.needsPayment,
      status: subscription.billing.status,
      planInterval: subscription.billing.planInterval,
    },
    limits: {
      planName: subscription.limits.planName,
      maxParents: subscription.limits.maxParents,
      maxStudents: subscription.limits.maxStudents,
      maxAiQuizzesPerMonth: subscription.limits.maxAiQuizzesPerMonth,
      features: { ...subscription.limits.features },
    },
    usage: { ...subscription.usage },
  };
}

export function checkApiBilling(user, options = {}) {
  if (options.skipBilling) {
    return {
      subscription: user?.school_id
        ? getSchoolSubscription(user.school_id)
        : user?.family_id
          ? getFamilySubscription(user.family_id)
          : null,
    };
  }

  if (user?.family_id) {
    try {
      const subscription = assertFamilySubscription(user.family_id, options);
      return { subscription };
    } catch (error) {
      if (error instanceof BillingError) {
        return { error: error.message, status: error.statusCode };
      }
      return { error: error.message, status: 400 };
    }
  }

  if (!user?.school_id) {
    return { subscription: null };
  }

  try {
    const subscription = assertSchoolSubscription(user.school_id, options);
    return { subscription };
  } catch (error) {
    if (error instanceof BillingError) {
      return { error: error.message, status: error.statusCode };
    }
    return { error: error.message, status: 400 };
  }
}

export function assertSchoolSubscription(schoolId, options = {}) {
  const subscription = getSchoolSubscription(schoolId);
  if (!subscription) {
    throw new BillingError("School not found.", 404);
  }

  if (!options.skipAccess && !subscription.billing.hasAccess) {
    throw new BillingError(
      "Subscription required. Your school administrator can renew at the billing page.",
      402,
    );
  }

  if (options.feature === "addTeacher" && !subscription.canAddTeacher) {
    throw new BillingError(
      `Teacher limit reached (${subscription.usage.teachers}/${subscription.limits.maxTeachers}). Upgrade your plan.`,
      402,
    );
  }

  if (options.feature === "addStudent" && !subscription.canAddStudent) {
    throw new BillingError(
      `Student limit reached (${subscription.usage.students}/${subscription.limits.maxStudents}). Upgrade your plan.`,
      402,
    );
  }

  if (options.feature === "ai" && !subscription.canGenerateAi) {
    if (!subscription.billing.hasAccess) {
      throw new BillingError("Subscribe to generate new AI quizzes.", 402);
    }
    throw new BillingError(
      `Monthly AI quiz limit reached (${subscription.usage.aiQuizzesThisMonth}/${subscription.limits.maxAiQuizzesPerMonth}). Upgrade or reuse quizzes from your library.`,
      402,
    );
  }

  if (options.feature === "csvImport" && !subscription.canCsvImport) {
    throw new BillingError("CSV import is not available on your current plan.", 402);
  }

  if (options.feature === "guardian" && !subscription.canGuardianLinks) {
    throw new BillingError("Guardian links are not available on your current plan.", 402);
  }

  if (options.feature === "sudoku" && !subscription.canUseSudoku) {
    throw new BillingError("Sudoku assignments are not available on your current plan.", 402);
  }

  if (options.feature === "csvExport" && !subscription.canCsvExport) {
    throw new BillingError("CSV export is not available on your current plan.", 402);
  }

  if (options.feature === "quizReuse" && !subscription.canReuseQuiz) {
    throw new BillingError("Quiz library reuse is not available on your current plan.", 402);
  }

  return subscription;
}

export function assertCanAddStudents(schoolId, count = 1) {
  const subscription = assertSchoolSubscription(schoolId);
  if (isUnlimitedCap(subscription.limits.maxStudents)) {
    return subscription;
  }
  const remaining = subscription.studentsRemaining ?? 0;
  if (remaining < count) {
    throw new BillingError(
      `Cannot add ${count} student(s). Plan allows ${subscription.limits.maxStudents} (${subscription.usage.students} in use).`,
      402,
    );
  }
  return subscription;
}

export function assertFamilySubscription(familyId, options = {}) {
  const subscription = getFamilySubscription(familyId);
  if (!subscription) {
    throw new BillingError("Family not found.", 404);
  }

  if (!options.skipAccess && !subscription.billing.hasAccess) {
    throw new BillingError(
      "Subscription required. Your family administrator can renew at the billing page.",
      402,
    );
  }

  if (options.feature === "addParent" && !subscription.canAddParent) {
    throw new BillingError(
      `Parent limit reached (${subscription.usage.parents}/${subscription.limits.maxParents}). Upgrade your plan.`,
      402,
    );
  }

  if (options.feature === "addStudent" && !subscription.canAddStudent) {
    throw new BillingError(
      `Student limit reached (${subscription.usage.students}/${subscription.limits.maxStudents}). Upgrade your plan.`,
      402,
    );
  }

  if (options.feature === "ai" && !subscription.canGenerateAi) {
    if (!subscription.billing.hasAccess) {
      throw new BillingError("Subscribe to generate new AI quizzes.", 402);
    }
    throw new BillingError(
      `Monthly AI quiz limit reached (${subscription.usage.aiQuizzesThisMonth}/${subscription.limits.maxAiQuizzesPerMonth}). Reuse quizzes from your library.`,
      402,
    );
  }

  if (options.feature === "quizReuse" && !subscription.canReuseQuiz) {
    throw new BillingError("Quiz library reuse is not available on your current plan.", 402);
  }

  if (options.feature === "sudoku" && !subscription.canUseSudoku) {
    throw new BillingError("Sudoku assignments are not available on your current plan.", 402);
  }

  return subscription;
}

export function assertCanAddFamilyStudents(familyId, count = 1) {
  const subscription = assertFamilySubscription(familyId);
  if (isUnlimitedCap(subscription.limits.maxStudents)) {
    return subscription;
  }
  const remaining = subscription.studentsRemaining ?? 0;
  if (remaining < count) {
    throw new BillingError(
      `Cannot add ${count} student(s). Plan allows ${subscription.limits.maxStudents} (${subscription.usage.students} in use).`,
      402,
    );
  }
  return subscription;
}

export function recordAiQuizGeneration(schoolId, source) {
  if (!isAiGeneratedSource(source) || !schoolId) {
    return;
  }
  assertSchoolSubscription(schoolId, { feature: "ai" });
  incrementSchoolAiQuizUsage(schoolId);
}

export function recordFamilyAiQuizGeneration(familyId, source) {
  if (!isAiGeneratedSource(source) || !familyId) {
    return;
  }
  assertFamilySubscription(familyId, { feature: "ai" });
  incrementFamilyAiQuizUsage(familyId);
}
