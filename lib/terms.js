/** Current Terms & Conditions version (ISO date). Bump when terms change materially. */
export const CURRENT_TERMS_VERSION = "2026-06-14";

export function assertTermsAccepted(body) {
  if (body?.acceptedTerms !== true) {
    throw new Error("You must agree to the Terms and Conditions to create an account.");
  }
}

export function termsAcceptanceFields() {
  return {
    termsAcceptedAt: new Date().toISOString(),
    termsVersion: CURRENT_TERMS_VERSION,
  };
}
