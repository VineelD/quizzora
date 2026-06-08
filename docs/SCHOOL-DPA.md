# School Data Processing Addendum (template)

Last updated: June 2026.  
This template is provided for convenience and is **not legal advice**. Have an Australian lawyer review this for your business and your target school system requirements.

This Data Processing Addendum (“**DPA**”) forms part of the agreement between:
- **School** (“Customer”, “Controller”), and
- **Mr Vineel Davuluri** (ABN 41 833 153 799), trading as **Quizzora** (“Provider”, “Processor”)

It applies to personal information processed in connection with the Quizzora service (“**Service**”).

## 1) Definitions

- **Personal Information**: has the meaning in the Privacy Act 1988 (Cth).
- **Student Data**: Personal Information relating to students, guardians, and staff processed through the Service.
- **Processing**: any handling of Personal Information including collection, storage, use, disclosure, deletion.

## 2) Roles

- The School is responsible for determining **why and how** Student Data is processed (the “Controller”).
- The Provider processes Student Data **only on the School’s documented instructions** (the “Processor”), except where required by law.

## 3) What data is processed (scope)

The Service may process:
- Account data: name, email, username, role (student/teacher/admin)
- School/class data: classes, year levels, assignments, marks and completion status
- Guardian contact details (if enabled by School)
- Audit logs of administrative actions (for security and accountability)

Sensitive information (optional):
- Student learning needs notes (only if entered by School staff)

## 4) Purpose of processing

Provider will process Student Data to:
- Provide the Service, including authentication, assessment delivery, submissions, and reporting
- Provide school-admin functions such as audit logs and account management
- Provide operational security, backups, and service reliability

## 5) Provider instructions

Provider will process Student Data in accordance with:
- This DPA
- The School’s documented configuration choices (for example enabling guardian links)
- Support requests initiated by authorised School admins

## 6) Subprocessors

Provider may use subprocessors to provide the Service. Current subprocessors include:

| Subprocessor | Purpose | Notes |
|--------------|---------|--------|
| **Stripe** | Subscription billing (Checkout + Customer Portal) | Card data handled by Stripe; not stored on Provider servers |
| **Resend** (or SMTP relay) | Transactional email (verification, invites, password reset) | May process data outside Australia |
| **OpenAI** | AI quiz generation from teacher prompts | Quiz content only; avoid unnecessary student PII in prompts |
| **Cloudflare** (if enabled) | CDN, TLS, DDoS protection | Edge network may process requests globally |
| **Operator-hosted server** | Application database and file storage | Primary data region: Australia (operator-hosted) |

Provider will maintain a list of subprocessors and update the School on material changes as part of standard release notes or policy updates.

## 7) Overseas disclosure

Some subprocessors may process data outside Australia. Where applicable, Provider will:
- Disclose this in the Privacy Policy and/or subprocessor list
- Take reasonable steps to ensure appropriate safeguards are in place

## 8) Security measures

Provider will implement reasonable technical and organisational measures, including:
- TLS/HTTPS in transit
- Access control and role-based permissions
- Audit logging for administrative actions
- Backups and disaster recovery procedures
- Webhook signature validation for payment events (if Stripe enabled)

Provider does not store or process raw payment card details (PAN) on its servers when using Stripe-hosted Checkout.

## 9) Data retention and deletion

- Data is retained as described in `/legal/data-retention`.
- On request from an authorised School admin, Provider will delete or export Student Data within a reasonable timeframe, subject to:
  - legal obligations,
  - legitimate security/audit retention (for example billing events), and
  - technical constraints described below.

## 10) Assistance with privacy requests

Provider will reasonably assist the School to respond to:
- access/correction requests,
- deletion requests, and
- other privacy enquiries,

to the extent the School cannot fulfil these requests independently within the Service.

## 11) Breach notification

Provider will notify the School without undue delay after becoming aware of a suspected or confirmed data breach affecting Student Data.

If a breach is likely to result in serious harm, the School and Provider will cooperate to support obligations under the **Notifiable Data Breaches (NDB) scheme** (Privacy Act).

## 12) Audit and assurance

On reasonable request, Provider will provide:
- a summary of security controls,
- copies/links to relevant public policies (privacy, retention, PCI notes), and
- confirmation of Stripe PCI status (hosted Checkout model).

Formal third-party certifications (ISO/SOC2/IRAP) are not guaranteed unless explicitly agreed in writing.

## 13) Limitations and technical constraints

- The Service is multi-tenant per school; access is scoped by `school_id`.
- Backups may retain deleted data for a limited retention window (see Disaster Recovery documentation).
- Logs may be retained for security and operational integrity.

## 14) Contact

School privacy/security contact: _________________________  
Provider privacy/security contact: **support@quizzora.org**  
Provider legal entity: **Mr Vineel Davuluri** (ABN 41 833 153 799)

## 15) Signatures

School authorised representative: ______________________  Date: __________  
Provider authorised representative: **Mr Vineel Davuluri**  Date: __________

