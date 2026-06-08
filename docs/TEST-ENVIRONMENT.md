# Staging: test.quizzora.org

Separate clone of production for safe testing with **Stripe test mode**.

| | Production | Staging |
|--|------------|---------|
| URL | `https://quizzora.org` | `https://test.quizzora.org` |
| App path | `C:\LittleCode` | `C:\LittleCode-test` |
| Node port | `3000` | `3001` |
| IIS site | `LittleCode` | `LittleCode-Test` |
| Scheduled task | `LittleCode Next.js` | `LittleCode Test Next.js` |

Auto-start on reboot: [WINDOWS-AUTO-START.md](./WINDOWS-AUTO-START.md) (scripts/ensure-windows-services.ps1).
| Database | `C:\LittleCode\data\littlecode.sqlite` | `C:\LittleCode-test\data\littlecode.sqlite` |
| Stripe | Live (`sk_live_...`) | Test (`sk_test_...`) |
| Banner | None | Orange ?Test environment? bar |
| Tester gate | None | Optional shared login (see below) |
| Email domain | `@quizzora.org` | `@staging.quizzora.org` (see [STAGING-EMAIL.md](./STAGING-EMAIL.md)) |

## Staging email

Inbound mail for `@staging.quizzora.org` (e.g. `inbox@staging.quizzora.org`) is separate from the production `@quizzora.org` inbox. Outbound auth mail from staging should use `noreply@staging.quizzora.org` after Resend verifies that subdomain.

**Setup guide:** [STAGING-EMAIL.md](./STAGING-EMAIL.md) ? Cloudflare Email Routing, Resend DNS, and `C:\LittleCode-test\.env.local` updates.

**Yahoo inbox organization:** [EMAIL-YAHOO-FOLDERS.md](./EMAIL-YAHOO-FOLDERS.md) ? folders and filters when Cloudflare forwards staging and production mail to the same Yahoo address.

## Tester access gate

The staging site is public on the internet for geo testers. When `STAGING_GATE_PASSWORD` is set (staging only), visitors must sign in once with shared tester credentials before browsing.

| Variable | Purpose |
|----------|---------|
| `STAGING_GATE_USER` | Shared username (default: `tester`) |
| `STAGING_GATE_PASSWORD` | Shared password; **if unset or empty, the gate is disabled** |

Production (`APP_ENV` not `staging`, e.g. `quizzora.org`) ignores these variables.

After a successful sign-in at `/staging-gate`, the app sets an httpOnly cookie (`staging_gate_ok`, 7 days) so testers can use the site normally. Stripe webhooks (`/api/billing/webhook`), `/api/health`, and all `/api/auth/*` routes bypass the gate so sign-in and password reset keep working.

**Set the password only in** `C:\LittleCode-test\.env.local` (never commit real values). Regenerate or preserve it with:

```powershell
powershell -ExecutionPolicy Bypass -File C:\LittleCode\scripts\write-test-env.ps1
```

The script keeps an existing `STAGING_GATE_PASSWORD` when re-run; otherwise it generates a random 16-character password. Share username + password with testers out of band (email, password manager, etc.).

## One-time setup (Administrator PowerShell)

```powershell
powershell -ExecutionPolicy Bypass -File C:\LittleCode\scripts\setup-test-environment.ps1
```

## DNS (Cloudflare)

In **quizzora.org** ? **DNS**:

| Type | Name | Content | Proxy |
|------|------|---------|-------|
| CNAME | `test` | `quizzora.org` (or your server A record IP) | Proxied |

SSL/TLS mode: **Full** (same as production).

## Stripe test mode

