/** When true (default), schools and families get free access — no Stripe checkout or subscriptions. */
export function isFreeAccessMode() {
  return String(process.env.BILLING_FREE_ACCESS ?? "true").trim().toLowerCase() !== "false";
}

/** Stripe subscriptions are only active when free access is off and a secret key is configured. */
export function isPaidSubscriptionsEnabled() {
  if (isFreeAccessMode()) {
    return false;
  }
  return Boolean(process.env.STRIPE_SECRET_KEY?.trim());
}
