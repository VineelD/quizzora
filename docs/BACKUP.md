# Quizzora production database backup

## Overview

Production SQLite (`C:\LittleCode\data\littlecode.sqlite`) is backed up daily to the drive with the most free space, under:

```
{Drive}:\QuizzoraBackups\production\
```

Each backup is an online SQLite copy (Node `node:sqlite` backup API), then compressed to:

```
littlecode-YYYYMMDD-HHmmss.sqlite.zip
```

## Scripts

| Script | Purpose |
|--------|---------|
| `scripts/backup-prod-db.mjs` | Online SQLite backup to a `.sqlite` file |
| `scripts/backup-prod-db.ps1` | Picks backup drive, runs backup, zips, retention, logging |
| `scripts/reset-prod-db-keep-platform.ps1` | Backup then wipe tenant data (keeps `superadmin` + `support`) |
| `scripts/reset-prod-db-keep-platform.mjs` | SQLite wipe logic used by the reset script |

## Manual backup

```powershell
powershell -ExecutionPolicy Bypass -File C:\LittleCode\scripts\backup-prod-db.ps1
```

Optional override:

```powershell
powershell -ExecutionPolicy Bypass -File C:\LittleCode\scripts\backup-prod-db.ps1 -BackupRoot "F:\QuizzoraBackups\production"
```

## Scheduled task

| Setting | Value |
|---------|-------|
| Task name | `LittleCode Prod DB Backup` |
| Schedule | Daily at **2:00 AM** local time |
| Run as | `SYSTEM` |
| Action | `powershell.exe -NoProfile -ExecutionPolicy Bypass -File C:\LittleCode\scripts\backup-prod-db.ps1` |

Register or update:

```powershell
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument '-NoProfile -ExecutionPolicy Bypass -File "C:\LittleCode\scripts\backup-prod-db.ps1"'
$trigger = New-ScheduledTaskTrigger -Daily -At "2:00AM"
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName "LittleCode Prod DB Backup" -Action $action -Trigger $trigger -Settings $settings -RunLevel Highest -User "SYSTEM" -Force
```

See also [WINDOWS-AUTO-START.md](./WINDOWS-AUTO-START.md) for idempotent registration of all three tasks via `scripts/ensure-windows-services.ps1`.

## Retention

`backup-prod-db.ps1` deletes zip files older than **30 days** (configurable via `-RetentionDays`).

Logs: `C:\LittleCode\logs\backup-prod-db.log`

## Restore

1. Stop the app: `Stop-ScheduledTask -TaskName "LittleCode Next.js"`
2. Expand the zip and copy over the live database:

   ```powershell
   Expand-Archive "F:\QuizzoraBackups\production\littlecode-YYYYMMDD-HHmmss.sqlite.zip" -DestinationPath "C:\LittleCode\data\_restore"
   Copy-Item "C:\LittleCode\data\_restore\littlecode-YYYYMMDD-HHmmss.sqlite" "C:\LittleCode\data\littlecode.sqlite" -Force
   ```

3. Start the app: `Start-ScheduledTask -TaskName "LittleCode Next.js"`
4. Verify: `https://quizzora.org/api/health`

See also [DISASTER-RECOVERY.md](./DISASTER-RECOVERY.md).
