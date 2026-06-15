import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildCoachPayload,
  coachPayloadHasRenderableBody,
  extractCoachJsonObject,
  hasVisualSequence,
  normalizeCoachPortions,
  normalizeStudyMessage,
  parseStoredMessagePayload,
  stepsToPlainText,
} from "../lib/study-message-payload.js";
import { resolveDiagramRenderMode } from "../lib/study-diagram-render.js";

test("coach payload normalizes structured lesson fields", () => {
  const payload = buildCoachPayload({
    topicHeader: "Fibonacci sequences",
    breadcrumbs: ["Year 12", "Mathematics", "Fibonacci"],
    keyIdeas: ["Start values", "Recurrence relation"],
    formulas: [{ label: "Fibonacci", expression: "F_n = F_{n-1} + F_{n-2}" }],
    steps: [{ text: "Define the first two terms." }],
  });

  assert.equal(payload.topicHeader, "Fibonacci sequences");
  assert.equal(payload.keyIdeas.length, 2);
  assert.equal(payload.formulas[0].label, "Fibonacci");
  assert.equal(payload.breadcrumbs[0], "Year 12");
});

test("coach payload normalizes multi-step replies", () => {
  const payload = buildCoachPayload({
    intro: "Let's begin.",
    steps: [
      {
        title: "Step 1",
        text: "First idea.",
        diagramPrompt: "Cell diagram",
        callouts: [{ label: "Nucleus", detail: "Control centre" }],
      },
      { title: "Step 2", text: "Second idea." },
    ],
    followUps: ["Next question"],
  });

  assert.equal(payload.steps.length, 2);
  assert.equal(payload.steps[0].diagramPrompt, "Cell diagram");
  assert.equal(payload.steps[0].callouts[0].label, "Nucleus");
  assert.equal(payload.steps[0].audioUrl, "");
  assert.match(stepsToPlainText(payload), /First idea/);
});

test("coach payload preserves narration fields", () => {
  const payload = buildCoachPayload({
    intro: "Welcome.",
    introAudioUrl: "/api/quiz-media/42",
    steps: [{ text: "Listen here.", audioUrl: "/api/quiz-media/43", narrationText: "Listen here." }],
  });

  assert.equal(payload.introAudioUrl, "/api/quiz-media/42");
  assert.equal(payload.steps[0].audioUrl, "/api/quiz-media/43");
  assert.equal(payload.steps[0].narrationText, "Listen here.");
});

test("visual sequence is detected when multiple diagram frames exist", () => {
  const payload = buildCoachPayload({
    steps: [
      { text: "A", diagramPrompt: "Frame 1" },
      { text: "B", diagramPrompt: "Frame 2" },
    ],
  });
  assert.equal(payload.visualSequence, true);
  assert.equal(hasVisualSequence(payload.steps), true);
});

test("coach payload normalizes portion walkthrough fields", () => {
  const payload = buildCoachPayload({
    portions: [
      {
        id: "p1",
        label: "Fibonacci definition",
        content: "$F_0 = 0$ and $F_1 = 1$.",
        narrationText: "Fibonacci starts with zero and one.",
        startOffset: 0,
        endOffset: 24,
      },
      {
        id: "p2",
        label: "Recurrence",
        content: "$F_n = F_{n-1} + F_{n-2}$ for $n \\geq 2$.",
        narrationText: "Each later term adds the two before it.",
      },
    ],
  });

  assert.equal(payload.portions.length, 2);
  assert.equal(payload.portions[0].label, "Fibonacci definition");
  assert.equal(payload.portions[0].narrationText, "Fibonacci starts with zero and one.");
  assert.equal(payload.portions[0].startOffset, 0);
  assert.equal(payload.portions[0].endOffset, 24);
  assert.match(stepsToPlainText(payload), /Fibonacci definition/);
  assert.match(stepsToPlainText(payload), /Recurrence/);
});

