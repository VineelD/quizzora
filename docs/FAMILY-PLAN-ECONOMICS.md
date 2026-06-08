# Family & school plan economics

Analysis for setting `BILLING_FAMILY_*`, `BILLING_SCHOOL_*`, and Study Coach caps profitably. Based on code in `lib/plans.js`, `lib/study.js`, `lib/study-progress.js`, `.env.example`, and AI paths in `lib/ai.js`, `lib/quiz-diagrams.js`, `lib/study-coach.js`.

**Do not treat this as financial advice** — it is an engineering cost model with stated assumptions.

## Current config (from codebase)

| Item | Source | Default |
|------|--------|---------|
| Family price | `docs/BILLING.md`, `.env.example` | **$30 AUD/month**, $300/year |
| School price | `docs/BILLING.md` (display env) | **$99 AUD/month**, $990/year (Stripe sandbox script uses $120 for test) |
| Family paid max students | `BILLING_FAMILY_PAID_MAX_STUDENTS` | **8** |
| Family paid max parents | `BILLING_FAMILY_PAID_MAX_PARENTS` | **4** |
| School paid max students | `BILLING_PAID_MAX_STUDENTS` | **2000** |
| Paid AI quizzes / month (family) | `BILLING_FAMILY_PAID_MAX_AI_QUIZZES` | **30** |
| Paid AI quizzes / month (school) | `BILLING_PAID_MAX_AI_QUIZZES` | **0** (unlimited) |
| Paid max questions / quiz (family) | `BILLING_FAMILY_PAID_MAX_QUESTIONS_PER_QUIZ` | **50** (absolute max 100 via `getMaxQuestionsPerQuizForPlan`) |
| Diagrams per quiz | `QUIZ_MAX_DIAGRAMS_PER_QUIZ` | **4** |
| Quiz text model | `OPENAI_MODEL` | **gpt-4.1-mini** |
| Study Coach model | `STUDY_COACH_MODEL` (else `OPENAI_MODEL`) | **gpt-4o-mini** |
| Coach output cap | `STUDY_COACH_MAX_OUTPUT_TOKENS` | 750 |
| Coach diagrams / reply | `STUDY_COACH_MAX_DIAGRAMS_PER_REPLY` | 1 |
| Coach messages (global fallback) | `STUDY_MAX_MESSAGES` | **80** in code; **60** in `.env.example` ship bundle |
| Coach messages (family tier) | `BILLING_FAMILY_STUDY_MAX_MESSAGES` | unset → falls back to `STUDY_MAX_MESSAGES` |
| Coach messages (school tier) | `BILLING_SCHOOL_STUDY_MAX_MESSAGES` | unset → falls back to `STUDY_MAX_MESSAGES` |
| Study unlock | `STUDY_UNLOCK_MIN_SECONDS` | 1800 s (30 min) |
| Monthly coach budget | — | **Not implemented** (no `STUDY_*` billing counter) |

Study Coach is **not** counted against `family_monthly_usage.ai_quiz_count` or `school_monthly_usage.ai_quiz_count` — only OpenAI-generated quizzes are (`lib/billing-enforcement.js`).

## How assignments multiply coach cost

Assignments are created **per class** (`quiz_assignments.class_id`). Every student enrolled in that class gets their own Study Coach session keyed by `(student_id, assignment_id)`.

- **Family:** siblings in the same year level share one class (`getOrCreateClassForYearLevel`) and therefore **one assignment row**, but each child has a **separate** message budget and progress row.
- **School:** a teacher assigns one quiz to a class; **each student** in the class gets an independent coach session.

**Critical formula** — coach AI cost for one shared assignment:

```
coach_cost_per_assignment ≈ N_students × avg_student_messages × cost_per_message
```

Where `N_students` is the count of enrolled students who use Study Coach on that assignment (not 1× per family/school).

Example: cap `STUDY_MAX_MESSAGES=60`, two siblings on the same assignment → up to **120 student messages** (2 × 60), not 60.

## Pricing assumptions (USD → AUD)

FX: **1 USD = 1.55 AUD** (adjust if needed).

| Component | USD rate | AUD equivalent |
|-----------|----------|----------------|
| gpt-4.1-mini input | $0.40 / 1M tokens | $0.62 / 1M |
| gpt-4.1-mini output | $1.60 / 1M tokens | $2.48 / 1M |
| gpt-4o-mini input | $0.15 / 1M tokens | $0.23 / 1M |
| gpt-4o-mini output | $0.60 / 1M tokens | $0.93 / 1M |
| Image (1024²) low | $0.005 / image | $0.0078 / image |
| Image medium | $0.011 / image | $0.017 / image |

Stripe (Australia): **2.9% + $0.30** per charge.

