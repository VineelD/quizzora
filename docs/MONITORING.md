# Uptime monitoring

## Health check

- **URL:** `https://quizzora.org/api/health`
- **Healthy:** HTTP 200 with JSON `status: "ok"`
- **Unhealthy:** HTTP 503 when `AUTH_SECRET` is missing in production or email is not configured

## Suggested alerts

1. **HTTP monitor** (UptimeRobot, Better Stack, or similar): poll `/api/health` every 5 minutes; alert on non-200.
2. **Process monitor** on the Windows host: scheduled task **LittleCode Next.js** must be running; only one Node process should listen on port 3000. (Task name may still reference LittleCode.)
3. **IIS:** site should proxy to `http://127.0.0.1:3000` without redirect loops.

## Notification channels

- Email the operator mailbox on failure.
- Optional Slack incoming webhook: post when health check fails twice in a row.

## After an incident

1. Check Task Scheduler for **LittleCode Next.js**.
2. Run `C:\LittleCode\scripts\windows\start-littlecode.ps1` if the port is stuck or duplicate processes exist.
3. Confirm `npm run build` was run after the last deploy.
4. See `docs/DISASTER-RECOVERY.md` if database restore is required.
