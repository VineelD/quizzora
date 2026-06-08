# Yahoo Mail folders for Quizzora email

Cloudflare Email Routing forwards **all** `@quizzora.org` and `@staging.quizzora.org` mail to **one** destination inbox: **`vineel_2962@yahoo.com`**.

Yahoo cannot receive each address in a separate inbox without separate verified Cloudflare destinations (and Yahoo accounts). Instead, create **folders** and **filter rules** so mail is **moved** into the right folder as it arrives.

**Related:** [Staging email](./STAGING-EMAIL.md) (Cloudflare routing setup), [Production DNS & email](./DNS-QUIZZORA.md), [Test environment](./TEST-ENVIRONMENT.md).

---

## How it fits together

```text
sender → Cloudflare Email Routing (quizzora.org or staging.quizzora.org)
       → forwards everything to vineel_2962@yahoo.com
       → Yahoo filters move messages into folders
```

| Layer | What it does |
|-------|----------------|
| **Cloudflare** | Receives mail for `@quizzora.org` / `@staging.quizzora.org`; forwards to your Yahoo address |
| **Yahoo folders** | Organize mail visually (Production, Support, Staging) |
| **Yahoo filters** | Auto-move by **To**, **Cc**, or **Subject** |

---

## Part 1 — Create folders (Yahoo Mail web)

