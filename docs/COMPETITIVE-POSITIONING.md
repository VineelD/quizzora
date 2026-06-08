# Quizzora competitive positioning

*Based on shipped code in this repository (June 2026). Honest assessment — not marketing copy.*

---

## One-page comparison

| Dimension | **Quizzora** | **Education Perfect** | **Atomi** | **Mathspace** | **ChatGPT / Gemini** |
| --- | --- | --- | --- | --- | --- |
| **Curriculum fit (AU)** | Years 7–12 with ACARA v9 topic trees + VCE streams (Methods, Further, English, sciences, humanities). Curated map in `curriculum-topics.js`; AI constrained to selected subtopic. | Deep AU/NZ curriculum library; broad subject coverage; established school adoption. | Strong AU secondary alignment; video + quiz content mapped to syllabus. | Maths-first; strong AU curriculum mapping for Years 7–12 maths. | General knowledge; no native AU syllabus picker or ACARA/VCAA crosswalk. |
| **Teacher assign workflow** | Pick year → subject → topic → subtopic; async AI job; assign to year group; due dates; quiz bank reuse; Sudoku option. | Mature task assignment, class management, pre-built content library, analytics dashboards. | Lesson + quiz assignment from large content library; familiar teacher UX. | Adaptive maths sets; class codes; teacher dashboards focused on maths practice. | No class roster, due dates, or graded submission workflow without custom tooling. |
| **AI quiz generation** | OpenAI-generated MCQ/worded quizzes scoped to subtopic; difficulty (core/extension/mixed); 3–10 questions; async jobs with polling. | Limited native generative quiz; primarily human-authored content bank. | Some AI-assisted features; core value is curated video + question bank. | Adaptive question generation within maths domains; not general-purpose cross-subject. | Excellent at generating questions on demand; no assignment binding or school billing gates. |
| **Contextual coach** | **Study Coach**: assignment-tied, application-based walkthroughs, step diagrams, formula flash, mic input, situational narration, on-topic time gate before quiz unlock, cheat refusal. | EP Smart Lessons / feedback; not a free-form conversational coach tied to a specific teacher assignment. | Video explanations + quizzes; limited conversational tutoring per assigned task. | Step-by-step maths hints and handwriting recognition; maths-specific. | Powerful general tutor; no assignment scope, unlock gates, or classroom safety controls. |
| **Math rendering** | KaTeX via remark-math in Study Coach and explanations. | Built-in equation support across content. | Good for standard secondary maths notation. | **Best-in-class** — handwriting, graphing, step validation. | Good LaTeX rendering; inconsistent pedagogy and no quiz-integrity guardrails. |
| **Reporting** | Class dashboard (not started / in progress / submitted, average %); per-assignment report + CSV export; guardian email link; audit logs; usage meters. | Rich cohort analytics, progress over time, parent visibility, standards reporting. | Engagement and completion reporting; school admin dashboards. | Detailed maths mastery, skill gaps, time-on-task. | None for schools without building custom pipelines. |
| **Pricing model** | Open-source (AGPL); hosted quizzora.org funded by per-school or per-family subscription (hosting, AI, development); self-host without platform fee. | Per-student school licensing (enterprise-style). | Per-student school subscription. | Per-student maths subscription. | Consumer Plus/Pro; not FERPA/DPA-ready for schools as-is. |
| **Classroom safety** | Multi-tenant isolation (school/family join codes); staging gate; off-topic + cheat refusal in Study Coach; scoped coach context; security headers; no SSO attack surface yet. | Mature moderation, admin controls, established compliance posture. | Established school product with admin oversight. | School product with teacher visibility into student work. | No topic scope, no assessment integrity, no tenant isolation; data residency concerns for schools. |
| **Content library size** | **Small** — AI-generated per assignment + teacher quiz bank (reuse within school/family). No marketplace of pre-authored lessons. | **Very large** — thousands of lessons across subjects. | **Large** — video library + assessments. | **Large** for maths; narrow subject scope. | **Infinite** generated content; unvetted quality and alignment. |

---

## Honest strengths & weaknesses

### Quizzora

**Strengths**