test("normalizeCoachPortions assigns offsets when omitted", () => {
  const portions = normalizeCoachPortions([
    { content: "First portion.", narrationText: "First." },
    { content: "Second portion.", narrationText: "Second." },
  ]);

  assert.equal(portions[0].startOffset, 0);
  assert.equal(portions[0].endOffset, portions[0].content.length);
  assert.equal(portions[1].startOffset, portions[0].endOffset);
});

test("coach payload wraps raw frac in portion content", () => {
  const payload = buildCoachPayload({
    portions: [{ content: "The probability is \\frac{1}{2} for each outcome." }],
  });

  assert.match(payload.portions[0].content, /\$\\frac\{1\}\{2\}\$/);
});

test("coach payload merges orphan formula lines into formulas array", () => {
  const payload = buildCoachPayload({
    portions: [{ content: "\\frac{1}{2}" }],
  });

  assert.equal(payload.portions.length, 0);
  assert.equal(payload.formulas.length, 1);
  assert.match(payload.formulas[0].expression, /\\frac\{1\}\{2\}/);
});

test("coach payload strips ascii diagram sections from portions", () => {
  const payload = buildCoachPayload({
    portions: [
      {
        content: `### Diagram:
F0 --> F1

The recurrence is $F_n = F_{n-1} + F_{n-2}$.`,
      },
    ],
    steps: [{ diagramType: "recursion_tree", diagramSpec: { diagramType: "recursion_tree", root: 4, depth: 3 } }],
  });

  assert.doesNotMatch(payload.portions[0].content, /### Diagram:/);
  assert.doesNotMatch(payload.portions[0].content, /F0 --> F1/);
  assert.match(payload.portions[0].content, /\$F_n = F_\{n-1\} \+ F_\{n-2\}\$/);
});

test("stored message payload parses portion payloads", () => {
  const payload = parseStoredMessagePayload({
    payload: {
      portions: [{ id: "p1", label: "Intro", content: "Hello portion.", narrationText: "Hello." }],
      steps: [],
    },
  });

  assert.equal(payload.portions.length, 1);
  assert.equal(payload.portions[0].content, "Hello portion.");
});

test("coach payload normalizes diagram metadata on steps", () => {
  const payload = buildCoachPayload({
    steps: [
      {
        text: "See the recursion tree.",
        diagramPrompt: "Frame 1 of 2: recursion tree for fib(4)",
        diagramTitle: "Fibonacci recursion",
        diagramCaption: "Follow the branches down to the base cases.",
        diagramLabels: ["n = 4", "n = 3", "n = 2"],
        diagramType: "recursion_tree",
        diagramSummary: "Shows how fib(4) splits into smaller subproblems.",
      },
    ],
  });

  assert.equal(payload.steps[0].diagramTitle, "Fibonacci recursion");
  assert.equal(payload.steps[0].diagramType, "recursion_tree");
  assert.equal(payload.steps[0].diagramLabels.length, 3);
  assert.equal(payload.steps[0].diagram.caption, "Follow the branches down to the base cases.");
});

test("coach payload normalizes diagramSpec and diagramMermaid on steps", () => {
  const payload = buildCoachPayload({
    steps: [
      {
        text: "See the recursion tree.",
        diagramType: "recursion_tree",
        diagramSpec: { diagramType: "recursion_tree", root: 4, depth: 3, labels: ["fib(4)"] },
      },
      {
        text: "Follow the process.",
        diagramType: "flowchart",
        diagramMermaid: "flowchart TD\nA-->B",
      },
    ],
  });

  assert.equal(payload.steps[0].diagramSpec.diagramType, "recursion_tree");
  assert.equal(payload.steps[0].diagramSpec.root, 4);
  assert.match(payload.steps[1].diagramMermaid, /flowchart TD/);
  assert.equal(resolveDiagramRenderMode(payload.steps[0]), "spec");
  assert.equal(resolveDiagramRenderMode(payload.steps[1]), "mermaid");
});

test("stored message payload falls back to plain content", () => {
  const payload = parseStoredMessagePayload({ content: "Plain coach reply." });
  assert.equal(payload.steps.length, 1);
  assert.equal(payload.steps[0].text, "Plain coach reply.");
});

test("stored message payload parses coach JSON from content when payloadJson is missing", () => {
  const coachJson = {
    topicHeader: "Cell structure",
    keyIdeas: ["Organelles have roles"],
    portions: [
      { id: "p1", label: "Concept in action", content: "Notice the nucleus first." },
      { id: "p2", label: "Your turn", content: "Explain the cell wall in one sentence." },
    ],
    steps: [{ title: "Hero visual", text: "", diagramPrompt: "Cell diagram" }],
  };

  const payload = parseStoredMessagePayload({
    content: JSON.stringify(coachJson),
    payloadJson: null,
  });

  assert.equal(payload.portions.length, 2);
  assert.equal(payload.portions[0].label, "Concept in action");
  assert.match(payload.portions[0].content, /nucleus/);
  assert.equal(payload.steps.length, 1);
});

test("normalizeStudyMessage replaces raw JSON content when only formulas are present", () => {
  const coachJson = {
    topicHeader: "Energy",
    formulas: [{ label: "Mass-energy", expression: "$E=mc^2$" }],
    keyIdeas: ["Mass and energy are equivalent"],
    portions: [],
    steps: [],
  };
  const raw = JSON.stringify(coachJson);

  const normalized = normalizeStudyMessage({
    id: 7,
    role: "assistant",
    content: raw,
    payloadJson: raw,
  });

  assert.doesNotMatch(normalized.content, /^\{/);
  assert.equal(normalized.payload?.formulas.length, 1);
  assert.equal(normalized.payload?.keyIdeas.length, 1);
});

test("stored message payload parses reply-only Onyx JSON from content", () => {
  const payload = parseStoredMessagePayload({
    content: JSON.stringify({
      reply: "Friction opposes motion between surfaces.",
      onTopic: true,
      followUps: ["What affects friction?"],
    }),
    payloadJson: null,
  });

  assert.match(stepsToPlainText(payload), /Friction opposes motion/);
  assert.ok(payload.steps.length >= 1 || payload.portions.length >= 1);
});

test("repairCoachJsonText fixes LaTeX backslashes inside JSON strings", async () => {
  const { extractCoachJsonObject } = await import("../lib/study-message-payload.js");
  const broken = `{"intro":"ok","formulas":[{"expression":"$a + b = c \\quad \\text{where } a > 0$"}],"portions":[{"id":"p1","content":"$-8 + 5$"}]}`;
  assert.throws(() => JSON.parse(broken));
  const parsed = extractCoachJsonObject(broken);
  assert.ok(parsed);
  assert.match(parsed.formulas[0].expression, /\\quad/);
});

test("extractCoachJsonObject strips markdown fences before parsing", () => {
  const inner = {
    intro: "Hook",
    portions: [{ id: "p1", label: "Concept", content: "Main idea." }],
  };
  const parsed = extractCoachJsonObject("```json\n" + JSON.stringify(inner) + "\n```");
  assert.equal(parsed?.portions?.length, 1);
});

test("coachPayloadHasRenderableBody detects formulas without steps", () => {
  assert.equal(
    coachPayloadHasRenderableBody({
      formulas: [{ label: "Rule", expression: "$F=ma$" }],
      keyIdeas: ["Force"],
      portions: [],
      steps: [],
    }),
    true,
  );
});

test("normalizeStudyMessage attaches payload and plain content for DB-shaped first replies", () => {
  const coachJson = {
    portions: [{ id: "p1", label: "Warm-up", content: "Start with the main idea." }],
    steps: [],
  };
  const raw = JSON.stringify(coachJson);

  const normalized = normalizeStudyMessage({
    id: 42,
    role: "assistant",
    content: raw,
    payloadJson: null,
  });

  assert.ok(normalized.payload);
  assert.equal(normalized.payload.portions.length, 1);
  assert.equal(normalized.content, "Warm-up: Start with the main idea.");
  assert.doesNotMatch(normalized.content, /^\{/);
});
