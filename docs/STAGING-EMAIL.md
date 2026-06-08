# Staging email: `@staging.quizzora.org`

The staging **website** runs at **`https://test.quizzora.org`**. Staging **email** uses the separate subdomain **`staging.quizzora.org`** so test mail never mixes with production `@quizzora.org` inboxes.

| Purpose | Address | How |
|---------|---------|-----|
| Operator inbox (recommended) | `inbox@staging.quizzora.org` | Cloudflare Email Routing → your real inbox |
| Catch-all (optional) | `*@staging.quizzora.org` | Cloudflare catch-all on subdomain |
| Super admin account | `superadmin@staging.quizzora.org` | App login only; forward if you want to receive mail |
| Outbound auth / reset mail | `noreply@staging.quizzora.org` | **Resend** (send only) |
| Human contact on staging UI | `support@staging.quizzora.org` or reuse `inbox@…` | Routing rule (optional) |

**Resend does not receive mail.** Inbound staging mail is handled only by **Cloudflare Email Routing**. Outbound mail uses the same `RESEND_API_KEY` as production, with a separate Resend domain for `staging.quizzora.org`.

See also: [DNS and email for quizzora.org](./DNS-QUIZZORA.md) (production), [Staging environment](./TEST-ENVIRONMENT.md) (IIS, Stripe test, DB), [Yahoo Mail folders & filters](./EMAIL-YAHOO-FOLDERS.md) (organize forwarded mail in one inbox).

---

## Prerequisites

- **`quizzora.org`** is on Cloudflare (same zone as production).
- **Root Email Routing** is already enabled for `quizzora.org` (MX on `@` → `route*.mx.cloudflare.net`). Do **not** remove root MX records.
- **`test`** CNAME exists for the staging site (see [TEST-ENVIRONMENT.md](./TEST-ENVIRONMENT.md)).
- Destination inbox (e.g. your personal Gmail/Yahoo) ready to click Cloudflare’s verification link.
- After forwarding works, set up Yahoo folders and filters: [EMAIL-YAHOO-FOLDERS.md](./EMAIL-YAHOO-FOLDERS.md).

---

## Part 1 — Inbound inbox (Cloudflare Email Routing)

### Step 1 — Add subdomain `staging`

