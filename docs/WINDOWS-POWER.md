# Windows power settings for Quizzora hosting

This machine runs Quizzora production and optional staging via Windows Task Scheduler. Use the optimization script to reduce latency and avoid sleep/adapter power-down while the host stays on AC power.

## Script

**Path:** `C:\LittleCode\scripts\optimize-hosting-power.ps1`

**Run as Administrator:**

```powershell
powershell -ExecutionPolicy Bypass -File C:\LittleCode\scripts\optimize-hosting-power.ps1
```

### What it configures

- Active **AC** power scheme: display off after 10 minutes; disk, sleep, and hibernate timeouts set to never; hibernation disabled (`powercfg /hibernate off`).
- Advanced AC settings: PCI Express link power management off, USB selective suspend disabled, processor min 5% / max 100%, hard disk never turns off.
- **Physical Ethernet** adapters: disables adapter power management and sets registry `PnPCapabilities` so Windows does not turn off the NIC to save power.

### Optional: staging only

To save power when you are not developing against staging, pass **`-StopTestInstance`**. That stops (if running) and **disables** only:

| Task name | Role |
|-----------|------|
| `LittleCode Test Next.js` | Staging — test.quizzora.org, port 3001 |

Production and backup tasks are **not** changed:

| Task name | Role |
|-----------|------|
| `LittleCode Next.js` | Production — quizzora.org, port 3000 |
| `LittleCode Prod DB Backup` | Nightly production DB backup |

Re-enable staging:

```powershell
schtasks /Change /TN "\LittleCode Test Next.js" /ENABLE
```

## Related docs

- [OPERATOR.md](./OPERATOR.md) — day-to-day operations
- [MONITORING.md](./MONITORING.md) — health checks
