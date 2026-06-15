import { isFreeAccessMode } from "./billing-mode.js";

/** Plan limits — 0 on a numeric cap means unlimited. */

export function getTrialPlanLimits() {
  return {
    planName: "Free trial",
    maxTeachers: Number(process.env.BILLING_TRIAL_MAX_TEACHERS || 3),
    maxStudents: Number(process.env.BILLING_TRIAL_MAX_STUDENTS || 50),
    maxAiQuizzesPerMonth: Number(process.env.BILLING_TRIAL_MAX_AI_QUIZZES || 15),
    maxQuestionsPerQuiz: Number(process.env.BILLING_TRIAL_MAX_QUESTIONS_PER_QUIZ || 50),
    features: {
      aiQuizGeneration: true,
      quizBankReuse: true,
      sudoku: true,
      csvImport: true,
      csvExport: true,
      guardianLinks: true,
    },
  };
}

export function getPaidPlanLimits() {
  return {
    planName: "Standard",
    maxTeachers: Number(process.env.BILLING_PAID_MAX_TEACHERS || 25),
    maxStudents: Number(process.env.BILLING_PAID_MAX_STUDENTS || 2000),
    maxAiQuizzesPerMonth: Number(process.env.BILLING_PAID_MAX_AI_QUIZZES || 0),
    maxQuestionsPerQuiz: Number(process.env.BILLING_PAID_MAX_QUESTIONS_PER_QUIZ || 0),
    features: {
      aiQuizGeneration: true,
      quizBankReuse: true,
      sudoku: true,
      csvImport: true,
      csvExport: true,
      guardianLinks: true,
    },
  };
}

export function getFamilyTrialPlanLimits() {
  return {
    planName: "Family trial",
    maxParents: Number(process.env.BILLING_FAMILY_TRIAL_MAX_PARENTS || 2),
    maxStudents: Number(process.env.BILLING_FAMILY_TRIAL_MAX_STUDENTS || 6),
    maxAiQuizzesPerMonth: Number(process.env.BILLING_FAMILY_TRIAL_MAX_AI_QUIZZES || 10),
    maxQuestionsPerQuiz: Number(process.env.BILLING_FAMILY_TRIAL_MAX_QUESTIONS_PER_QUIZ || 30),
    features: {
      aiQuizGeneration: true,
      quizBankReuse: true,
      sudoku: true,
      csvImport: false,
      csvExport: true,
      guardianLinks: false,
    },
  };
}

export function getFamilyPaidPlanLimits() {
  return {
    planName: "Family",
    maxParents: Number(process.env.BILLING_FAMILY_PAID_MAX_PARENTS || 4),
    maxStudents: Number(process.env.BILLING_FAMILY_PAID_MAX_STUDENTS || 8),
    maxAiQuizzesPerMonth: Number(process.env.BILLING_FAMILY_PAID_MAX_AI_QUIZZES || 30),
    maxQuestionsPerQuiz: Number(process.env.BILLING_FAMILY_PAID_MAX_QUESTIONS_PER_QUIZ || 50),
    features: {
      aiQuizGeneration: true,
      quizBankReuse: true,
      sudoku: true,
      csvImport: false,
      csvExport: true,
      guardianLinks: false,
    },
  };
}

export function getLimitsForFamilyBilling(billing) {
  const key = resolvePlanKey(billing);
  if (key === "paid") {
    return getFamilyPaidPlanLimits();
  }
  if (key === "trial") {
    return getFamilyTrialPlanLimits();
  }
  return {
    planName: "Inactive",
    maxParents: 0,
    maxStudents: 0,
    maxAiQuizzesPerMonth: 0,
    features: {
      aiQuizGeneration: false,
      quizBankReuse: false,
      sudoku: false,
      csvImport: false,
      csvExport: false,
      guardianLinks: false,
    },
  };
}

export function resolvePlanKey(billing) {
  if (isFreeAccessMode()) {
    return billing ? "paid" : "none";
  }
  if (!billing?.hasAccess) {
    return "none";
  }
  if (billing.isTrialing) {
    return "trial";
  }
  if (billing.status === "active") {
    return "paid";
  }
  return "none";
}

export function getLimitsForBilling(billing) {
  const key = resolvePlanKey(billing);
  if (key === "paid") {
    return getPaidPlanLimits();
  }
  if (key === "trial") {
    return getTrialPlanLimits();
  }
  return {
    planName: "Inactive",
    maxTeachers: 0,
    maxStudents: 0,
    maxAiQuizzesPerMonth: 0,
    features: {
      aiQuizGeneration: false,
      quizBankReuse: false,
      sudoku: false,
      csvImport: false,
      csvExport: false,
      guardianLinks: false,
    },
  };
}

export function isUnlimitedCap(value) {
  return !value || value <= 0;
}

export function isAiGeneratedSource(source) {
  const label = String(source || "").toLowerCase();
  return label.includes("openai") || label.includes("generated");
}

/** 0 = up to absolute max (100). */
export function getMaxQuestionsPerQuizForPlan(limits) {
  const cap = limits?.maxQuestionsPerQuiz;
  if (isUnlimitedCap(cap)) {
    return 100;
  }
  return Math.max(1, Math.min(100, cap));
}

const STUDY_MAX_MESSAGES_FLOOR = 10;

function readStudyMaxMessagesEnv(name, fallback) {
  const raw = process.env[name];
  if (raw != null && String(raw).trim() !== "") {
    return Math.max(STUDY_MAX_MESSAGES_FLOOR, Number(raw));
  }
  return fallback;
}

/** Per-student cap on coach messages for one assignment. Falls back to STUDY_MAX_MESSAGES. */
export function getStudyMaxMessagesForTenantType(tenantType) {
  const globalCap = readStudyMaxMessagesEnv(
    "STUDY_MAX_MESSAGES",
    80,
  );

  if (tenantType === "family") {
    return readStudyMaxMessagesEnv("BILLING_FAMILY_STUDY_MAX_MESSAGES", globalCap);
  }
  if (tenantType === "school") {
    return readStudyMaxMessagesEnv("BILLING_SCHOOL_STUDY_MAX_MESSAGES", globalCap);
  }
  return globalCap;
}

export function resolveTenantTypeForUser(user) {
  if (user?.family_id != null) {
    return "family";
  }
  if (user?.school_id != null) {
    return "school";
  }
  return null;
}
