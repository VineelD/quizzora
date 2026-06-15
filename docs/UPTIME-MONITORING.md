# Uptime monitoring (on-server email alerts)

Quizzora can email you when production (or optional staging) health checks fail, and again when the site recovers. The monitor runs on the same Windows host as the app via Task Scheduler — no third-party service required.

## How it works

Every **5 minutes**, the scheduled task runs `C:\LittleCode\scripts\run-uptime-check.ps1`, which invokes `scripts/uptime-check.mjs` with a stable Node path (important when the task runs as `SYSTEM`).

The script:

1. `GET` each configured health URL (default: `http://127.0.0.1:3000/api/health`)
2. Treats **HTTP 200** with JSON `status: "ok"` as healthy
3. After **2 consecutive failures**, sends **`[Quizzora] Site down alert`**
4. Sends **`[Quizzora] Site recovered`** when health returns
5. Repeats down alerts at most once per **cooldown** period (default 60 minutes) while still unhealthy
6. Stores debounce/cooldown state in `data/uptime-monitor-state.json` (not committed to git)

## Prerequisites

Outbound email must already work (same as password-reset mail):

- **Resend (recommended):** `RESEND_API_KEY` and `MAIL_FROM` in `.env.local`
- **Or SMTP:** `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`

See [DNS-QUIZZORA.md](./DNS-QUIZZORA.md) and [STAGING-EMAIL.md](./STAGING-EMAIL.md).

## Configuration (`.env.local`)

Add to `C:\LittleCode\.env.local` (never commit this file):

```env
# Required — where alerts are delivered
UPTIME_ALERT_EMAIL=support@quizzora.org

# Optional — defaults shown
UPTIME_CHECK_URL=http://127.0.0.1:3000/api/health
# UPTIME_CHECK_URLS=http://127.0.0.1:3000/api/health,https://quizzora.org/api/health
# UPTIME_FAIL_THRESHOLD=2
# UPTIME_ALERT_COOLDOWN_MINUTES=60
# UPTIME_CHECK_TIMEOUT_MS=15000
```

| Variable | Default | Purpose |
|----------|---------|---------|
| `UPTIME_ALERT_EMAIL` | *(none)* | Operator inbox for down/recovery messages |
| `UPTIME_CHECK_URL` | `http://127.0.0.1:3000/api/health` | Single URL to poll |
| `UPTIME_CHECK_URLS` | — | Comma-separated list; overrides `UPTIME_CHECK_URL` when set |
| `UPTIME_FAIL_THRESHOLD` | `2` | Consecutive failures before the first down alert |
| `UPTIME_ALERT_COOLDOWN_MINUTES` | `60` | Minimum gap between repeat down alerts |
| `UPTIME_CHECK_TIMEOUT_MS` | `15000` | Request timeout per URL |

**Local vs public checks:** Polling `127.0.0.1:3000` detects Node/IIS process failures on the box. Adding `https://quizzora.org/api/health` also catches DNS, TLS, or Cloudflare issues — at the cost of an external dependency during outages.

Optional staging monitor:

```env
UPTIME_CHECK_URLS=http://127.0.0.1:3000/api/health,http://127.0.0.1:3001/api/health
```

## Register the scheduled task

**Administrator PowerShell:**

```powershell
powershell -ExecutionPolicy Bypass -File C:\LittleCode\scripts\register-uptime-monitor.ps1
```

Or re-run the full service installer (includes uptime task):

```powershell
powershell -ExecutionPolicy Bypass -File C:\LittleCode\scripts\ensure-windows-services.ps1
```

**Task name:** `Quizzora Uptime Monitor`

Verify:

```powershell
schtasks /Query /TN "Quizzora Uptime Monitor" /V /FO LIST
```

## Manual test

```powershell
cd C:\LittleCode
node scripts\uptime-check.mjs
```

Expected console lines like:

```text
[uptime] http://127.0.0.1:3000/api/health ok failures=0
```

If `UPTIME_ALERT_EMAIL` or email provider vars are missing, the script prints setup instructions and exits with code `1`.

## Alert email content

- **Subject:** `[Quizzora] Site down alert` or `[Quizzora] Site recovered`
- **Body:** timestamp (UTC ISO), Windows hostname, URL checked, error message (down only)

## Health endpoint reference

- Production: `https://quizzora.org/api/health`
- Local prod: `http://127.0.0.1:3000/api/health`
- Staging: `http://127.0.0.1:3001/api/health`

Healthy = HTTP **200** and `"status":"ok"`. HTTP **503** / `"status":"degraded"` counts as down (database or `AUTH_SECRET` problems).

## Related docs

- [WINDOWS-AUTO-START.md](./WINDOWS-AUTO-START.md) — all scheduled tasks
- [MONITORING.md](./MONITORING.md) — health checks and incident response
- [DISASTER-RECOVERY.md](./DISASTER-RECOVERY.md) — restore after extended outage
