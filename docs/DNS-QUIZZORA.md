# DNS and email for quizzora.org

This guide covers pointing **quizzora.org** at your Quizzora server and verifying the domain in **Resend** for password-reset and auth email.

## Prerequisites

- Domain **quizzora.org** registered and added to **Cloudflare** (nameservers pointed to Cloudflare).
- Resend account with `RESEND_API_KEY` in `.env.local`.
- Origin firewall script applied: `scripts\windows\lockdown-origin-cloudflare.ps1`

---

## Staging subdomain (test.quizzora.org)

| Type | Name | Content | Proxy |
|------|------|---------|-------|
| **CNAME** | `test` | `quizzora.org` (or same A record IP as production) | **Proxied** |

IIS site **LittleCode-Test** proxies to Node on port **3001**. Full setup: **`docs/TEST-ENVIRONMENT.md`**.

**Staging email** (`@staging.quizzora.org`, not `test.quizzora.org`): **`docs/STAGING-EMAIL.md`**.

---

## Part 1 — Website DNS

Your app runs on `http://127.0.0.1:3000` (Node) behind **IIS on ports 80 and 443** (public). Use **one** of the options below.

### Option A — A record to your public IP (recommended if you added an A record)

In **Cloudflare** → **DNS** → **Records**:

| Type | Name | Content | Proxy |
|------|------|---------|-------|
| **A** | `@` | Your home/server **public IPv4** | **Proxied** (orange cloud) |
| **A** or **CNAME** | `www` | Same IP, or `quizzora.org` | **Proxied** |

Critical:

1. **Orange cloud (Proxied) must be ON.** The origin firewall only allows Cloudflare IP ranges on 80/443. Grey cloud (DNS only) sends visitors directly to your IP and they will be blocked.
2. At your **router**, forward **TCP 80 and 443** to this Windows server’s LAN IP (if behind NAT).
3. **SSL/TLS** in Cloudflare → **Full** (IIS terminates HTTP from Cloudflare on 80/443).

Check propagation:

```powershell
nslookup quizzora.org 1.1.1.1
```

You should see Cloudflare anycast IPs (e.g. `104.x`, `172.x`), **not** your home IP, when proxy is on.

You do **not** need cloudflared if using A record + proxy. Stop the tunnel service if it is still running to avoid confusion.

### Option B — Cloudflare Tunnel (no port forwarding)

Use if you cannot open ports 80/443 on your router. See `scripts\windows\cloudflared-littlecode.yml.template` and:

```powershell
cloudflared tunnel route dns littlecode quizzora.org
```

Tunnel connects to `http://localhost:8080`; origin firewall allows **8080** on localhost only.

### SSL

With Cloudflare proxy on (orange cloud), HTTPS is automatic. Keep **SSL/TLS** mode **Full** or **Full (strict)**.

### Origin firewall (block non-Cloudflare traffic)

Cloudflare recommends the origin accept web traffic **only** from Cloudflare IP ranges so users cannot bypass the proxy via your server’s public IP.

On this Windows server, run **as Administrator**:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
cd C:\LittleCode
.\scripts\windows\lockdown-origin-cloudflare.ps1
```

This script:

- Allows inbound **80** and **443** only from [Cloudflare’s published IP lists](https://www.cloudflare.com/ips/)
- Allows **8080** and **3000** only from **localhost** (cloudflared → IIS → Node)
- Sets the **Public** firewall profile to default **inbound Block** (other IPs cannot bypass Cloudflare on 80/443)
- Disables broad legacy **allow** rules (`Allow TCP 8080-8090…`, `App3000 Inbound`, inbound `cloudflared` allow-all)

**Note:** Windows gives **Block** firewall rules precedence over **Allow**. This script uses Cloudflare **allow** rules plus default deny — not a catch-all block rule on the same ports.

Preview without changes: `.\scripts\windows\lockdown-origin-cloudflare.ps1 -WhatIf`

Re-run the script after major Cloudflare IP updates (it fetches live lists each time).

### Redirect www (optional)

**Rules** → **Redirect Rules**: `www.quizzora.org` → `https://quizzora.org` (301).

---

## Part 2 — Resend email DNS

The app sends mail via Resend (`lib/mail.js`). After domain verification, set in `.env.local`:

```env
MAIL_FROM=Quizzora <noreply@quizzora.org>
OPERATOR_CONTACT_EMAIL=support@quizzora.org
```

### Step 1 — Add domain in Resend

