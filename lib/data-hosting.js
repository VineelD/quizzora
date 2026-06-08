import { OPERATOR_PRODUCT_NAME } from "./operator.js";

/** Short region label for signup and legal summaries (override via DATA_REGION_LABEL). */
export const DATA_HOSTING_REGION = process.env.DATA_REGION_LABEL?.replace(/\s*\(.*\)/, "").trim() || "Australia";

/**
 * On-premises hosting statements shared across Terms, Privacy, and signup copy.
 * Verify against actual infrastructure before relying on this text.
 */
export function getDataHostingParagraphs() {
  const product = OPERATOR_PRODUCT_NAME;
  return [
    `Student, school, family, and account data is processed and stored on servers located at the company's premises in ${DATA_HOSTING_REGION} (on-premises hosting). The primary application database is SQLite on a dedicated Windows server at those premises.`,
    `We do not sell personal information to third parties for marketing purposes.`,
    `We use third-party processors only where necessary to operate ${product}: Stripe for payment processing (we do not store raw card numbers); OpenAI for AI-powered quiz generation, study tools, and related features (prompts and content needed for those features may be sent to OpenAI for processing); and email delivery providers (for example Resend or configured SMTP) for transactional messages such as password resets and invitations.`,
    `Data is sent to these providers only to perform the relevant function. We do not store the main application database on external SaaS database platforms.`,
    `Database backups are created daily and stored on-premises on local storage at the same company premises (for example under F:\\QuizzoraBackups\\production), with automated retention as documented for our operations team.`,
    `We take reasonable steps to safeguard personal information and privacy, consistent with the Australian Privacy Principles (APP 11), and will apply further measures where appropriate. Measures may include role-based access controls, hashed passwords, HTTPS/TLS encryption in transit, secure HTTP-only session cookies, security response headers, and audit logging for administrative actions.`,
  ];
}

export function dataHostingSignupHint() {
  return `Data is stored on ${OPERATOR_PRODUCT_NAME} servers at our premises in ${DATA_HOSTING_REGION}. We take reasonable steps to safeguard your data and privacy.`;
}
