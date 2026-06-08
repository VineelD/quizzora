import { getEmailProvider } from "./mail.js";

const PLACEHOLDER_SECRETS = new Set([
  "local-dev-change-this-secret",
  "replace-with-long-random-secret",
  "",
]);

export function validateAuthSecret() {
  const secret = String(process.env.AUTH_SECRET || "").trim();
  if (!secret || PLACEHOLDER_SECRETS.has(secret)) {
    return {
      ok: false,
      message: "AUTH_SECRET must be set to a long random value in production.",
    };
  }
  if (secret.length < 32) {
    return {
      ok: false,
      message: "AUTH_SECRET should be at least 32 characters.",
    };
  }
  return { ok: true, message: "AUTH_SECRET configured." };
}

export function getProductionReadiness() {
  const auth = validateAuthSecret();
  const emailProvider = getEmailProvider();
  const emailOk = emailProvider === "resend" || emailProvider === "smtp";

  return {
    authSecret: auth,
    email: {
      ok: emailOk,
      provider: emailProvider,
      message: emailOk
        ? `Email provider: ${emailProvider}`
        : "No email provider configured (set RESEND_API_KEY or SMTP_HOST).",
    },
    dataRegion: process.env.DATA_REGION_LABEL || "Australia (operator-hosted)",
    appBaseUrl: process.env.APP_BASE_URL || "http://localhost:8080",
  };
}
