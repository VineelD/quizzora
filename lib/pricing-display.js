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
  const monthlyAud = process.env.BILLING_DISPLAY_MONTHLY_AUD?.trim();
  const yearlyAud = process.env.BILLING_DISPLAY_YEARLY_AUD?.trim();
  const familyMonthlyAud = process.env.BILLING_DISPLAY_FAMILY_MONTHLY_AUD?.trim();
  const familyYearlyAud = process.env.BILLING_DISPLAY_FAMILY_YEARLY_AUD?.trim();

  return {
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