Do this once in [Yahoo Mail](https://mail.yahoo.com) (2024/2025 UI).

1. Sign in to **vineel_2962@yahoo.com**.
2. In the left sidebar, hover over **Folders** (or your folder list).
3. Click **+ New folder** (or the **⋮** menu next to Folders → **Create new folder**).
4. Create these three folders (names are suggestions — use what you prefer):

   | Folder name | Purpose |
   |-------------|---------|
   | **Quizzora-Production** | General production `@quizzora.org` mail (catch-all, noreply replies, etc.) |
   | **Quizzora-Support** | `support@quizzora.org` and human-facing production contact |
   | **Quizzora-Staging** | All `@staging.quizzora.org` mail (inbox, superadmin, catch-all) |

5. Confirm each folder appears in the left sidebar.

**Tip:** If you use the Yahoo mobile app, folders sync automatically after you create them on the web.

---

## Part 2 — Create filter rules (Yahoo Mail web)

Filters run when new mail arrives. **Order matters:** create **staging** and **specific** rules **before** the broad production catch-all.

### Open the Filters screen

1. Click the **Settings** (gear) icon → **More Settings**.
2. Select **Filters** in the left menu.
3. Click **Add new filters** (or **+ Add**).

For each rule below:

1. **Name** — use the name in the table (helps when editing later).
2. **Set rules** — add the condition(s) shown.
3. **Choose a folder to move to** — pick the target folder.
4. Click **Save**.

Yahoo’s filter builder labels may say **To/CC**, **contains**, or **includes** — they are equivalent for our purposes.

---

## Filter list (copy-paste reference)

Create rules **top to bottom** in this order.

| # | Filter name | Condition | Match value | Move to folder |
|---|-------------|-----------|-------------|----------------|
| 1 | Quizzora — staging catch-all | **To/CC** **contains** | `@staging.quizzora.org` | **Quizzora-Staging** |
| 2 | Quizzora — staging inbox | **To/CC** **contains** | `inbox@staging.quizzora.org` | **Quizzora-Staging** |
| 3 | Quizzora — staging superadmin | **To/CC** **contains** | `superadmin@staging.quizzora.org` | **Quizzora-Staging** |
| 4 | Quizzora — staging support | **To/CC** **contains** | `support@staging.quizzora.org` | **Quizzora-Staging** |
| 5 | Quizzora — production support | **To/CC** **contains** | `support@quizzora.org` | **Quizzora-Support** |
| 6 | Quizzora — production catch-all | **To/CC** **contains** | `@quizzora.org` | **Quizzora-Production** |

### Why this order?

- Rule **1** catches every staging address (including arbitrary `anything@staging.quizzora.org` from Cloudflare catch-all).
- Rules **2–4** are redundant with rule 1 but make filtering explicit and survive if you later disable the staging catch-all.
- Rule **5** pulls production support mail into **Quizzora-Support** even though rule 6 would also match `@quizzora.org`.
- Rule **6** catches remaining production addresses (`noreply@` bounces, future custom routes, production catch-all).

**Note:** Yahoo evaluates filters in list order. If a message matches rule 1, it goes to **Quizzora-Staging** and should not also need rule 6. Rule 6 must **not** run before rule 1, or staging mail could land in **Quizzora-Production**.

---

## Part 3 — Step-by-step for each filter (example)

Example for **Quizzora — production support** (row 5):

1. **Settings** → **More Settings** → **Filters** → **Add new filters**.
2. **Filter name:** `Quizzora — production support`
3. Click **Add** (or **+**) under rules.
4. First dropdown: **To/CC**
5. Second dropdown: **contains** (or **includes**)
6. Text field: `support@quizzora.org`
7. **Then move the message to:** **Quizzora-Support**
8. **Save**.

Repeat for rows 1–4 and 6, changing only the name, match value, and folder.

---

## Part 4 — Cloudflare side (already configured)

These Cloudflare routing rules forward to **`vineel_2962@yahoo.com`** (verify in Cloudflare → Email → Email Routing):

| Address / scope | Domain | Typical use |
|-----------------|--------|-------------|
| `support@quizzora.org` | `quizzora.org` | Production operator / contact ([DNS-QUIZZORA.md](./DNS-QUIZZORA.md)) |
| Catch-all `*@quizzora.org` (optional) | `quizzora.org` | Any other production local part |
| `inbox@staging.quizzora.org` | `staging.quizzora.org` | Staging operator inbox |
| `superadmin@staging.quizzora.org` | `staging.quizzora.org` | Staging super-admin account mail |
| `support@staging.quizzora.org` (optional) | `staging.quizzora.org` | Staging “contact us” |
| Catch-all `*@staging.quizzora.org` (optional) | `staging.quizzora.org` | QA / arbitrary staging addresses |

Outbound mail (`noreply@quizzora.org`, `noreply@staging.quizzora.org`) is sent via **Resend** and does not use these inbound routes.

To automate Cloudflare rules from this repo (requires API token in `.env.local`):

```powershell
cd C:\LittleCode
# Production support
node scripts/setup-cloudflare-email-routing.mjs

# Staging addresses (subdomain must be enabled in dashboard first)
node scripts/setup-cloudflare-email-routing.mjs --domain=staging.quizzora.org --local=inbox
node scripts/setup-cloudflare-email-routing.mjs --domain=staging.quizzora.org --local=superadmin
node scripts/setup-cloudflare-email-routing.mjs --domain=staging.quizzora.org --local=support
node scripts/setup-cloudflare-email-routing.mjs --domain=staging.quizzora.org --catch-all
```

See [STAGING-EMAIL.md](./STAGING-EMAIL.md) Part 3 for `.env.local` variables (`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ZONE_ID`, `EMAIL_FORWARD_TO`).

---

## Part 5 — Verification

1. **Cloudflare:** Destination **vineel_2962@yahoo.com** shows **Verified** under Email Routing → Destination addresses.
2. **Production test:** Send an email to `support@quizzora.org` from an external account → arrives in Yahoo → lands in **Quizzora-Support** (or Inbox briefly, then moved by filter).
3. **Staging test:** Send to `inbox@staging.quizzora.org` → lands in **Quizzora-Staging**.
4. **Catch-all test (if enabled):** Send to `random-test@staging.quizzora.org` → **Quizzora-Staging**.

Filters apply to **new** mail. Existing Inbox messages are not moved retroactively unless you run a manual search and move them.

---

## Optional tweaks

| Goal | Change |
|------|--------|
| Keep support in Production folder too | Skip rule 5; rely on rule 6 only |
| Separate superadmin from staging inbox | Add subfolders under **Quizzora-Staging** and split rules 2 vs 3 |
| Highlight urgent support | Add a second action (if available): mark as **Starred** on rule 5 |
| Reduce duplicate staging rules | Keep only rule 1 (staging catch-all) if Cloudflare catch-all is always on |

---

## Checklist

- [ ] Folders **Quizzora-Production**, **Quizzora-Support**, **Quizzora-Staging** created
- [ ] Six Yahoo filters created in order (table above)
- [ ] Cloudflare destination verified for `vineel_2962@yahoo.com`
- [ ] Test send to `support@quizzora.org` → **Quizzora-Support**
- [ ] Test send to `inbox@staging.quizzora.org` → **Quizzora-Staging**
