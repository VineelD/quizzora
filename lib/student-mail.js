import { getAppBaseUrl, sendAuthEmail } from "./mail.js";

export async function sendStudentWelcomeEmail({ student, password }) {
  const baseUrl = getAppBaseUrl();
  const subject = "Your Quizzora account";
  const text = [
    `Hi ${student.name},`,
    "",
    "Your teacher created a Quizzora account for you.",
    "",
    `Sign in at: ${baseUrl}`,
    `Username: ${student.username}`,
    `Temporary password: ${password}`,
    "",
    "Use Forgot password on the sign-in page if you need to reset your password later.",
  ].join("\n");

  const html = `
    <p>Hi ${student.name},</p>
    <p>Your teacher created a Quizzora account for you.</p>
    <p><a href="${baseUrl}">Open Quizzora</a></p>
    <p><strong>Username:</strong> ${student.username}<br/>
    <strong>Temporary password:</strong> ${password}</p>
    <p>Use <em>Forgot password</em> on the sign-in page if you need a new password later.</p>
  `;

  return sendAuthEmail({ to: student.email, subject, text, html });
}
