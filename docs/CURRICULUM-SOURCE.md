# Curriculum source of truth

This document explains what Quizzora's curriculum data is based on, how it is used in quiz generation and Study Coach, and what we can honestly claim about Australian syllabus coverage.

## Hierarchy of sources

| Layer | Source | Role in Quizzora |
| --- | --- | --- |
| **National framework** | [ACARA v9 Australian Curriculum](https://v9.australiancurriculum.edu.au/) | Primary alignment for Years 7–10 topics and subtopics in Mathematics, English, Science, and Humanities |
| **Senior secondary (VCE)** | [VCAA study designs](https://www.vcaa.vic.edu.au/curriculum/vce/vce-study-designs/Pages/vce-study-designs.aspx) | Years 11–12 streams (e.g. Further Mathematics, English, Biology) where the app already references VCE |
| **In-app curated map** | `lib/curriculum-topics.js` | Topic → subtopic trees authored by Quizzora, cross-walked to ACARA content description codes or VCAA unit references where practical |
| **AI generation** | OpenAI via `lib/ai.js` and `lib/study-coach.js` | Produces quiz questions and coach walkthroughs *informed by* the selected subtopic path — not a verbatim copy of official documents |

## What is manually curated vs AI-inferred

### Manually curated (source of truth in code)

- **Topic and subtopic labels** in `lib/curriculum-topics.js` for Years 7–12, core subjects (Mathematics, English, Science, Humanities).
- **Optional `source` fields** on each topic row (e.g. `AC9M7N01–N09`, `VCAA Further Maths U3–4`) documenting the intended alignment.
- **Focus string format**: `{stream / }topic — subtopic` (see `FOCUS_SEPARATOR` in `lib/curriculum-topics.js`).
- **Legacy Year 7 sample quizzes** in `lib/curriculum.js` (`fallbackCurriculum`) used when AI is unavailable.

### AI-inferred at runtime

- Individual quiz questions, distractors, explanations, and optional diagrams.
- Study Coach intros, key ideas, formulas, step text, diagrams, and follow-up prompts.
- Wording of learning intentions on generated assignments.

The AI is **constrained** by the selected subtopic path injected into system prompts via `buildCurriculumPromptContext()`.

## Honest limits

Quizzora **does not** ship a complete, licensed export of ACARA or VCAA content descriptions. We therefore **cannot** claim:

- 100% syllabus coverage for every subject, year, and elective.
- Official endorsement by ACARA or the Victorian Curriculum and Assessment Authority.
- Bit-for-bit equivalence with any state's mandatory scope and sequence.

What we **can** claim:

- A **curated topic map aligned to ACARA v9 strands** (Years 7–10) and **VCE study design areas** (Years 11–12) for the four core subjects listed above.
- Teachers choose an explicit **topic → subtopic** path in the quiz builder; that path is stored on the assignment and passed to Study Coach.
- The design supports **traceability**: each topic row may cite an ACARA or VCAA reference code for audit and future verification work.

## How prompts use subtopics

### Quiz generation (`lib/ai.js`)

When a teacher creates a quiz, the API receives a `focus` string such as:

`VCE Further Mathematics / Recursion and financial modelling — Fibonacci and recurrence relations`

`buildOpenAiPrompt()` calls `buildCurriculumPromptContext()` which expands:

- Year level, subject, VCE stream (if any)
- Topic and subtopic focus
- Curriculum reference code (when present)
- Sibling subtopics in the same topic (for broader context without leaving the strand)

### Study Coach (`lib/study-coach.js`)

Assignment context from the database includes `focus`, `subject`, `yearLevel`, and `curriculumSummary`. The coach system prompt:

- Builds a **breadcrumb path** (year › subject › stream › topic › subtopic)
- Injects the same curriculum context block
- Requests structured JSON: `topicHeader`, `breadcrumbs`, `keyIdeas`, `formulas`, and step cards

The UI (`StudyCoachMessage.jsx`) renders these as lesson headers, chips, and formula panels — not plain chat bubbles alone.

## Proving coverage (roadmap)

Full verification against official syllabi would require either licensed ACARA APIs/exports or sustained manual cross-walking. Planned steps:

1. **Export matrix** — CSV/JSON mapping each subtopic to ACARA content description ID or VCAA key knowledge dot point (partial today via inline `source` fields).
2. **Coverage report script** — count subtopics per year/subject vs a reference checklist; flag gaps.
3. **Teacher feedback loop** — allow reporting misaligned generated content against a cited subtopic.
4. **State variants** — NSW, QLD, WA adaptations where they diverge from ACARA v9 naming.
5. **Electives expansion** — HPE, The Arts, Technologies using the same hierarchical pattern.

Until those steps are complete, treat Quizzora's curriculum layer as a **curated alignment aid**, not a compliance certificate.

## Key files

| File | Purpose |
| --- | --- |
| `lib/curriculum-topics.js` | Hierarchical topic/subtopic data and prompt helpers |
| `lib/curriculum.js` | Legacy fallback quizzes, validation, re-exports |
| `lib/ai.js` | Quiz prompt with curriculum context |
| `lib/study-coach.js` | Coach prompt with structured response schema |
| `components/QuizCreator.jsx` | Topic → subtopic picker |
| `components/StudyCoachMessage.jsx` | Structured lesson UI |

## References

- ACARA v9 curriculum portal: https://v9.australiancurriculum.edu.au/
- VCAA VCE study designs: https://www.vcaa.vic.edu.au/curriculum/vce/vce-study-designs/Pages/vce-study-designs.aspx
- Victorian Curriculum F–10 (superseded by ACARA v9 in Victoria but still relevant for context): https://victoriancurriculum.vcaa.vic.edu.au/
