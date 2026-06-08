import nodemailer from "nodemailer";

async function sendViaResend({ from, to, subject, text, html }) {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("RESEND_API_KEY is missing.");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to: [to], subject, text, html }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Email delivery failed: ${error}`);
  }

  return { delivered: true, dev: false, provider: "resend" };
}

function getTransport() {
  const host = process.env.SMTP_HOST;
  if (!host) {
    return null;
  }

  return nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: process.env.SMTP_USER
      ? {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        }
      : undefined,
  });
}

export function getAppBaseUrl() {
  return (process.env.APP_BASE_URL || "http://localhost:8080").replace(/\/$/, "");
}

export function getEmailProvider() {
  if (process.env.RESEND_API_KEY?.trim()) {
    return "resend";
  }
  if (process.env.SMTP_HOST?.trim()) {
    return "smtp";
  }
  return "dev";
}

export async function sendAuthEmail({ to, subject, text, html }) {
  const from = process.env.MAIL_FROM || "Quizzora <onboarding@resend.dev>";
  const provider = getEmailProvider();

  if (provider === "resend") {
    return sendViaResend({ from, to, subject, text, html });
  }

  if (provider === "smtp") {
    const transport = getTransport();
    try {
      await transport.sendMail({ from, to, subject, text, html });
      return { delivered: true, dev: false, provider: "smtp" };
    } catch (error) {
      if (String(error.message).includes("SmtpClientAuthentication is disabled")) {
        throw new Error(
          "Outlook SMTP is blocked for this mailbox. Set RESEND_API_KEY in .env.local and restart the Quizzora Node task.",
        );
      }
      throw error;
    }
  }

  console.info("[mail:dev]", { to, subject, text });
  return { delivered: false, dev: true, provider: "dev" };
}

export function buildVerificationEmail({ link, heading, body }) {
  return {
    subject: `${heading} — Quizzora`,
    text: `${body}\n\nOpen this link to continue (expires soon):\n${link}\n\nIf you did not request this, you can ignore this email.`,
    html: `<p>${body}</p><p><a href="${link}">Continue to Quizzora</a></p><p style="color:#666;font-size:14px;">This link expires soon. If you did not request it, ignore this email.</p>`,
  };
}