1. Open [Resend → Domains](https://resend.com/domains).
2. **Add domain** → enter `quizzora.org` (root domain is fine for transactional mail).
3. Open the domain → **Records** tab. Resend shows the exact records for your account (copy from there; do not guess).

### Step 2 — Add records in Cloudflare

In **Cloudflare** → **quizzora.org** → **DNS** → **Records**, add what Resend lists. Typical pattern:

| Type | Name | Content | Notes |
|------|------|---------|--------|
| **TXT** | `send` (or `@`) | `v=spf1 include:amazonses.com ~all` | SPF — use Resend’s exact value |
| **CNAME** | `resend._domainkey` | `….dkim.amazonses.com` | DKIM — Resend provides target |
| **TXT** | `_dmarc` | `v=DMARC1; p=none; rua=mailto:dmarc@quizzora.org` | Recommended; adjust policy later |

Important:

- Set **Proxy status** to **DNS only** (grey cloud) for mail-related records unless Resend docs say otherwise.
- Do not duplicate old `app2-cheetah.site` Resend records on the new domain.

### Step 3 — Verify

1. In Resend, click **Verify DNS Records**.
2. Status should become **verified** (often within minutes; up to ~72 hours).

### Step 4 — Inbound support@ (Cloudflare Email Routing)

`quizzora.org` already uses **Cloudflare Email Routing** MX records (`route*.mx.cloudflare.net`). Do **not** replace root MX with Resend inbound — that would break routing.

1. Cloudflare → **quizzora.org** → **Email** → **Email Routing** → **Routing rules**
2. Create **Custom address** `support` → forward to your real inbox
3. Click the verification link Cloudflare sends to that inbox

**Configured:** `support@quizzora.org` → `vineel_2962@yahoo.com` (verified in Cloudflare Email Routing).

Or automate (after adding to `.env.local`):

```env
CLOUDFLARE_API_TOKEN=...
CLOUDFLARE_ZONE_ID=...          # or CLOUDFLARE_ZONE_NAME=quizzora.org
EMAIL_FORWARD_TO=you@gmail.com
```

```powershell
node scripts/setup-cloudflare-email-routing.mjs
```

Outbound `noreply@quizzora.org` only needs Resend **sending** DNS (`send` + `resend._domainkey`), which is separate from root MX.

---

## Part 3 — App config (already in repo)

`.env.local` should include:

```env
APP_BASE_URL=https://quizzora.org
MAIL_FROM=Quizzora <noreply@quizzora.org>
OPERATOR_CONTACT_EMAIL=support@quizzora.org
AUTH_COOKIE_SECURE=true
```

Restart after changes:

```powershell
Stop-ScheduledTask -TaskName "LittleCode Next.js"
Start-ScheduledTask -TaskName "LittleCode Next.js"
```

---

## Part 4 — Stripe (if billing is live)

In [Stripe Dashboard](https://dashboard.stripe.com):

- **Webhooks** → endpoint `https://quizzora.org/api/billing/webhook`
- **Business settings** → website `https://quizzora.org`, support `support@quizzora.org`

---

## Verification checklist

- [ ] `https://quizzora.org` loads the login page
- [ ] `https://quizzora.org/api/health` returns OK
- [x] Resend outbound sending verified (`send` + `resend._domainkey`; domain may show *partially_verified* while Resend receiving is skipped)
- [x] `support@quizzora.org` forwards via Cloudflare Email Routing
- [ ] Password reset email arrives from `noreply@quizzora.org` with links to `https://quizzora.org/...`
- [ ] Sign-in works on mobile (session cookie over HTTPS)

---

## Platform admin emails

`SUPERADMIN_EMAIL` and `SUPPORT_EMAIL` in `.env.local` are used when **creating** those accounts. To migrate existing SQLite rows from `@app2-cheetah.site`:

```powershell
node scripts/migrate-domain-emails.mjs --dry-run
node scripts/migrate-domain-emails.mjs
```

## Helper scripts

| Script | Purpose |
|--------|---------|
| `scripts/setup-quizzora-email.mjs` | Resend domain check + test send from `noreply@quizzora.org` |
| `scripts/setup-cloudflare-email-routing.mjs` | Forward custom addresses via Cloudflare API (root or `--domain=staging.quizzora.org`) |
| `scripts/migrate-domain-emails.mjs` | Update legacy `@app2-cheetah.site` users in SQLite |
| `scripts/sync-stripe-webhook.mjs` | Ensure Stripe webhook URL is `https://quizzora.org/api/billing/webhook` |