| Plan | Revenue | Stripe fee |
|------|---------|------------|
| Family monthly | $30 | ~$1.17 |
| School monthly | $99 | ~$3.17 |

## Per AI quiz — cost model

### Text (gpt-4.1-mini)

| Questions | Text cost (AUD) |
|-----------|-----------------|
| 15 | ~$0.017 |
| 30 | ~$0.034 |
| 50 | ~$0.057 |

### Images (up to 4 diagrams)

| Quality | 4 images + 15q text (AUD) |
|---------|---------------------------|
| low | **~$0.05** |
| medium (provider default) | **~$0.085** |

Planning default: **$0.05 AUD/quiz** (15 questions, 4 diagrams, `OPENAI_IMAGE_QUALITY=low`).

## Study Coach — per student, per assignment

Per student message (`gpt-4o-mini`):

| Profile | AUD / student message |
|---------|----------------------|
| Text-heavy (typical) | **~$0.0008** |
| Blended (~20% diagram replies) | **~$0.002** |
| Diagram-heavy tail | **~$0.009** |

Unlock needs ~**40** on-topic student messages at default timing (`STUDY_UNLOCK_MIN_SECONDS=1800`, `STUDY_MIN_SECONDS_PER_ON_TOPIC_MESSAGE=45`).

### Coach cost for one shared assignment

| N students | Typical (40 msg × $0.002) | Max cap (60 msg × $0.009) |
|------------|---------------------------|---------------------------|
| **2** (family) | **$0.16** | **$1.08** |
| **4** (family) | **$0.32** | **$2.16** |
| **8** (family max) | **$0.64** | **$4.32** |
| **25** (school class) | **$2.00** | **$13.50** |
| **30** (school class) | **$2.40** | **$16.20** |

## Business variables

Let:

- `R` = revenue (AUD)
- `S` = Stripe fee
- `H` = non-AI overhead as fraction of `R` (model uses **12%**)
- `Q` = AI quizzes generated per month
- `C_q` = AUD cost per quiz (~$0.05 baseline)
- `A` = coached assignments per month that hit `N` students each
- `N` = students per shared assignment
- `M_s` = avg student messages per assignment (typical ~40, heavy ~60)
- `C_m` = AUD cost per student message (~$0.002 typical, ~$0.009 heavy)

**Gross margin:**

```
coach_monthly ≈ A × N × M_s × C_m
margin = (R - S - H×R - Q×C_q - coach_monthly) / R
```

**Available AI budget** (before target margin), family example:

```
R - S - H×R = 30 - 1.17 - 3.60 = $25.23 AUD/month
```

## Family plan ($30 AUD) — margin tables

Assumptions unless noted: `H = 12%`, `Q = 30` AI quizzes at `$0.05`, **4 coached assignments/month** shared by all `N` active children, typical coach (`M_s = 40`, `C_m = $0.002`).

### Per-assignment coach (single shared quiz)

| N children | Coach cost (typical) | Coach cost (max 60 msg, heavy) |
|------------|----------------------|--------------------------------|
| 2 | $0.16 | $1.08 |
| 4 | $0.32 | $2.16 |
| 8 | $0.64 | $4.32 |

### Monthly gross margin — typical coach

Fixed costs: Stripe $1.17 + overhead $3.60 = **$4.77**. Quiz AI: 30 × $0.05 = **$1.50**.

| N children | Coach (4 × N × 40 × $0.002) | Total COGS | **Gross margin** |
|------------|----------------------------|------------|------------------|
| 2 | $0.64 | $6.91 | **~77%** |
| 4 | $1.28 | $7.55 | **~75%** |
| 8 | $2.56 | $8.83 | **~71%** |

### Monthly gross margin — heavy coach tail (60 msg, diagram-heavy)

Coach: `4 × N × 60 × $0.009`

| N children | Coach | Total COGS | **Gross margin** |
|------------|-------|------------|------------------|
| 2 | $4.32 | $10.59 | **~65%** |
| 4 | $8.64 | $14.91 | **~50%** |
| 8 | $17.28 | $23.55 | **~22%** |

The **N multiplier** is the dominant tail-risk on family plans. Two siblings on the same assignment doubles coach spend versus the old model that treated coach as flat per assignment.

### Monthly gross margin — recommended caps (45 msg/student, 4 assignments)

With `BILLING_FAMILY_STUDY_MAX_MESSAGES=45` and heavy `C_m = $0.009`:

| N children | Coach (4 × N × 45 × $0.009) | Total COGS | **Gross margin** |
|------------|----------------------------|------------|------------------|
| 2 | $3.24 | $9.51 | **~68%** |
| 4 | $6.48 | $12.75 | **~58%** |
| 8 | $12.96 | $19.23 | **~36%** |

