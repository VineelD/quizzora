# Host security (Quizzora Windows server)

Last updated: June 2026.

This document describes the security posture of the Quizzora home-hosted Windows server, what has been hardened in-repo, and what you must maintain manually.

**Important:** No system can be guaranteed 100% secure against external attack. Defense in depth reduces risk; ongoing patching and monitoring are required.

## Architecture (intended)

```
Internet â†’ Cloudflare (proxy/WAF) â†’ your public IP:80/443 â†’ IIS â†’ 127.0.0.1:3000 (Node/Next.js)
                                              â†‘
                         Firewall: only Cloudflare IPs on 80/443
                         Node: loopback only (not reachable from LAN/WAN directly)
```

SQLite lives on disk at `SQLITE_DATABASE_PATH` â€” it is **not** network-exposed.

## Audit snapshot (this machine)

Run anytime:

```powershell
.\scripts\audit-host-security.ps1
.\scripts\audit-host-security.ps1 -OutputFile C:\LittleCode\logs\host-security-audit.txt
```

### Listening ports (summary)

| Port | Bind | Service | Exposure risk | Notes |
|------|------|---------|---------------|-------|
| 3000 | 127.0.0.1 | Node (prod) | **Low** | Correct â€” IIS reverse proxy only |
| 3001 | 127.0.0.1 | Node (staging) | **Low** | Correct â€” test instance |
| 80, 443 | 0.0.0.0 | IIS (System) | **Medium** | Expected public web; restrict via Cloudflare firewall rules |
| 3389 | 0.0.0.0 | RDP | **Medium** | Service listens on all interfaces; inbound **blocked on Public** profile (`Quizzora - Block RDP on Public profile`) |
| 5432 | — | PostgreSQL | **Low** (if stopped) | Stopped 2026-06-08; Quizzora uses SQLite |
| 21â€“27 | 0.0.0.0 | Microsoft FTP | **High** | Stop `ftpsvc` if unused |
| 445 | 0.0.0.0 | SMB | **Medium** | Inbound SMB **blocked on Public** (`Quizzora - Block SMB on Public profile`); Private LAN sharing unchanged |
| 8080â€“8082, 5000â€“5001 | 0.0.0.0 | IIS sites | **Medium** | Confirm only required sites; lock down via firewall |

Re-run the audit script after changes â€” port list varies by installed software.

### Windows Firewall

| Profile | Enabled | Default inbound |
|---------|---------|-----------------|
| Domain | Yes | NotConfigured |
| Private | Yes | NotConfigured |
| Public | Yes | **Block** |

**LittleCode origin rules** (from `scripts\windows\lockdown-origin-cloudflare.ps1`):

- `LittleCode - Cloudflare IPv4/IPv6 80,443` â€” allow inbound HTTP(S) only from Cloudflare IP ranges
- `LittleCode - Loopback 3000,3001,8080` â€” allow IIS/cloudflared â†’ Node only from localhost

Legacy broad rule `App3000 Inbound` should remain **disabled**.

## Application security (code)

| Control | Status | Location |
|---------|--------|----------|
| Reverse proxy to loopback | OK | `web.config` â†’ `http://127.0.0.1:3000` |
| Node bind address | OK | `start-littlecode.ps1` â†’ `--hostname 127.0.0.1` |
| Session cookies `httpOnly` | OK | `lib/session-cookie.js` |
| Secure cookies on HTTPS | OK | `lib/session-cookie.js` + `AUTH_COOKIE_SECURE` |
| Security headers (HSTS, X-Frame-Options, etc.) | OK | `middleware.js` |
| CSP (report-only, Stripe-aware) | OK | `middleware.js` |
| Auth email rate limit | OK | `lib/auth-tokens.js` (6/hour per email) |
| Speech refine rate limit | OK | `lib/speech-refine-rate-limit.js` |
| Stripe webhook signature verify | OK | See `docs/PCI-COMPLIANCE.md` |
| Secrets in git | OK | `.env*.local` gitignored |

**Production cookie note:** `start-littlecode.ps1` defaults `AUTH_COOKIE_SECURE=false` only when unset. For HTTPS production (`APP_BASE_URL=https://â€¦`), omit `AUTH_COOKIE_SECURE` or set it so cookies are Secure when the client uses HTTPS.

