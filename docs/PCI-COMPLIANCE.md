# PCI Compliance (Quizzora + Stripe Checkout)

Last updated: June 2026.

Quizzora uses **Stripe-hosted Checkout** (customers are redirected to Stripe-hosted payment pages) plus **Stripe Customer Portal**. Quizzora’s server receives only **webhook events** and stores **non-sensitive billing metadata** (for example, subscription/customer IDs and an internal webhook audit log containing only event `id`/`type`).

This document is meant to help you complete your own PCI compliance obligations for Stripe-backed billing. It does **not** claim full PCI certification from code alone—PCI compliance is a shared responsibility between Stripe and your business.

## Shared responsibility (Stripe vs Quizzora)

Stripe:
- Is certified annually by an independent QSA as a PCI Level 1 Service Provider meeting relevant PCI requirements.
- Secures the hosted cardholder-data environment you use for Checkout and the Customer Portal.

Your business (the merchant accepting payments):
- Must do so in a PCI-compliant manner and **annually attest** to PCI compliance (typically via your acquiring bank / merchant portal + self-assessment).
- Must configure and operate your own systems securely (access control, secure configurations, vulnerability management, etc.).

Reference: Stripe’s integration security guide and PCI validation notes:
https://docs.stripe.com/security/guide#validating-pci-compliance

## Expected PCI scope with Stripe-hosted Checkout

### Likely SAQ classification (confirm with your acquirer/QSA)

Because Quizzora uses **Stripe-hosted Checkout** (hosted payment pages / redirects) and does not store or handle raw card data server-side, your merchant PCI self-assessment is **typically** classified as the simplest option for fully outsourced card-data handling (often referred to as **SAQ A**).

However, your exact SAQ eligibility can depend on how your payment flow is implemented, what other scripts/changes run on your payment pages, your infrastructure, and what your acquiring bank/QSA requires. Confirm classification with your Qualified Security Assessor (QSA) / acquirer before filing.

### What Quizzora does (code-level controls)

Quizzora’s responsibilities for PCI scope reduction include:

1. **No cardholder data on the merchant server**
   - Checkout and card entry happen on Stripe-hosted pages.
   - Quizzora’s server stores only Stripe identifiers (for example `stripe_customer_id`, `stripe_subscription_id`) and billing status.
2. **Webhook signature verification**
   - The webhook endpoint verifies webhook signatures using Stripe’s recommended `constructEvent(...)` pattern.
   - Webhook secret is read from `STRIPE_WEBHOOK_SECRET`.
3. **Webhook logging hygiene**
   - Quizzora records an internal audit log that stores only safe values (for example event `id`/`type`), not card data.
4. **TLS/HTTPS (deployment)**
   - Payment page and webhook endpoints must be reachable over HTTPS with a current TLS version (>= TLS 1.2).

## What you must do outside code (merchant + Stripe Dashboard)

### Stripe Dashboard / account security

You should ensure the following in Stripe (wording varies by dashboard/region):

1. **Enable 2FA** for all Stripe users with access.
2. **Verify your business/account** as required.
3. **Complete the PCI questionnaire / PCI compliance attestation** in Stripe’s PCI tooling or via your acquiring bank flow (annual).
4. If you use webhooks:
   - Ensure the webhook endpoint is configured in Stripe with the correct events.
   - Keep `STRIPE_WEBHOOK_SECRET` private (store it in `.env.local`).
   - Consider allowing Stripe IP ranges to call your webhook endpoint (in your firewall / reverse proxy rules).

### Network / vulnerability management

PCI obligations still apply even with outsourced card processing. Common required activities include:

1. **Annual PCI attestation / SAQ submission** (your acquiring bank/QSA determines exact process).
2. **Vulnerability scanning and remediation** for your public-facing systems (acquirers commonly require at least quarterly external scans via an Approved Scanning Vendor).
3. Secure configuration management (patching, access control, secure defaults) for your public app and any admin surfaces.

## Security headers & CSP (Stripe guidance)

Stripe recommends using CSP directives that allow Stripe-hosted resources for Checkout/Stripe.js.

From Stripe’s PCI/integration security guide (Checkout-related directives):
- `connect-src`: `https://checkout.stripe.com`
- `frame-src`: `https://checkout.stripe.com`
- `script-src`: `https://checkout.stripe.com`
- `img-src`: `https://*.stripe.com`

Quizzora also sets baseline security headers in `middleware.js`:
- X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy
- `Content-Security-Policy-Report-Only` (so you can tune CSP without breaking Next.js rendering)

If you choose to enforce a strict `Content-Security-Policy` header (not report-only), tune it carefully and test the full payment + portal flows.

## “Never store card data” (confirm in practice)

To maintain the reduced PCI scope, you must ensure operationally that:
- No logs, database tables, analytics events, or error reports ever capture PAN/track data (or full sensitive cardholder data).
- Only Stripe identifiers and non-sensitive billing metadata are stored.
- Incident response includes removing any accidental sensitive logs if they ever appear.

## Incident response (PCI-oriented pointer)

If you suspect a security incident affecting payment processing:
1. Stop the blast radius: consider temporarily disabling billing endpoints / blocking webhook calls at your reverse proxy.
2. Rotate secrets: rotate `STRIPE_WEBHOOK_SECRET` in Stripe and update your `STRIPE_WEBHOOK_SECRET`.
3. Contact Stripe support / follow their incident guidance.
4. Preserve evidence and investigate your access logs, error logs, and admin actions.

Use:
- `docs/MONITORING.md` for health-check monitoring and alerting
- `docs/DISASTER-RECOVERY.md` for database restore procedures

## Quick checklist

Code-level already in place (Quizzora):
- [ ] Webhook signature verification uses `constructEvent(...)`
- [ ] Billing audit log stores only safe values (event `id`/`type`)
- [ ] No cardholder data is gathered server-side

You must do (merchant + infrastructure):
- [ ] Annual SAQ / PCI attestation completed (through your acquiring bank/QSA process)
- [ ] Stripe 2FA enabled + account verification complete
- [ ] PCI questionnaire/attestation completed in Stripe’s tooling (annual)
- [ ] HTTPS/TLS configured for your site and webhook endpoint
- [ ] External vulnerability scanning of your public-facing IPs as required by your acquirer
- [ ] Webhook endpoint protected (rate limiting + allowlisted Stripe IPs where possible)

## Related docs

- `docs/AU-COMPLIANCE.md` (Australia production checklist)
- `docs/SCHOOL-DPA.md` (template DPA for schools)

