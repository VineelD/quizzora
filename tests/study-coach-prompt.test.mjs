import assert from "node:assert/strict";
import { test } from "node:test";
import { buildStudyCoachSystemPrompt } from "../lib/study-coach.js";

const baseContext = {
  yearLevel: "Year 7",
  subject: "Science",
  focus: "Cells › Animal cells",
  curriculumSummary: "Understand cell structures.",
  learningIntentions: ["Identify organelles"],
};

test("buildStudyCoachSystemPrompt uses application-based tutor guidance", () => {
  const prompt = buildStudyCoachSystemPrompt(baseContext);
  assert.match(prompt, /real-world application/i);
  assert.match(prompt, /Here's how this works in practice/i);
  assert.match(prompt, /1–3 punchy portions/i);
  assert.match(prompt, /ONE compelling hero visual/i);
  assert.match(prompt, /Flash card illustration/i);
  assert.doesNotMatch(prompt, /2–4 steps where each frame BUILDS/i);
});

test("buildStudyCoachSystemPrompt keeps curriculum guardrails", () => {
  const prompt = buildStudyCoachSystemPrompt(baseContext);
  assert.match(prompt, /Year 7/);
  assert.match(prompt, /Science/);
  assert.match(prompt, /Never reveal/i);
  assert.match(prompt, /Never use ASCII diagram art/i);
});

test("buildStudyCoachSystemPrompt requires delimited math and formulas array", () => {
  const prompt = buildStudyCoachSystemPrompt(baseContext);
  assert.match(prompt, /Wrap ALL math in \$\.{3}\$ inline or \$\$\.{3}\$\$ display/i);
  assert.match(prompt, /NEVER emit raw \\frac/i);
  assert.match(prompt, /formulas\[\]/);
  assert.match(prompt, /diagramSpec, diagramMermaid, or diagramPrompt/i);
  assert.match(prompt, /Never put diagram content in portion markdown/i);
});

test("buildStudyCoachSystemPrompt lists explicit off-topic categories", () => {
  const prompt = buildStudyCoachSystemPrompt(baseContext);
  assert.match(prompt, /Politics, elections, partisan topics/i);
  assert.match(prompt, /Religion debates/i);
  assert.match(prompt, /adult\/sexual content/i);
  assert.match(prompt, /I focus on this assignment's topics/i);
});

test("buildStudyCoachSystemPrompt scopes multi-subtopic assignments to one concept", () => {
  const prompt = buildStudyCoachSystemPrompt(
    {
      ...baseContext,
      focus: "Topic A — Sub 1; Topic B — Sub 2 (+23 more)",
      selectedSubtopics: Array.from({ length: 25 }, (_, index) => `Sub ${index + 1}`),
    },
    { studentTopic: { displayLabel: "Mitochondria", label: "Mitochondria" } },
  );

  assert.match(prompt, /Do NOT list every subtopic/i);
  assert.match(prompt, /Mitochondria/);
  assert.match(prompt, /ONE concept at a time/i);
});