1. Open [Cloudflare Dashboard](https://dash.cloudflare.com) → zone **`quizzora.org`**.
2. Go to **Email** → **Email Routing** → **Settings**.
3. Under **Subdomains**, click **Add subdomain**.
4. Enter **`staging`** (Cloudflare shows `staging.quizzora.org`).
5. Review the preview DNS records (MX + SPF TXT on **`staging`**, not `@`).
6. Click **Add records and enable**.
7. Wait until **Routing status** = **Enabled** and **Email DNS records** = **Configured** for `staging`.

Cloudflare typically adds records like:

| Type | Name | Content | Proxy |
|------|------|---------|-------|
| **MX** | `staging` | `route1.mx.cloudflare.net` (prio 12) | DNS only |
| **MX** | `staging` | `route2.mx.cloudflare.net` (prio 47) | DNS only |
| **MX** | `staging` | `route3.mx.cloudflare.net` (prio 98) | DNS only |
| **TXT** | `staging` | `v=spf1 include:_spf.mx.cloudflare.net ~all` | DNS only |

Use the **exact** values Cloudflare shows in the preview — do not copy from production `@` MX.

Verify:

```powershell
nslookup -type=mx staging.quizzora.org 1.1.1.1
```

You should see `route*.mx.cloudflare.net`, not Google/Microsoft MX.

### Step 2 — Verify destination address (once per account)

1. **Email** → **Email Routing** → **Destination addresses**.
2. If your real inbox is not listed, **Add destination address** → enter it → **Send verification email**.
3. Open the email from Cloudflare and click **Verify email address**.

Destination addresses are shared across all zones in your Cloudflare account.

### Step 3 — Create routing rules

1. **Email** → **Email Routing** → **Routing rules** → **Create address**.
2. **Custom address**: choose domain **`staging.quizzora.org`**, local part **`inbox`** → `inbox@staging.quizzora.org`.
3. **Action**: **Send to an email** → select your verified destination inbox.
4. **Save**.

Recommended extra rules (same flow):

| Custom address | Use |
|----------------|-----|
| `superadmin@staging.quizzora.org` | Mail to staging super-admin login |
| `support@staging.quizzora.org` | Staging “contact us” (optional) |

### Step 4 — Catch-all (optional, good for QA)

Useful when testers sign up with arbitrary `@staging.quizzora.org` addresses.

1. **Email** → **Email Routing** → **Routing rules** (or **Routes**).
2. Enable **Catch-all address** for **`staging.quizzora.org`** (subdomain selector if shown).
3. **Action**: forward to the same verified destination as `inbox@…`.
4. **Save**.

Test inbound:

```powershell
# From any mail client, send to inbox@staging.quizzora.org
# It should arrive at your destination inbox within a minute or two.
```

---

## Part 2 — Outbound mail (Resend on `staging.quizzora.org`)

Production sends via `lib/mail.js` using `RESEND_API_KEY` and `MAIL_FROM`. Staging should use a **staging-specific From** after the domain is verified.

### Step 1 — Add domain in Resend

1. [Resend → Domains](https://resend.com/domains) → **Add domain** → **`staging.quizzora.org`**.
2. Open the domain → **Records** tab. Copy the exact DNS rows Resend shows (do not guess).

Typical pattern (names vary — use Resend’s values):

| Type | Name (in Cloudflare) | Notes |
|------|----------------------|--------|
| **TXT** | `send.staging` or `send` | SPF for subdomain |
| **CNAME** | `resend._domainkey.staging` | DKIM |
| **TXT** | `_dmarc.staging` | Optional DMARC |

Set **Proxy status** to **DNS only** (grey cloud) for all mail records.

### Step 2 — Verify in Resend

1. Click **Verify DNS Records** in Resend.
2. Status should become **verified** or **partially_verified** with outbound sending enabled (often minutes; up to ~72 hours).

Optional CLI check from production repo (uses `.env.local` `RESEND_API_KEY`):

```powershell
cd C:\LittleCode
# Resend CLI helper only checks quizzora.org today; verify staging in the Resend dashboard
# or add staging.quizzora.org manually in Resend first, then check status there.
```

Send a manual test from Resend dashboard: **Emails** → send from `noreply@staging.quizzora.org` to your personal inbox.

### Step 3 — Update staging app env

Edit **`C:\LittleCode-test\.env.local`** (never commit this file):

```env
MAIL_FROM=Quizzora <noreply@staging.quizzora.org>
# Optional: show staging contact in UI / legal footer
# OPERATOR_CONTACT_EMAIL=inbox@staging.quizzora.org
```

Keep the same `RESEND_API_KEY` as production unless you use a separate Resend project for staging.

Restart staging Node:

```powershell
Stop-ScheduledTask -TaskName "LittleCode Test Next.js"
Start-ScheduledTask -TaskName "LittleCode Test Next.js"
```

Trigger a password reset on `https://test.quizzora.org` and confirm:

- **From:** `noreply@staging.quizzora.org`
- **Links:** `https://test.quizzora.org/...`

---

## Part 3 — Automate with project scripts (optional)

Add to **`C:\LittleCode\.env.local`** (not git):

```env
CLOUDFLARE_API_TOKEN=...          # Zone → Email Routing Edit, Zone → DNS Read
CLOUDFLARE_ZONE_ID=...            # quizzora.org zone id
EMAIL_FORWARD_TO=you@example.com  # verified destination
```

**Subdomain must already be enabled in the dashboard (Part 1, Step 1)** before API rules work. The script creates routing rules only; it does not add subdomain MX records.

### Primary inbox rule

```powershell
cd C:\LittleCode
node scripts/setup-cloudflare-email-routing.mjs --domain=staging.quizzora.org --local=inbox
```

### Catch-all on staging subdomain

```powershell
node scripts/setup-cloudflare-email-routing.mjs --domain=staging.quizzora.org --catch-all
```

### Dry run

```powershell
node scripts/setup-cloudflare-email-routing.mjs --domain=staging.quizzora.org --local=inbox --dry-run
```

Environment variable equivalents:

| Variable | Example |
|----------|---------|
| `EMAIL_ROUTING_DOMAIN` | `staging.quizzora.org` |
| `EMAIL_ROUTING_LOCAL` | `inbox` |
| `EMAIL_ROUTING_RULE_NAME` | `Staging inbox` |
| `EMAIL_FORWARD_TO` | your real inbox |

Production `support@quizzora.org` (root domain) is unchanged:

```powershell
node scripts/setup-cloudflare-email-routing.mjs
```

---

## Architecture summary

```text
Inbound (receive):
  sender → MX staging.quizzora.org (Cloudflare)
         → routing rules / catch-all
         → your personal inbox

Outbound (send):
  test.quizzora.org app → Resend API
                        → From: noreply@staging.quizzora.org
                        → DKIM/SPF on staging.quizzora.org DNS
```

Resend **receiving** MX on `staging.quizzora.org` must **not** be added if Cloudflare Email Routing handles inbound — only one inbound MX stack per hostname.

---

## Verification checklist

- [ ] `nslookup -type=mx staging.quizzora.org` → Cloudflare `route*.mx.cloudflare.net`
- [ ] `inbox@staging.quizzora.org` forwards to your inbox
- [ ] (Optional) catch-all on `staging.quizzora.org` works
- [ ] Resend shows `staging.quizzora.org` outbound verified
- [ ] `C:\LittleCode-test\.env.local` has `MAIL_FROM=Quizzora <noreply@staging.quizzora.org>`
- [ ] Password reset from test site arrives from `noreply@staging.quizzora.org` with `test.quizzora.org` links
- [ ] Production `quizzora.org` mail (support@, noreply@) still works

---

## Related scripts

| Script | Purpose |
|--------|---------|
| `scripts/setup-cloudflare-email-routing.mjs` | Create routing rules (root or `--domain=staging.quizzora.org`) |
| `scripts/setup-quizzora-email.mjs` | Resend check + test send for **`quizzora.org`** only |
| `scripts/write-test-env.ps1` | Regenerate `C:\LittleCode-test\.env.local` (copies prod `MAIL_FROM` until you override) |
| `scripts/reset-staging-db.ps1` | Seeds `superadmin@staging.quizzora.org` |

**Organize mail in Yahoo:** [EMAIL-YAHOO-FOLDERS.md](./EMAIL-YAHOO-FOLDERS.md) — folders and filter rules when everything forwards to one inbox.