- Only product in this set that combines **assignment-scoped AI quiz generation** with a **contextual Study Coach** (diagrams, math, mic, narration) and a **study-time unlock gate** before graded work.
- Purpose-built for **Australian secondary** (Year 7 → VCE) with explicit ACARA/VCAA references in curriculum data.
- **Family/homeschool** and **school** tenants on one platform; guardian progress links; billing enforcement per tenant.
- Assessment integrity: coach refuses quiz answers; off-topic chat does not count toward unlock.

**Weaknesses**

- Tiny content library vs EP/Atomi — every quiz is generated or reused, not browsed from a catalogue.
- Reporting is assignment-level, not longitudinal mastery analytics.
- No SSO, LMS, or roster sync (Google Classroom, Canvas, etc.).
- AI quiz quality varies; curriculum map is curated but not a licensed ACARA/VCAA export.

### Education Perfect

**Strengths:** Massive AU content library, school trust, comprehensive reporting, established teacher workflows.

**Weaknesses:** Limited generative AI quiz/coach per custom teacher assignment; less flexible for bespoke topic/subtopic alignment on demand.

### Atomi

**Strengths:** Engaging video + quiz combo; strong AU syllabus marketing; polished student experience.

**Weaknesses:** Not assignment-first generative AI; conversational coaching is not the core loop.

### Mathspace

**Strengths:** Best maths practice engine (adaptive, handwriting, step-by-step).

**Weaknesses:** Maths-only; no cross-subject Study Coach or humanities/science assignment builder.

### ChatGPT / Gemini

**Strengths:** Most capable general reasoning and explanation; instant, freeform help.

**Weaknesses:** No school workflow, no curriculum picker, no assessment safety, no class reporting — unsuitable as a classroom product without heavy wrapping.

---

## Open source and sustainable hosting

| Dimension | **Quizzora** | **Education Perfect / Atomi / Mathspace** |
| --- | --- | --- |
| **Source availability** | AGPL-3.0 open-source project; self-host on your infrastructure; public repo when published | Closed proprietary platforms |
| **Hosted pricing** | Per-school or per-family subscription funds hosting (Australia on-premises), OpenAI, and development — not a license fee for the code | Per-student enterprise licensing; no self-host option |
| **Data sovereignty** | Self-hosters choose location; quizzora.org keeps student data on operator premises in Australia | Vendor cloud; contracts vary |
| **Community leverage** | Schools and contributors can inspect coach/quiz logic, fix issues, and share AGPL improvements on network deployments | Feature requests via vendor roadmap only |

**Angle:** Quizzora competes on **transparency and control** — curriculum-scoped AI and Study Coach integrity you can verify — while closed incumbents compete on **catalogue size and brand trust**. Subscriptions sustain quizzora.org; they do not replace the right to run the stack yourself under AGPL. See [OPEN-SOURCE.md](./OPEN-SOURCE.md).

---

## Positioning

**One-liner:** *Quizzora is the Australian assignment-first learning platform where teachers generate curriculum-aligned quizzes and students must study the actual topic — with diagrams, math, and voice — before the graded quiz unlocks.*

**Open-source one-liner:** *AGPL-licensed ed-tech you can self-host or use on quizzora.org — subscriptions keep the hosted service sustainable, not the source locked away.*

**Teacher pitch:** Pick the exact Year 7–VCE subtopic, generate a quiz in minutes, assign to your class, and get integrity by design — Study Coach teaches the concept but won't give away answers.

**Student pitch:** Your coach knows your assignment topic, shows you how concepts apply in practice with visuals and worked examples, and unlocks the quiz when you've put in real study time.

**Parent pitch:** See assignment progress via email links; family plans let you assign the same curriculum-aligned quizzes at home without a school.

---

## Five prioritized roadmap items (from audit gaps)

