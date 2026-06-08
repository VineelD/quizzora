/** Australian operator details for legal pages and school agreements. */



/** Legal operator (sole trader / individual). Shown on public legal pages and Stripe copy. */

export const OPERATOR_LEGAL_NAME =

  process.env.OPERATOR_LEGAL_NAME || "Mr Vineel Davuluri";

/** ABN — shown with legal name on public pages and used for Stripe tax ID. */

export const OPERATOR_ABN = process.env.OPERATOR_ABN || "41 833 153 799";

export const OPERATOR_PRODUCT_NAME = process.env.OPERATOR_PRODUCT_NAME || "Quizzora";

export const OPERATOR_CONTACT_EMAIL =

  process.env.OPERATOR_CONTACT_EMAIL || "support@quizzora.org";



/** Format an 11-digit ABN as `41 833 153 799`; pass through other non-empty values. */

export function formatAbnForDisplay(abn) {

  const digits = String(abn || "").replace(/\D/g, "");

  if (digits.length !== 11) {

    return String(abn || "").trim();

  }

  return `${digits.slice(0, 2)} ${digits.slice(2, 5)} ${digits.slice(5, 8)} ${digits.slice(8)}`;

}



/** Public-facing operator identifier (legal name + ABN, not product brand). */

export function operatorDisplayLine() {

  const abn = formatAbnForDisplay(OPERATOR_ABN);

  if (!abn) {

    return OPERATOR_LEGAL_NAME;

  }

  return `${OPERATOR_LEGAL_NAME} (ABN ${abn})`;

}



/** ABN digits only (for Stripe tax_id and similar APIs). Empty when OPERATOR_ABN unset. */

export function operatorAbnDigits() {

  return String(OPERATOR_ABN || "").replace(/\D/g, "");

}


