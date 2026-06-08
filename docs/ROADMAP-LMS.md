# Phase 2: LMS and roster integration

*Scaffold — not shipped. Closes adoption friction vs Education Perfect / Atomi.*

## Goal

Teachers should not maintain rosters in two places. Quizzora should accept class lists from school systems and keep them in sync with `classes`, `class_students`, and `users`.

## MVP path (recommended order)

### 1. Google Classroom CSV export/import (lowest lift)

**Why first:** No OAuth app review; many AU teachers already export rosters from Classroom.

| Step | Work |
| --- | --- |
| Export template | Document expected columns: `student_name`, `student_email`, `year_level`, `class_name` (optional). |
| Import API | Extend `/api/teacher/students/import` or add `/api/teacher/roster/import` with `source: "google_classroom_csv"`. |
| Matching | Match by email within school tenant; update display name/year level; add to class by name or create class. |
| Idempotency | Re-import updates existing students; never crosses `school_id`. |

**Existing code to reuse:** `importStudentsFromCsv` in `lib/db.js`, billing feature flag `csvImport`, `StudentManager` CSV UI.

### 2. Google Classroom API (OAuth)

| Requirement | Notes |
| --- | --- |
| Google Cloud project | OAuth consent screen, verified app for `classroom.rosters.readonly` + `classroom.courses.readonly`. |
| Per-teacher connect | Store refresh token encrypted per user (`user_integrations` table). |
| Sync job | Nightly or on-demand pull courses → map to `classes`; roster → `class_students`. |
| Conflict policy | Classroom is source of truth for roster; Quizzora keeps assignment/quiz data. |

**Schema sketch:**

```sql
CREATE TABLE user_integrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK(provider IN ('google_classroom', 'clever', 'csv')),
  external_account_id TEXT,
  access_token_enc TEXT,
  refresh_token_enc TEXT,
  token_expires_at TEXT,
  metadata_json TEXT,
  last_sync_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (user_id, provider)
);

CREATE TABLE integration_class_links (
  integration_id INTEGER NOT NULL REFERENCES user_integrations(id) ON DELETE CASCADE,
  external_class_id TEXT NOT NULL,
  class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  PRIMARY KEY (integration_id, external_class_id)
);
```

### 3. SSO (school-wide)

| Option | Fit |
| --- | --- |
| Google Workspace OIDC | Common in AU schools; map `hd` / email domain → `school_id`. |
| Microsoft Entra ID | Catholic / government clusters. |
| SAML 2.0 | Enterprise LMS bundles (Canvas, Blackboard) often need SAML first. |

**Not in scope for CSV phase.** SSO needs `school_domains` table, JIT provisioning, and admin mapping UI.

### 4. Clever / ClassLink (district roster)

District-wide adoption path. Requires Clever developer account, district IT approval, and secure sync of `schools`, `teachers`, `students`, `sections`.

## Security and tenancy

- All roster writes scoped to `session.user.school_id` (same as current teacher APIs).
- Never import a student email that belongs to another school's `users.school_id`.
- Audit: `roster.imported`, `integration.connected`, `integration.sync_completed`.
- Secrets: tokens in env-encrypted columns or platform secret store — not plain SQLite.

## Billing / feature flags

- Gate CSV import on existing `csvImport` plan feature (no Stripe schema changes).
- New `lmsSync` feature flag for OAuth/API sync on Standard+ when shipped.

## Open questions

1. Should family/homeschool tenants skip LMS entirely? **Yes** — family roster stays manual.
2. De-enrolment: remove `class_students` row or soft-archive? **Recommend soft flag** to preserve submission history.
3. Multi-teacher classes: one `classes.teacher_id` today — need co-teacher model before shared Classroom courses.

## Success criteria

- Teacher connects Classroom (or uploads CSV) once; class list matches within 5 minutes.
- Zero cross-tenant roster leaks in integration tests.
- No changes to Stripe products/prices for Phase 2 scaffold.
