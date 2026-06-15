/** Operator details for legal pages and public copy. Run voluntarily as a hobby — not a registered business. */

export const OPERATOR_LEGAL_NAME = process.env.OPERATOR_LEGAL_NAME || "Mr Vineel Davuluri";

/** Optional legacy ABN — leave unset for hobby operation. Only used if explicitly configured. */
export const OPERATOR_ABN = process.env.OPERATOR_ABN?.trim() || "";

export const OPERATOR_PRODUCT_NAME = process.env.OPERATOR_PRODUCT_NAME || "Quizzora";

export const OPERATOR_CONTACT_EMAIL = process.env.OPERATOR_CONTACT_EMAIL || "support@quizzora.org";

/** Format an 11-digit ABN as `41 833 153 799`; pass through other non-empty values. */
export function formatAbnForDisplay(abn) {
  const digits = String(abn || "").replace(/\D/g, "");
  if (digits.length !== 11) {
    return String(abn || "").trim();
  }
  return `${digits.slice(0, 2)} ${digits.slice(2, 5)} ${digits.slice(5, 8)} ${digits.slice(8)}`;
}

/** Public-facing operator identifier (legal name only — hobby project, no ABN by default). */
export function operatorDisplayLine() {
  return OPERATOR_LEGAL_NAME;
}

/** Short context for legal and marketing copy. */
export function operatorContextLine() {
  return "voluntary hobby project (not a registered business or professional advice service)";
}

/** ABN digits only (for legacy Stripe tax_id). Empty when OPERATOR_ABN unset. */
export function operatorAbnDigits() {
  return String(OPERATOR_ABN || "").replace(/\D/g, "");
}
