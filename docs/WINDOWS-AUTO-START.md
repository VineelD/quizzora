# Windows auto-start and scheduled backups

Quizzora production (`quizzora.org`) and staging (`test.quizzora.org`) run as **long-lived Node processes** behind **IIS reverse proxy**. After a server reboot, Task Scheduler starts both apps; IIS (`W3SVC`) starts with Windows.

## Scheduled tasks

| Task name | Trigger | Runs as | Script | Backend port |
|-----------|---------|---------|--------|--------------|
| `LittleCode Next.js` | **At system startup** | `SYSTEM` (highest available) | `C:\LittleCode\start-littlecode.ps1` | `127.0.0.1:3000` |
| `LittleCode Test Next.js` | **At system startup** | `SYSTEM` | `C:\LittleCode-test\start-littlecode-test.ps1` | `127.0.0.1:3001` |
| `LittleCode Prod DB Backup` | **Daily 2:00 AM** (local) | `SYSTEM` | `C:\LittleCode\scripts\backup-prod-db.ps1` | N/A |

Node app tasks restart up to **3 times** at **1-minute** intervals if the start script exits unexpectedly. Logs: `C:\LittleCode\logs\next.log` and `C:\LittleCode-test\logs\next.log`.

**Staging database:** there is no scheduled test DB backup; staging data is disposable. Production backups only — see [BACKUP.md](./BACKUP.md).

## IIS

| Site | Hostnames | App pool |
|------|-----------|----------|
| `LittleCode` | `quizzora.org` (and legacy bindings) | `LittleCode` |
| `LittleCode-Test` | `test.quizzora.org` | `DefaultAppPool` |

The ensure script sets app pool **startMode** to `AlwaysRunning` and confirms sites are started. The **World Wide Web Publishing Service** (`W3SVC`) should be **Automatic**.

## Register or repair after rebuild

Run **Administrator PowerShell**:

```powershell
powershell -ExecutionPolicy Bypass -File C:\LittleCode\scripts\ensure-windows-services.ps1
```

Optional: apply tasks and start Node immediately (without reboot):

```powershell
powershell -ExecutionPolicy Bypass -File C:\LittleCode\scripts\ensure-windows-services.ps1 -StartTasksNow
```

Skip IIS changes:

```powershell
powershell -ExecutionPolicy Bypass -File C:\LittleCode\scripts\ensure-windows-services.ps1 -SkipIis
```

## Verify (no reboot required)

1. **Tasks**

   ```powershell
   schtasks /Query /TN "LittleCode Next.js" /V /FO LIST
   schtasks /Query /TN "LittleCode Test Next.js" /V /FO LIST
   schtasks /Query /TN "LittleCode Prod DB Backup" /V /FO LIST
   ```

   Expect **Schedule Type: At system start up** for the two Node tasks and **Daily** at **2:00 AM** for backup.

2. **Local health**

   ```powershell
   Invoke-WebRequest http://127.0.0.1:3000/api/health -UseBasicParsing
   Invoke-WebRequest http://127.0.0.1:3001/api/health -UseBasicParsing
   ```

3. **Public URLs**

   - `https://quizzora.org/api/health`
   - `https://test.quizzora.org/api/health`

4. **Manual start** (same as tasks run on boot):

   ```powershell
   Start-ScheduledTask -TaskName "LittleCode Next.js"
   Start-ScheduledTask -TaskName "LittleCode Test Next.js"
   ```

## Related docs

- [BACKUP.md](./BACKUP.md) — backup script, retention, restore notes
- [TEST-ENVIRONMENT.md](./TEST-ENVIRONMENT.md) — staging layout and one-time setup
- [MONITORING.md](./MONITORING.md) — external health checks