1. [Stripe test API keys](https://dashboard.stripe.com/test/apikeys) ? copy `sk_test_...`
2. Create test products/prices:

   ```powershell
   $env:STRIPE_TEST_SECRET_KEY='sk_test_...'
   $env:APP_BASE_URL='https://test.quizzora.org'
   cd C:\LittleCode
   npm run stripe:sandbox
   ```

3. Merge Stripe vars into `C:\LittleCode-test\.env.local` (or run `scripts\write-test-env.ps1` after `.env.stripe-test.local` exists).
4. Rebuild and restart:

   ```powershell
   cd C:\LittleCode-test
   npm run build
   Stop-ScheduledTask -TaskName "LittleCode Test Next.js"
   Start-ScheduledTask -TaskName "LittleCode Test Next.js"
   ```

Test card: `4242 4242 4242 4242` ï¿½ any future expiry ï¿½ any CVC.

## Reset staging database (fresh empty DB + super admin)

Wipes **only** `C:\LittleCode-test\data\littlecode.sqlite` (never production). Backs up the current file to `C:\LittleCode-test\data\backups\`, runs migrations, seeds one super admin, updates `SUPERADMIN_*` in test `.env.local`, and restarts the Node task.

```powershell
powershell -ExecutionPolicy Bypass -File C:\LittleCode\scripts\reset-staging-db.ps1
```

The script prints the new super admin username and password. **Layer A** staging gate credentials (`STAGING_GATE_*`) are unchanged.

After a reset, create schools/families through normal signup flows or the super admin console at `/superadmin`.

### Clean Stripe test data after DB reset

Resetting staging SQLite (
eset-staging-db.ps1) does **not** remove Stripe test-mode customers, subscriptions, checkout sessions, or invoices. Orphaned objects can confuse billing tests (e.g. a After a reset, create schools/families through normal signup flows or the super admin console at `/superadmin`. trial invoice still visible in the [Stripe test dashboard](https://dashboard.stripe.com/test/invoices)).

Use **test mode only** (sk_test_... from C:\LittleCode-test\.env.local). Do **not** delete sandbox **products/prices** created by 
pm run stripe:sandbox.

After a wipe, typical cleanup (Dashboard or API):

| Object | Action |
|--------|--------|
| Open Checkout sessions | Expire (POST /v1/checkout/sessions/{id}/expire) |
| Active/trialing subscriptions | Cancel (DELETE /v1/subscriptions/{id}) |
| Customers with no DB row | Delete customer (removes payment methods; subscriptions must be canceled first) |
| Draft invoices | DELETE /v1/invoices/{id} |
| Open unpaid invoices | POST /v1/invoices/{id}/void |
| **Paid** invoices (including After a reset, create schools/families through normal signup flows or the super admin console at `/superadmin`. trial) | Cannot void/delete; harmless history ? ignore or filter in Dashboard |


## Refresh staging from production

Copies application code and refreshes the staging SQLite database via **online backup** (never a raw file copy while the app is running).

**Preserved during sync** (never overwritten from production):

| File | Why |
|------|-----|
| `C:\LittleCode-test\web.config` | Must proxy IIS to **127.0.0.1:3001**, not production port 3000. Restored from `scripts\web.config.test.xml` after every sync. |
| `C:\LittleCode-test\.env.local` | Staging URLs, Stripe test keys, `SQLITE_DATABASE_PATH`, gate password, etc. |
| `C:\LittleCode-test\.env.stripe-test.local` | Local Stripe sandbox output |

If staging misbehaves after a sync (redirect loops, wrong app), verify web.config:

```powershell
powershell -ExecutionPolicy Bypass -File C:\LittleCode\scripts\restore-test-webconfig.ps1
```

```powershell
powershell -ExecutionPolicy Bypass -File C:\LittleCode\scripts\sync-test-from-prod.ps1
cd C:\LittleCode-test
npm run build
Stop-ScheduledTask -TaskName "LittleCode Test Next.js"
Start-ScheduledTask -TaskName "LittleCode Test Next.js"
```

To refresh **code only** without copying production data, use `sync-test-from-prod.ps1` then run `reset-staging-db.ps1` instead of keeping the copied SQLite.

## Verify

```powershell
curl.exe -s https://test.quizzora.org/api/health
```

Expect `appBaseUrl` of `https://test.quizzora.org` and orange staging banner on the homepage.

If the gate is enabled, unauthenticated visits redirect to `/staging-gate`. After sign-in, the homepage loads as usual.

## Important

- Staging uses a **copy** of the production database ? changes on test do not affect production.
- After refreshing from prod, Stripe subscription IDs in the DB are **live** IDs; run checkout again on test to attach **test** Stripe subscriptions, or clear `stripe_*` columns for test schools in the test DB.
- Never put `sk_live_...` in `C:\LittleCode-test\.env.local`.

