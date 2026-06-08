# Australia production compliance (Quizzora)

Last updated: June 2026.

This document is a **practical checklist** for operating Quizzora in production in Australia. It’s **not legal advice**. For school contracts, privacy, tax, and insurance, engage an Australian lawyer and accountant.

## Operator identity

| Field | Value |
|-------|--------|
| Legal operator | **Mr Vineel Davuluri** (ABN 41 833 153 799) |
| Product | **Quizzora** |
| Support contact | **support@quizzora.org** |

See also `docs/OPERATOR.md` and the school DPA template at `docs/SCHOOL-DPA.md`.

## What “certifications” you need (quick answer)

Most Australian ed-tech SaaS products do **not** require a government-issued certification to launch.

What you typically need is:
- **Legal compliance** (Privacy Act / APPs where applicable, Consumer Law, Spam Act)
- **Industry compliance** (PCI attestation via Stripe if you take card payments)
- **School procurement expectations** (security questionnaires, incident response, sometimes ISO/SOC2 later)

If you sell to government departments or large school networks, they may **require** an industry framework (for example ISO 27001) or a formal security assessment. That’s a commercial/procurement requirement, not a general legal certification.

## 1) Privacy (Privacy Act 1988 + Australian Privacy Principles)

Quizzora handles personal information (students, teachers, guardians). Your obligations depend on your entity type and turnover, but **schools commonly expect APP-level controls regardless**.

### Required documents (minimum)
- **Privacy policy**: `/legal/privacy`
- **Data retention statement**: `/legal/data-retention`
- **Terms of service**: `/legal/terms`
- **Subprocessors list** (recommended): payment/email/AI providers and where they process data

### Core obligations to satisfy
- **Collection transparency**: clearly describe what you collect and why.
- **Security (APP 11)**: take reasonable steps to protect personal information (access control, encryption in transit, backups, audit trails, secure configuration).
- **Overseas disclosure (APP 8)**: if you use providers that process data overseas, disclose this and take reasonable steps to ensure equivalent protection.
- **Data breach response**: see NDB below.

### Implementation checklist (operator actions)
- [ ] Maintain accurate legal pages (privacy/terms/retention) and keep “Last updated” current.
- [ ] Provide a **contact channel** for privacy requests (email address / support form).
- [ ] Define deletion/export handling (who can request, SLA, what data is retained).
- [ ] Keep a subprocessor register (Stripe, Resend/SMTP, OpenAI, hosting/CDN) and update privacy policy when it changes.

## 2) Notifiable Data Breaches (NDB) scheme

If a data breach is likely to cause **serious harm**, you must notify affected individuals and the OAIC as soon as practicable.

Operator checklist:
- [ ] Create a breach playbook: detection, containment, assessment, notification, remediation.
- [ ] Identify who is on-call/decision-maker.
- [ ] Keep evidence (logs, timestamps) and preserve systems for investigation.

Related docs:
- `docs/MONITORING.md`
- `docs/DISASTER-RECOVERY.md`

## 3) Consumer & contract law (ACL)

Subscriptions must be transparent: pricing, renewal, cancellation, refunds/credits.

Checklist:
- [ ] Ensure Terms clearly describe billing cycle, trial length, cancellation method, and what happens on failed payment.
- [ ] Ensure marketing claims match product behaviour (plan limits, AI usage, uptime).

## 4) Email and messaging compliance (Spam Act 2003)

Transactional emails (password reset, verification, invites) are generally fine, but marketing requires consent and an unsubscribe mechanism.

Checklist:
- [ ] Separate marketing mail from transactional mail.
- [ ] Add unsubscribe for marketing lists.

## 5) Payments (PCI DSS via Stripe)

Quizzora uses **Stripe-hosted Checkout** and the **Customer Portal**, so card entry is handled by Stripe and your card-data scope is reduced.

You still must:
- Complete the **annual PCI questionnaire/attestation** required by Stripe/acquirer
- Secure your own systems and maintain vulnerability management

Project doc:
- `docs/PCI-COMPLIANCE.md`

## 6) Accessibility (Disability Discrimination Act 1992)

There’s no universal “accessibility certificate”, but schools often expect **WCAG 2.1 AA** level accessibility.

Checklist:
- [ ] Keyboard navigation and focus visible across all pages
- [ ] Contrast checks on primary UI
- [ ] Form labels, error messages, headings structure
- [ ] “Prefers reduced motion” handling for animated backgrounds
- [ ] Run an accessibility audit (Lighthouse/axe) before pitching to schools

## 7) Child safety / student safety expectations

Even when not strictly legislated as a “certification”, school procurement will look for:
- Clear roles & access control
- Audit logs / admin oversight
- Data retention and deletion controls
- AI safety controls (avoid sending unnecessary PII, content moderation posture)

Checklist:
- [ ] Admin-only billing + audit access
- [ ] Guardian access links are limited and revocable (where applicable)
- [ ] Publish an acceptable use statement for schools (recommended)

## 8) Security baseline (recommended)

Australia common baseline is the ACSC **Essential Eight** (not a certificate by default).

Practical checklist for a small SaaS:
- [ ] MFA on Stripe, email, DNS/CDN, and hosting accounts
- [ ] Unique strong secrets (`AUTH_SECRET`, Stripe keys) stored only in `.env.local` / secret store
- [ ] Regular OS and dependency patching
- [ ] Backups + restore test
- [ ] Least-privilege access, remove old admin accounts
- [ ] Rate limit sensitive endpoints (auth, webhooks) at reverse proxy/CDN where possible

## 9) Procurement “certifications” you might be asked for (later)

Not legally required for most launches, but can unlock larger contracts:
- **Cyber insurance** + professional indemnity (often requested)
- **ISO 27001** (information security management system)
- **SOC 2** (commonly requested by US-style procurement)
- **IRAP** (Australian government assessment; usually only for government agencies)

## Operator to-do list (minimum viable compliance)

Before charging schools:
- [ ] Stripe 2FA enabled
- [ ] PCI attestation complete (Stripe dashboard / acquirer)
- [ ] Privacy/Terms/Retention reviewed and accurate
- [ ] Incident response + breach notification playbook
- [ ] Backups + restore tested
- [ ] Accessibility smoke audit
- [ ] School DPA ready for procurement (see `docs/SCHOOL-DPA.md`)

