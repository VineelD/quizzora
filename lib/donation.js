/** Voluntary support — not required for access. Cap is a guideline shown to users, not enforced in code. */

export const DONATION_MAX_AUD = Math.min(Math.max(Number(process.env.DONATION_MAX_AUD || 10), 1), 10);

export const DONATION_URL = process.env.DONATION_URL?.trim() || "";

export function isDonationConfigured() {
  return Boolean(DONATION_URL);
}

export function getDonationCapLabel() {
  return `AUD $${DONATION_MAX_AUD}`;
}

export function getDonationMessage() {
  return `${getDonationCapLabel()} maximum voluntary donation — appreciated but never required. Quizzora is free for schools and families.`;
}

export function getDonationShortMessage() {
  return `Free to use. Optional support up to ${getDonationCapLabel()} is welcome if you find Quizzora helpful.`;
}
