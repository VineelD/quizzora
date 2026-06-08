import { OPERATOR_PRODUCT_NAME, operatorDisplayLine } from "./operator.js";
import { stripeStatementDescriptor } from "./stripe-profile.js";

/** Canonical Quizzora plans — live and Stripe test sandbox use the same amounts. */
export const STRIPE_PLAN_CATALOG = [
  {
    key: "school",
    productName: `${OPERATOR_PRODUCT_NAME} School Plan`,
    description: `${OPERATOR_PRODUCT_NAME} school subscription (${operatorDisplayLine()})`,
    prices: [
      { env: "STRIPE_PRICE_MONTHLY", interval: "month", amountAud: 120, nickname: "School monthly" },
      { env: "STRIPE_PRICE_YEARLY", interval: "year", amountAud: 1200, nickname: "School yearly" },
    ],
  },
  {
    key: "family",
    productName: `${OPERATOR_PRODUCT_NAME} Family Plan`,
    description: `${OPERATOR_PRODUCT_NAME} family / homeschool subscription (${operatorDisplayLine()})`,
    prices: [
      { env: "STRIPE_PRICE_FAMILY_MONTHLY", interval: "month", amountAud: 30, nickname: "Family monthly" },
      { env: "STRIPE_PRICE_FAMILY_YEARLY", interval: "year", amountAud: 300, nickname: "Family yearly" },
    ],
  },
];

export function stripeSandboxMetadata(planKey) {
  return {
    quizzora_plan: planKey,
    quizzora_sandbox: "1",
  };
}

export function audToCents(amountAud) {
  return Math.round(Number(amountAud) * 100);
}

export function productStatementDescriptor() {
  return stripeStatementDescriptor();
}
