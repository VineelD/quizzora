# Quizzora disaster recovery

## What is backed up

- SQLite database: `data/littlecode.sqlite` (students, teachers, quizzes, submissions, audit logs)
- Daily compressed backups: `{Drive}:\QuizzoraBackups\production\littlecode-YYYYMMDD-HHmmss.sqlite.zip` (see [BACKUP.md](./BACKUP.md))
- Legacy optional copies: `backups/YYYY-MM-DD_HHmmss/littlecode.sqlite`

Run a manual backup:

```powershell
powershell -ExecutionPolicy Bypass -File C:\LittleCode\scripts\backup-prod-db.ps1
```

## Restore database (Windows)

1. Stop the app: `schtasks /End /TN "LittleCode Next.js"`
2. Copy the backup file over the live database:
   ```powershell
   Copy-Item C:\LittleCode\backups\<timestamp>\littlecode.sqlite C:\LittleCode\data\littlecode.sqlite -Force
   ```
3. Start the app: `schtasks /Run /TN "LittleCode Next.js"`
4. Verify: open `https://your-domain/api/health` — `database` should be `true`

## Production secrets

- Set `AUTH_SECRET` to a 32+ character random string (see `.env.example`)
- Configure `RESEND_API_KEY` and verified `MAIL_FROM` domain for password reset email

## Monitoring

- Poll `GET /api/health` every 5 minutes from UptimeRobot, Better Stack, or similar
- Alert when HTTP status is not 200 or `status` is not `ok`
