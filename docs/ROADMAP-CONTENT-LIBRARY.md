# Phase 2: Seeded ACARA quiz library

*Scaffold — not shipped. Reduces cold-start trust gap vs Education Perfect / Atomi.*

## Goal

Teachers can assign **human-reviewed**, curriculum-tagged quizzes per ACARA subtopic without waiting for AI generation — alongside existing AI gen and personal quiz bank reuse.

## Current state (Phase 1)

| Asset | Location |
| --- | --- |
| Topic/subtopic hierarchy | `lib/curriculum-topics.js` (`CURRICULUM_HIERARCHY`) |
| Teacher quiz bank | `quizzes` table, `teacher_id` scoped, reuse via `assignExistingQuiz` |
| AI generation | Async jobs, subtopic-constrained prompts |

There is **no** platform-wide seeded content table today.

## Proposed data model

### Option A — dedicated seeded bank (preferred)

```sql
CREATE TABLE quiz_bank_seeded (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  subject TEXT NOT NULL,
  year_level TEXT NOT NULL,
  topic TEXT NOT NULL,
  subtopic TEXT NOT NULL,
  acara_codes TEXT,
  difficulty TEXT NOT NULL CHECK(difficulty IN ('core', 'extension', 'mixed')),
  curriculum_summary TEXT NOT NULL,
  learning_intentions_json TEXT NOT NULL,
  questions_json TEXT NOT NULL,
  review_status TEXT NOT NULL DEFAULT 'draft'
    CHECK(review_status IN ('draft', 'reviewed', 'published', 'retired')),
  reviewed_by_user_id INTEGER REFERENCES users(id),
  reviewed_at TEXT,
  published_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX quiz_bank_seeded_lookup_idx
  ON quiz_bank_seeded(year_level, subject, topic, subtopic, review_status);
```

Copy-on-assign: when a teacher assigns a seeded quiz, insert into `quizzes` with `source = 'Seeded library'` and `teacher_id` set — same pattern as AI gen output. Preserves teacher ownership and allows local edits without mutating the canonical seed.

### Option B — flag on existing quizzes

Add `quizzes.is_seeded INTEGER NOT NULL DEFAULT 0` and `quizzes.seed_slug TEXT` for platform operator–authored rows with `teacher_id` NULL or a system user.

**Downside:** mixes tenant-owned and platform content in one table; complicates reuse permissions.

## Content pipeline

1. **Authoring** — JSON or internal admin UI; one quiz per subtopic minimum for pilot subjects (Year 7 Maths + Science).
2. **Review** — second educator sign-off; `review_status = published` only after review.
3. **Versioning** — `slug` stable; breaking question fixes bump slug suffix (`-v2`) rather than in-place edit of assigned copies.
4. **Import** — batch script from `content/seeds/*.json` keyed by `formatFocusLabel` topic/subtopic.

## Teacher UX (Phase 2)

- New panel on educator console: **Curriculum library** — browse Year → Subject → Topic → Subtopic.
- Preview questions (no answers in student view).
- Actions: **Assign to class** (copies to teacher quiz + assignment), **Add to my bank** (copy only).
- Badge: "ACARA reviewed" when `acara_codes` present.

## API sketch

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/api/teacher/library/quizzes?yearLevel&subject&topic` | List published seeds |
| GET | `/api/teacher/library/quizzes/[slug]` | Preview metadata + questions |
| POST | `/api/teacher/library/quizzes/[slug]/assign` | Copy + assign (respect `quizReuse` / new `seededLibrary` flag) |

## Alignment with curriculum map

Seed records should use the same focus label format as AI quizzes:

```
{topicKey(entry)} — {subtopic}
```

See `formatFocusLabel` / `parseFocusLabel` in `lib/curriculum-topics.js` so longitudinal reporting (`lib/teacher-reporting.js`) groups seeded and AI quizzes consistently.

## Billing / limits

- Assigning seeded quizzes should **not** count against `aiQuizzesPerMonth` (no OpenAI call).
- Optional plan flag `seededLibrary: true` on Standard+ when catalogue is large enough to differentiate tiers.

## Quality bar for pilot

| Criterion | Target |
| --- | --- |
| Coverage | ≥1 published quiz per Year 7 Maths subtopic (pilot) |
| Question count | 5–8 MCQ/worded per quiz |
| Review | 100% `review_status = published` before teacher visibility |
| ACARA | `acara_codes` from `entry().source` in curriculum map |

## Out of scope (Phase 2)

- Video lessons (Atomi-style)
- Student-facing browse without teacher assignment
- Marketplace / UGC from teachers

## Success criteria

- Teacher assigns a seeded Year 7 quiz in &lt; 30 seconds without AI wait.
- Mastery trends report includes seeded and AI quizzes under the same topic/subtopic keys.
- No Stripe or subscription schema changes required for scaffold.
