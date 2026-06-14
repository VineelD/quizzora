# Subscriptions (Stripe)

Quizzora bills **per school**, not per user. Each new school or family gets a **7-day free trial** (configurable). A **card is required at signup** via Stripe Checkout; Stripe holds the card and **charges on day 7** unless the admin cancels anytime before then (Stripe Customer Portal).

## PCI / security notes (hosted Checkout)

Quizzora uses **Stripe-hosted Checkout** and **Stripe Customer Portal**. As a result, Quizzora does **not** store, process, or transmit raw cardholder data (PAN) for payments.

You still have PCI responsibilities (annual attestations/questionnaires, access control, logging hygiene, and vulnerability management of your own public-facing infrastructure). For the project-specific checklist, see `docs/PCI-COMPLIANCE.md`.

For broader Australia production readiness (privacy, breach response, accessibility), see `docs/AU-COMPLIANCE.md`.

## Stripe Dashboard setup

1. Create a [Stripe](https://stripe.com) account (Australia: enable AUD prices).
2. Sync Stripe via API and follow any Dashboard prompts (product name + legal operator name and ABN):

   ```bash
   node scripts/sync-stripe-business-profile.mjs
   ```

   This updates subscription **products**, the **Customer Portal** headline, and checkout copy from `lib/operator.js` (legal operator shown as e.g. `Mr Vineel Davuluri (ABN 41 833 153 799)`). Standard Stripe accounts must still set public business name, legal entity name, ABN/tax ID, statement descriptor, and invoice footer manually in **Settings → Business** when the script prints those steps.
3. **Products → Add product** “Quizzora”.
4. Add two recurring prices on that product:
   - **Monthly** — e.g. AUD $99 / month
   - **Yearly** — e.g. AUD $990 / year (~17% off vs 12× monthly)
5. Copy each **Price ID** (`price_...`) into `.env.local`.
6. **Developers → Webhooks → Add endpoint**
   - URL: `https://quizzora.org/api/billing/webhook`
   - Events: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `subscription_schedule.updated`, `subscription_schedule.completed`, `subscription_schedule.released`, `invoice.payment_failed`
7. Copy the **webhook signing secret** (`whsec_...`).

## Environment variables

```env
STRIPE_SECRET_KEY=replace-with-your-stripe-secret-key
STRIPE_WEBHOOK_SECRET=replace-with-your-webhook-signing-secret
STRIPE_PRICE_MONTHLY=replace-with-monthly-price-id
STRIPE_PRICE_YEARLY=replace-with-yearly-price-id

# Optional
BILLING_TRIAL_DAYS=7
BILLING_YEARLY_DISCOUNT_PERCENT=17
```

Use [Stripe test mode](https://docs.stripe.com/test-mode) keys on staging. Card: `4242 4242 4242 4242`.

## User flows

| Step | What happens |
|------|----------------|
| New school/family registered | Account created; admin/parent is redirected to **Stripe Checkout** (card required) |
| Checkout completed | Stripe subscription `trialing` for 7 days; card on file; webhook syncs `stripe_subscription_id` |
| Before checkout completes | `pendingCheckout` — no app access until Stripe setup finishes |
| During trial | Full trial limits; card held by Stripe; **no charge yet** |
| Cancel during trial | Stripe Customer Portal → subscription canceled → access ends; **no charge** |
| Day 7 (trial ends) | Stripe charges automatically → subscription becomes `active` |
| Trial ended without card / canceled | Teachers/students → `/subscription-required`; admin/parent → billing page |
| Re-subscribe after cancel | Stripe Checkout **without** a new trial — charged immediately |
| Plan change during trial (monthly ↔ yearly) | Schedules change via Stripe Subscription Schedule — **current plan until trial end**, then new plan price; no charge before trial end |
| Plan change while active | Schedules change at **current period end** — no immediate proration; new plan starts at renewal |
| Same plan re-subscribe | Blocked in API and UI — button disabled with “Current plan” |
| One subscription per tenant | Checkout blocked when an active/trialing subscription exists; plan changes update the existing subscription in place |
| Ongoing | **Manage payment method** opens Stripe Customer Portal (invoices, update card). **Auto-renewal** toggle on the billing page controls `cancel_at_period_end` on the Stripe subscription. |

Enable **cancellation** in Stripe Dashboard → **Settings → Billing → Customer portal** (optional — in-app auto-renew toggle is the primary MVP control).

## Auto-renewal

Admins and family parents can turn auto-renewal on or off from the billing page without opening the Customer Portal.

| Setting | Stripe | App behavior |
|---------|--------|--------------|
| Auto-renew **ON** (default) | `cancel_at_period_end: false` | Subscription renews at period end (or trial end for trialing) |
| Auto-renew **OFF** | `cancel_at_period_end: true` | Subscription stays active until current period/trial ends, then cancels |
| Turn back **ON** before period ends | `cancel_at_period_end: false` | Renewal resumes normally |

**API**

- School: `POST /api/billing/auto-renew` with `{ "autoRenew": true \| false }` (admin session)
- Family: `POST /api/billing/family/auto-renew` with `{ "autoRenew": true \| false }` (parent session)

Both call `stripe.subscriptions.update(id, { cancel_at_period_end: !autoRenew })` and sync the result to the database.

**UI** — `/admin/billing` and `/family/billing` show an **Auto-renewal** card with a toggle and status line:

- Auto-renew on → “Renews on [date]”
- Auto-renew off → “Cancels on [date]”

During trial, the date is `trial_ends_at` (first charge / cancellation date). While active, the date is `current_period_end`.

**Webhooks** — `customer.subscription.updated` and `customer.subscription.deleted` sync `cancel_at_period_end` via `applyStripeSubscriptionToSchool` / `applyStripeSubscriptionToFamily` (portal or dashboard changes stay in sync).

## Plan change implementation (Stripe API)

When an admin/parent clicks a different plan while already subscribed:

1. **API** (`POST /api/billing/checkout` or `/api/billing/family/checkout`) calls `subscribeOrChangePlan`, which schedules a plan change on the existing Stripe subscription instead of opening a new Checkout session when a changeable subscription exists.
2. **All plan switches** (trial or active) use a Stripe **Subscription Schedule** with two phases: phase 1 keeps the **current price** until renewal (`trial_end` for trialing, `current_period_end` for active); phase 2 applies the **new price** from that date with `proration_behavior: 'none'`.
3. The app **does not update `plan_interval` in the database** until Stripe applies phase 2 (via webhook). The API response includes `pendingPlanInterval` and `effectiveAt`.
4. **Duplicate plan** is rejected using the stored `plan_interval`, with fallback to the Stripe subscription item’s recurring interval when the DB value is missing.
5. **Second subscription prevention**: Checkout is blocked when status is `trialing`/`active`/`past_due` and a Stripe customer or subscription id exists; orphaned subscriptions are resolved via `stripe.subscriptions.list` before plan change.

## Yearly discount

The discount is **not calculated in code**. Set the yearly Stripe price lower than 12× monthly (e.g. 10 months’ price). The admin UI shows `BILLING_YEARLY_DISCOUNT_PERCENT` as marketing copy only.

## Staging site (test.quizzora.org)

For a full cloned environment with Stripe test mode, see **`docs/TEST-ENVIRONMENT.md`**.

## Stripe test sandbox (mirrors live plans)

Test mode is separate from live — use **test API keys** and **test price IDs**.

### One-time setup

1. Open [Stripe test API keys](https://dashboard.stripe.com/test/apikeys) and copy the **Secret key** (`sk_test_...`).
2. Run:

   ```powershell
   $env:STRIPE_TEST_SECRET_KEY='sk_test_...'
   npm run stripe:sandbox
   ```

   This creates (or reuses) test products and prices:

   | Plan | Amount |
   |------|--------|
   | School monthly | AUD $120 / month |
   | School yearly | AUD $1,200 / year |
   | Family monthly | AUD $30 / month |
   | Family yearly | AUD $300 / year |

3. The script writes `.env.stripe-test.local` with all `STRIPE_*` vars for test mode.
4. **Backup** live `STRIPE_*` lines in `.env.local`, then copy test vars from `.env.stripe-test.local`.
5. `npm run build` and restart the Quizzora Next.js scheduled task.
6. Test Checkout with card `4242 4242 4242 4242` (any future expiry, any CVC).
7. **Restore live keys** before accepting real payments.

### Stripe test mode — plan changes (for testers)

Use **test.quizzora.org** (or local with `sk_test_...` keys).

| Scenario | Expected behavior |
|----------|-------------------|
| New signup | Redirect to Stripe Checkout → 7-day trial → no charge until trial ends |
| During trial: switch monthly ↔ yearly | **No redirect** — change scheduled in-app; **stay on current plan until trial end**; first invoice at trial end uses the **new** plan price |
| During trial: click current plan | Button disabled (“Current plan”); API returns error if forced |
| Active paid: switch plans | Change scheduled at **period end** — no immediate proration |
| Active paid: click current plan | Blocked same as above |
| After cancel: subscribe again | New Checkout session; **no new trial**; charged when Checkout completes |

Verify in [Stripe test dashboard](https://dashboard.stripe.com/test/subscriptions): after a plan switch the subscription should have an attached **subscription schedule** with two phases; the subscription item keeps the **current price** until `trial_end` or `current_period_end`, then switches to the new price.

### Local webhook testing

```bash
stripe listen --forward-to localhost:3000/api/billing/webhook
```

Put the printed `whsec_...` in `.env.local` as `STRIPE_WEBHOOK_SECRET`.

For `https://quizzora.org` in test mode, the sandbox script can register a **test-mode** webhook to the same URL; use that endpoint’s signing secret (not the live `whsec_`).

## Database fields (`schools` / `families`)

- `trial_ends_at`, `subscription_status`, `plan_interval`
- `stripe_customer_id`, `stripe_subscription_id`, `current_period_end`
- `cancel_at_period_end` — synced from Stripe (`0` = auto-renew on, `1` = cancels at period end)
- `pending_plan_interval`, `pending_price_id`, `plan_change_at` — scheduled plan switch (cleared when Stripe applies phase 2)
- `billing_events` — webhook audit log

## Plan limits

Limits are enforced per **school** (not per teacher). Configure via environment variables; `0` means unlimited for that cap.

| Variable | Default (trial / paid) |
|----------|------------------------|
| `BILLING_TRIAL_MAX_TEACHERS` | 3 / — |
| `BILLING_TRIAL_MAX_STUDENTS` | 50 / — |
| `BILLING_TRIAL_MAX_AI_QUIZZES` | 15 / — |
| `BILLING_PAID_MAX_TEACHERS` | — / 25 |
| `BILLING_PAID_MAX_STUDENTS` | — / 2000 |
| `BILLING_PAID_MAX_AI_QUIZZES` | — / 0 (unlimited) |

AI quiz usage counts only OpenAI-generated quizzes (not Sudoku or quiz-bank reuse). Usage resets each UTC month in `school_monthly_usage`.

## Access control

- `requireSession()` blocks page access when `needsPayment` (admin → `/admin/billing`, others → `/subscription-required`).
- `requireApiSession()` checks active subscription and optional `feature` (`addStudent`, `addTeacher`, `ai`, `csvImport`, `csvExport`, `guardian`, `sudoku`). Returns **402** when a limit is hit.
- Admins see usage on `/admin/billing`; teachers see warnings on the dashboard. `GET /api/billing/status` returns the full subscription snapshot.

## Database fields (`school_monthly_usage`)

- `school_id`, `month_key` (e.g. `2026-06`), `ai_quiz_count`
