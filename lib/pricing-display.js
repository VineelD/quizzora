import { isFreeAccessMode } from "./billing-mode.js";
import { getTrialDays, getYearlyDiscountPercent } from "./billing.js";
import {
  getFamilyPaidPlanLimits,
  getFamilyTrialPlanLimits,
  getPaidPlanLimits,
  getTrialPlanLimits,
  isUnlimitedCap,
} from "./plans.js";

export function formatPlanCap(value) {
  return isUnlimitedCap(value) ? "Unlimited" : String(value);
}

export function getPublicPricing() {
  const trial = getTrialPlanLimits();
  const paid = getPaidPlanLimits();
  const familyTrial = getFamilyTrialPlanLimits();
  const familyPaid = getFamilyPaidPlanLimits();
  const freeAccess = isFreeAccessMode();

  if (freeAccess) {
    return {
      freeAccess: true,
      trialDays: 0,
      yearlyDiscountPercent: 0,
      monthlyLabel: "Free",
      yearlyLabel: "Free",
      familyMonthlyLabel: "Free",
      familyYearlyLabel: "Free",
      trial: { ...paid, planName: "Free" },
      paid: { ...paid, planName: "Free" },
      familyTrial: { ...familyPaid, planName: "Free" },
      familyPaid: { ...familyPaid, planName: "Free" },
    };
  }

  const monthlyAud = process.env.BILLING_DISPLAY_MONTHLY_AUD?.trim();
  const yearlyAud = process.env.BILLING_DISPLAY_YEARLY_AUD?.trim();
  const familyMonthlyAud = process.env.BILLING_DISPLAY_FAMILY_MONTHLY_AUD?.trim();
  const familyYearlyAud = process.env.BILLING_DISPLAY_FAMILY_YEARLY_AUD?.trim();

  return {
    freeAccess: false,
    trialDays: getTrialDays(),
    yearlyDiscountPercent: getYearlyDiscountPercent(),
    monthlyLabel: monthlyAud ? `AUD $${monthlyAud} / month` : "Monthly plan (see checkout)",
    yearlyLabel: yearlyAud ? `AUD $${yearlyAud} / year` : "Yearly plan (see checkout)",
    familyMonthlyLabel: familyMonthlyAud
      ? `AUD $${familyMonthlyAud} / month`
      : monthlyAud
        ? `AUD $${monthlyAud} / month`
        : "Monthly plan (see checkout)",
    familyYearlyLabel: familyYearlyAud
      ? `AUD $${familyYearlyAud} / year`
      : yearlyAud
        ? `AUD $${yearlyAud} / year`
        : "Yearly plan (see checkout)",
    trial,
    paid,
    familyTrial,
    familyPaid,
  };
}
