<!--
  NOT LEGAL ADVICE. Template/boilerplate Terms & Conditions for Australian ed-tech SaaS.
  Have a qualified lawyer review and adapt before production use.
  Source mirror of lib/terms-content.js and lib/data-hosting.js — keep in sync when terms change.
-->

# Terms and Conditions

**Version:** 2026-06-14  
**Last updated:** 14 June 2026

Boilerplate sections covered:

- Acceptance of terms
- Service description
- Accounts and registration
- Subscriptions and billing
- Free access and voluntary support
- Acceptable use
- AI-generated content disclaimer
- Educational use only; minors and school use
- Data and privacy (pointer to Privacy Policy)
- **Data hosting and storage** (on-premises hosting; third-party processors; backups)
- Third-party services (OpenAI, Stripe)
- Disclaimers (as is)
- Limitation of liability
- Indemnification
- Termination
- Governing law and dispute resolution (Australia)
- Contact

Public page: `/legal/terms` (alias `/terms`).

When updating terms, bump `CURRENT_TERMS_VERSION` in `lib/terms.js` and update `lib/terms-content.js` and `lib/data-hosting.js`.

## Data hosting and storage (section text)

Student, school, family, and account data is processed and stored on servers located at the operator's premises in Australia (on-premises hosting). The primary application database is SQLite on a dedicated Windows server at those premises.

We do not sell personal information to third parties for marketing purposes.

We use third-party processors only where necessary to operate Quizzora: OpenAI for AI-powered quiz generation, study tools, and related features (prompts and content needed for those features may be sent to OpenAI for processing); email delivery providers (for example Resend or configured SMTP) for transactional messages such as password resets and invitations; and optional external payment providers only if you choose to make a voluntary support contribution (we do not store raw card numbers).

Data is sent to these providers only to perform the relevant function. We do not store the main application database on external SaaS database platforms.

Database backups are created daily and stored on-premises on local storage at the operator's premises (for example under `F:\QuizzoraBackups\production`), with automated retention as documented for our operations team.

We take reasonable steps to safeguard personal information and privacy, consistent with the Australian Privacy Principles (APP 11), and will apply further measures where appropriate. Measures may include role-based access controls, hashed passwords, HTTPS/TLS encryption in transit, secure HTTP-only session cookies, security response headers, and audit logging for administrative actions.

**Verify claims:** Confirm this text matches actual infrastructure (see `docs/BACKUP.md`, `docs/WINDOWS-AUTO-START.md`).