Still tight at 8 children under heavy use — combine with **25 AI quizzes/month** or lower diagram rate (`STUDY_COACH_MAX_DIAGRAMS_PER_REPLY=1`, `OPENAI_IMAGE_QUALITY=low` on quiz side).

## School plan ($99 AUD) — class examples

School paid tier has **unlimited AI quizzes** (`BILLING_PAID_MAX_AI_QUIZZES=0`). Coach is the binding cost for coached assignments.

Fixed costs at $99: Stripe ~$3.17 + overhead ~$11.88 = **$15.05**.

### One shared assignment (single coached quiz to whole class)

| Class size | Coach (typical 40 msg) | Coach (max 60 msg heavy) |
|------------|------------------------|--------------------------|
| 25 | $2.00 | $13.50 |
| 30 | $2.40 | $16.20 |

### Ten coached assignments / month (same class)

| Class size | Coach typical | Coach heavy | Margin (heavy, quiz AI ~$0.50) |
|------------|---------------|-------------|--------------------------------|
| 25 | $20.00 | **$135.00** | **negative** |
| 30 | $24.00 | **$162.00** | **negative** |

Even typical coach (`$20–24`) leaves ~**65–70%** margin at $99 when quiz generation is moderate. **Heavy coach on large classes without per-student caps is not viable** at school pricing.

Recommended: `BILLING_SCHOOL_STUDY_MAX_MESSAGES=40` and treat coach as the school-tier control knob (not family-monthly AI quiz caps).

## Recommendations (env values — do not auto-apply to `.env.local`)

### Primary ship bundle (preserve ~70% family margin at 8 children, typical usage)

```env
# Quiz generation
BILLING_FAMILY_PAID_MAX_AI_QUIZZES=30
BILLING_FAMILY_PAID_MAX_QUESTIONS_PER_QUIZ=30
OPENAI_IMAGE_QUALITY=low

# Study Coach — per student per assignment (N multiplier applies)
STUDY_MAX_MESSAGES=60
BILLING_FAMILY_STUDY_MAX_MESSAGES=45
BILLING_SCHOOL_STUDY_MAX_MESSAGES=40
```

**Why 45 for family:** unlock needs ~40 on-topic messages; 45 gives a small buffer without allowing 60×N tail blow-ups.

**Why 40 for school:** same unlock math; limits worst-case class cost to `N × 40 × C_m` per assignment.

### If image quality stays at provider default (medium)

```env
BILLING_FAMILY_PAID_MAX_AI_QUIZZES=25
BILLING_FAMILY_PAID_MAX_QUESTIONS_PER_QUIZ=30
BILLING_FAMILY_STUDY_MAX_MESSAGES=40
```

### Optional future controls (not implemented)

| Knob | Purpose |
|------|---------|
| `BILLING_FAMILY_MAX_STUDY_MESSAGES_PER_MONTH` | Hard monthly coach budget per family (needs usage tracking in DB) |
| `BILLING_SCHOOL_MAX_STUDY_MESSAGES_PER_MONTH` | Same for school tenant |
| UI copy: “Up to **45 coach messages per child** per assignment” | Sets correct expectation vs flat “60 messages” |

Tier-specific caps are wired in `lib/plans.js` → `lib/study.js` via `getStudyMaxMessagesForTenantType()`.

### Supporting knobs (high leverage)

```env
STUDY_COACH_MAX_DIAGRAMS_PER_REPLY=1
STUDY_COACH_TTS_ENABLED=false
QUIZ_MAX_DIAGRAMS_PER_QUIZ=3
DIAGRAM_IMAGE_CACHE=true
```

## Quick reference — recommended caps summary

| Cap | Family | School | Rationale |
|-----|--------|--------|-----------|
| AI quizzes / month | **25–30** | unlimited (0) | Family quiz COGS bounded; school relies on coach caps |
| Questions / quiz | **30** | plan default | Predictable token cost |
| Coach messages / **student** / assignment | **45** | **40** | ~40 needed to unlock; N× multiplier |
| Global fallback | `STUDY_MAX_MESSAGES=60` | same | Used when tier env unset |

## Summary

1. Coach cost scales **`N_students × messages × cost_per_message`** — not once per assignment.
2. Family economics stay healthy at **8 children** under **typical** coach; **heavy** use at 60 msg × 8 children breaks margin without tier caps.
3. School economics require **`BILLING_SCHOOL_STUDY_MAX_MESSAGES`** (recommended **40**) because AI quiz count is unlimited and class sizes multiply coach spend.
4. No monthly coach billing counter exists today — per-student per-assignment caps are the straightforward control.