## Hardening scripts

### 1. Origin lockdown (Cloudflare) â€” run first for production

```powershell
# Preview
.\scripts\windows\lockdown-origin-cloudflare.ps1 -WhatIf

# Apply (Administrator)
.\scripts\windows\lockdown-origin-cloudflare.ps1
```

Ensures 80/443 accept traffic only from [Cloudflare published IPs](https://www.cloudflare.com/ips/). Re-run when Cloudflare updates IP lists.

See also: `docs/DNS-QUIZZORA.md`


### 3. Automated host hardening (PostgreSQL, FTP, RDP, SMB)

```powershell
# Apply steps 1-4 from the audit checklist (Administrator)
.\scripts\apply-host-security-hardening.ps1

# Log: C:\LittleCode\logs\host-security-hardening-*.log
```

This script (idempotent):

1. Stops PostgreSQL (`postgresql*`) or binds `listen_addresses = localhost` if stop fails
2. Stops and disables `ftpsvc`
3. Runs `.\scripts\harden-hosting-firewall.ps1 -BlockRdpFromPublic` (warns about Public Wi-Fi RDP lockout)
4. Disables Public-only SMB-In rules and adds `Quizzora - Block SMB on Public profile` (TCP 445)
5. Records router steps as **manual-only** (cannot configure from this PC)
6. Health-checks `http://127.0.0.1:3000` and `:3001`

### 2. Host firewall hardening

```powershell
# Preview
.\scripts\harden-hosting-firewall.ps1 -WhatIf

# Apply (Administrator)
.\scripts\harden-hosting-firewall.ps1

# Optional: block RDP on Public networks only (may lock you out on Public Wi-Fi)
.\scripts\harden-hosting-firewall.ps1 -BlockRdpFromPublic
```

This script:

- Enables Windows Firewall on all profiles
- Sets Public default inbound to Block
- Refreshes loopback allow rule for ports 3000, 3001, 8080
- Disables legacy broad Node allow rules
- Optionally blocks RDP (3389) on the Public profile only

**Does not** replace Cloudflare origin lockdown for ports 80/443.

## What was hardened (June 2026 audit)

- Verified Node binds **127.0.0.1** only on 3000 and 3001
- Confirmed existing Cloudflare origin firewall rules on 80/443
- Added `scripts/audit-host-security.ps1` (read-only audit)
- Added `scripts/harden-hosting-firewall.ps1` (safe firewall hardening)
- Extended loopback firewall rule to include staging port **3001**
- Documented `.env.example` `HOSTNAME=127.0.0.1`

### Applied on 2026-06-08 (`apply-host-security-hardening.ps1`)

| Step | Result |
|------|--------|
| PostgreSQL | Stopped `postgresql-x64-18`; startup **Manual** |
| FTP | `ftpsvc` **Stopped** / **Disabled** |
| RDP | `harden-hosting-firewall.ps1 -BlockRdpFromPublic` — rule **Quizzora - Block RDP on Public profile** |
| SMB Public | Disabled Public-only restrictive SMB-In; **Quizzora - Block SMB on Public profile** (TCP 445) |
| Router | **Manual-only** — see [Router checklist completed by operator](#router-checklist-completed-by-operator) |
| Quizzora health | HTTP **200** on 127.0.0.1:3000 and :3001 after hardening |

Audit logs: `logs/host-security-audit-before.txt`, `logs/host-security-audit-after.txt`, `logs/host-security-hardening-*.log`.

## Router checklist completed by operator

**Cannot be automated from the Windows host.** Complete these steps in your router admin UI (often `192.168.1.1` or the default gateway from `ipconfig`).

### Verification on this PC (optional)

```powershell
# Default gateway (router)
Get-NetRoute -DestinationPrefix '0.0.0.0/0' | Select-Object NextHop, InterfaceAlias

# UPnP / local port proxy (empty output is normal on Windows)
netsh interface portproxy show all
```

Router NAT port forwards must still be reviewed in the **router web UI**; this PC cannot list them reliably without router API access.

### Manual steps on the router

### Local verification (automated) — 2026-06-08

Log: `logs/host-hardening-applied.txt`. Audits: `logs/host-security-audit-before.txt`, `logs/host-security-audit-after.txt`.

| Check | Result |
|-------|--------|
| Node 3000/3001 bind | 127.0.0.1 only (HTTP 200 after hardening) |
| PostgreSQL 5432 | Not listening; service **Disabled** |
| FTP 21 | Not listening; **ftpsvc** Disabled |
| RDP 3389 | Service listens on all interfaces; **Public inbound blocked** (Quizzora - Block RDP on Public profile) |
| SMB 445 | **Public inbound blocked**; File and Printer Sharing (SMB-In) on Private/Domain only |

**Router verified by user on:** _____________ *(complete manual checklist above in router admin UI)*


- [ ] **Operator completed on:** _____________ (date)
- [ ] Remove or avoid port forwards to this PC for **3000, 3001, 3389, 5432, 21** (FTP), and other admin ports
- [ ] Keep only **80/443** toward this host (or use **Cloudflare Tunnel** with no inbound ports)
- [ ] Disable **UPnP** on the router if automatic port mapping is not required
- [ ] Confirm no **DMZ** host points at this machine
- [ ] Strong router admin password and current firmware

| External port | Internal IP:port | Purpose | Remove? |
|---------------|------------------|---------|---------|
| | | | |

## Remaining manual steps (recommended)

1. **PostgreSQL** — Applied 2026-06-08 (stopped). Re-enable only if another app needs it; bind `127.0.0.1` only.
2. **FTP (`ftpsvc`)** — Applied 2026-06-08 (stopped/disabled).
3. **RDP** — Applied 2026-06-08 (`-BlockRdpFromPublic`). Allowed on **Private**; blocked on **Public** profile.
4. **SMB (445)** — Applied 2026-06-08 (Public inbound block via firewall). Private LAN unchanged.
5. **Router** — **Manual:** [Router checklist completed by operator](#router-checklist-completed-by-operator). Do not forward 3000/3001/3389/5432.
6. **Windows Update** â€” Install security updates promptly.
7. **Cloudflare** â€” Orange-cloud (proxied) DNS, SSL Full, WAF rules, 2FA on dashboard.
8. **Stripe / GitHub** â€” 2FA enabled; rotate `STRIPE_WEBHOOK_SECRET` if compromised.
9. **Webhook hardening** â€” Rate limit at Cloudflare or IIS where possible; see `docs/PCI-COMPLIANCE.md`.
10. **Quarterly** â€” Re-run audit script; external vulnerability scan if required by PCI acquirer.

## Cloudflare Tunnel (alternative)

If you use `cloudflared` instead of A-record + proxy, see `scripts\windows\cloudflared-littlecode.yml.template`. Tunnel traffic typically hits `localhost:8080` (IIS), not Node directly.

Do not run both conflicting public entry paths without understanding which is active.

## PCI cross-reference

Quizzora uses Stripe-hosted Checkout (reduced PCI scope). Host security still matters for:

- TLS/HTTPS to your origin (`docs/PCI-COMPLIANCE.md`)
- Webhook endpoint protection
- Annual SAQ / vulnerability scanning of public-facing systems
- Access control and secure configuration of the Windows host

See `docs/PCI-COMPLIANCE.md` sections *Network / vulnerability management* and *Webhook endpoint protected*.

## Ongoing checklist

- [ ] `.\scripts\audit-host-security.ps1` monthly (or after infra changes)
- [ ] `.\scripts\windows\lockdown-origin-cloudflare.ps1` after Cloudflare IP updates
- [ ] Node still on 127.0.0.1 (`netstat -ano | findstr "3000 3001"`)
- [ ] IIS `web.config` still proxies to loopback
- [ ] `.env.local` not in git; `AUTH_SECRET` rotated if leaked
- [ ] Windows Update current
- [ ] Cloudflare / Stripe / GitHub 2FA enabled

## Related docs

- `docs/DNS-QUIZZORA.md` â€” DNS, Cloudflare proxy, origin firewall
- `docs/PCI-COMPLIANCE.md` â€” payment security and merchant obligations
- `docs/MONITORING.md` â€” health checks and uptime alerts
- `docs/WINDOWS-AUTO-START.md` â€” scheduled tasks and bind addresses