| Priority | Item | Why it sharpens edge |
| --- | --- | --- |
| **1** | **Longitudinal reporting** — skill/topic mastery over time, not just per-assignment snapshots | EP/Atomi win on dashboards; Quizzora's coach+quiz data could surface "stuck topics" if aggregated. |
| **2** | **LMS / roster integration** (Google Classroom import, CSV SSO path, or Clever) | Removes adoption friction; teachers won't dual-enter rosters. |
| **3** | **Expanded content library** — seed quizzes per ACARA subtopic (human-reviewed) alongside AI gen | Reduces cold-start trust gap vs EP/Atomi; teachers can assign known-good content fast. |
| **4** | **Parent/guardian dashboard** (authenticated, not token-only) | Families and schools expect ongoing visibility; token links are a MVP. |
| **5** | **Standards mapping export** — per-assignment report showing ACARA/VCAA codes covered | Differentiates from generic AI tools; supports curriculum coordinators. |

---

## Shipped feature audit (codebase)

### Roles

| Role | Shipped | Notes |
| --- | --- | --- |
| Teacher | Yes | Quiz creation, roster, reports, quiz bank |
| Student | Yes | Study Coach, quiz submission, assignments |
| Family (parent) | Yes | Child accounts, billing, assignments at home |
| School admin | Yes | Teachers, join code, settings, billing, export |
| Superadmin | Yes | Cross-tenant schools/families/users |
| Support | Yes | Platform operator support console |

### Curriculum

- Years 7–12 (`lib/year-levels.js`)
- Subjects: Mathematics, English, Science, Humanities (+ VCE streams in Y11–12)
- VCE: Further Maths, Methods, English, English Language, Biology, Chemistry, Physics, Psychology, History, Geography, Legal Studies, Economics
- Topic → subtopic hierarchy with ACARA/VCAA `source` codes (`lib/curriculum-topics.js`)

### Assignment / quiz generation

- Async job queue (`quiz_generation_jobs`, polled from `QuizCreator`)
- Difficulty: mixed / core / extension
- Question types: multiple-choice, worded, mixed
- 3–10 questions per quiz
- Sudoku assignments (non-AI)
- Quiz bank reuse (`QuizBank`, `/api/teacher/quizzes/reuse`)
- Learning intentions + curriculum summary on generated quizzes

### Study Coach

- Assignment-scoped context (`lib/study.js`)
- Application-based portions and step walkthroughs
- Diagrams: AI images, Mermaid, recursion tree, number line, cell, etc.
- KaTeX math rendering
- Mic input (`useStudySpeechInput`)
- Situational narration (`useSituationalNarration`)
- On-topic time accumulation → quiz unlock (~30 min default)
- Cheat refusal and off-topic redirect (`lib/study-coach.js`, `lib/study-topic.js`)

### Billing / plans / limits

- School: trial + Standard (Stripe)
- Family: trial + Family (Stripe)
- Caps: teachers/parents, students, AI quizzes/month (`lib/plans.js`)
- Feature flags: AI gen, quiz reuse, Sudoku, CSV import/export, guardian links
- Webhook + portal + auto-renew; subscription-required enforcement

### Reporting / analytics

| Shipped | Missing |
| --- | --- |
| Class dashboard (status counts, average %) | Longitudinal mastery trends |
| Per-assignment teacher report | Cross-class cohort analytics |
| CSV export per assignment | Standards coverage reports |
| Guardian email progress (token) | Authenticated parent portal |
| Audit logs (admin) | Predictive "at risk" signals |
| AI usage meters | Study Coach engagement analytics for teachers |

### Trust / safety

- School/family tenant isolation via join codes
- Staging gate (`lib/staging-gate.js`, `middleware.js`)
- Off-topic detection; cheat pattern refusal
- Per-student per-assignment conversation isolation (tested)
- Security headers (CSP report-only, HSTS, etc.)
- Study message limits per assignment

### School features

| Shipped | Missing |
| --- | --- |
| Join codes (school + family) | SSO (Google, Microsoft) |
| CSV student import | LMS integrations |
| Guardian email links | SIS roster sync |
| Teacher roster CRUD | District multi-school admin (beyond superadmin) |
| Late submission setting | |

---

*See also: [OPEN-SOURCE.md](./OPEN-SOURCE.md), [CURRICULUM-SOURCE.md](./CURRICULUM-SOURCE.md), [BILLING.md](./BILLING.md).*
