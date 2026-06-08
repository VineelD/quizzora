import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildCoachPayload,
  enrichPayloadWithPortionStepMapping,
  getPortionDisplayContent,
  hasDiagramSteps,
  isDiagramCapableStep,
  mapPortionsToSteps,
  parseStoredMessagePayload,
  stripAsciiDiagramSections,
} from "../lib/study-message-payload.js";

test("mapPortionsToSteps maps portions to steps by index order", () => {
  const portions = [
    { id: "p1", content: "First idea." },
    { id: "p2", content: "Second idea." },
  ];
  const steps = [
    { id: "s1", text: "Frame 1", diagramPrompt: "Tree frame 1", imageUrl: "/api/quiz-media/1" },
    { id: "s2", text: "Frame 2", diagramPrompt: "Tree frame 2", imageUrl: "/api/quiz-media/2" },
  ];

  const mapping = mapPortionsToSteps(portions, steps);

  assert.equal(mapping.length, 2);
  assert.equal(mapping[0].stepIndex, 0);
  assert.equal(mapping[0].step?.id, "s1");
  assert.equal(mapping[1].stepIndex, 1);
  assert.equal(mapping[1].step?.id, "s2");
});

test("mapPortionsToSteps resolves explicit portion stepId", () => {
  const portions = [{ id: "p1", stepId: "s2", content: "See the second frame." }];
  const steps = [
    { id: "s1", text: "Frame 1", diagramPrompt: "Tree frame 1" },
    { id: "s2", text: "Frame 2", diagramPrompt: "Tree frame 2", imageUrl: "/api/quiz-media/2" },
  ];

  const mapping = mapPortionsToSteps(portions, steps);

  assert.equal(mapping[0].stepIndex, 1);
  assert.equal(mapping[0].step?.id, "s2");
});

test("hasDiagramSteps detects diagram metadata and image URLs", () => {
  assert.equal(hasDiagramSteps([]), false);
  assert.equal(hasDiagramSteps([{ text: "Plain text only." }]), false);
  assert.equal(hasDiagramSteps([{ text: "See this.", diagramPrompt: "Cell diagram" }]), true);
  assert.equal(hasDiagramSteps([{ text: "See this.", imageUrl: "/api/quiz-media/9" }]), true);
  assert.equal(hasDiagramSteps([{ text: "See this.", diagramType: "recursion_tree" }]), true);
});

test("integrated payload keeps portions, steps, and strips ASCII when image step exists", () => {
  const payload = buildCoachPayload({
    portions: [
      {
        id: "p1",
        label: "Base cases",
        content: "Start with $F_0 = 0$.\n\n### Diagram:\nF0 = 0 --> F1 = 1\n\n### Labels:\n- F0",
        narrationText: "Start with zero.",
      },
      {
        id: "p2",
        label: "Recurrence",
        content: "Each term adds the previous two.",
        narrationText: "Add the previous two terms.",
      },
    ],
    steps: [
      {
        id: "s1",
        text: "Frame 1",
        diagramPrompt: "Recursion tree frame 1",
        diagramTitle: "Fibonacci recursion",
        diagramCaption: "Follow the branches.",
        diagramLabels: ["n = 4"],
        diagramType: "recursion_tree",
        imageUrl: "/api/quiz-media/tree-1",
      },
      {
        id: "s2",
        text: "Frame 2",
        diagramPrompt: "Recursion tree frame 2",
        imageUrl: "/api/quiz-media/tree-2",
      },
    ],
  });

  assert.equal(payload.portions.length, 2);
  assert.equal(payload.steps.length, 2);
  assert.equal(payload.visualSequence, true);
  assert.equal(payload.portionStepMap.length, 2);
  assert.equal(payload.portionStepMap[0].step?.imageUrl, "/api/quiz-media/tree-1");
  assert.match(payload.portions[0].content, /\$F_0 = 0\$/);
  assert.doesNotMatch(payload.portions[0].content, /### Diagram:/);
  assert.doesNotMatch(payload.portions[0].content, /### Labels:/);
  assert.equal(isDiagramCapableStep(payload.portionStepMap[0].step), true);
});

test("portion-only payload has no diagram steps and unchanged content", () => {
  const payload = buildCoachPayload({
    portions: [
      { id: "p1", label: "Intro", content: "Hello portion.", narrationText: "Hello." },
      { id: "p2", label: "Next", content: "More detail.", narrationText: "More." },
    ],
  });

  assert.equal(payload.steps.length, 0);
  assert.equal(hasDiagramSteps(payload.steps), false);
  assert.equal(payload.portions[0].content, "Hello portion.");
  assert.equal(payload.portionStepMap[0].step, null);
});

test("step-only payload keeps visual sequence without portions", () => {
  const payload = buildCoachPayload({
    intro: "Let's begin.",
    steps: [
      { text: "A", diagramPrompt: "Frame 1", imageUrl: "/api/quiz-media/a" },
      { text: "B", diagramPrompt: "Frame 2", imageUrl: "/api/quiz-media/b" },
    ],
  });

  assert.equal(payload.portions.length, 0);
  assert.equal(payload.steps.length, 2);
  assert.equal(payload.visualSequence, true);
  assert.equal(hasDiagramSteps(payload.steps), true);
});

test("getPortionDisplayContent strips ASCII diagram artifacts", () => {
  const content = "### Diagram:\nA --> B\n\n### Labels:\n- A\n\nKeep this explanation.";
  const display = getPortionDisplayContent({ content }, { text: "Plain step." });

  assert.doesNotMatch(display, /### Diagram:/);
  assert.doesNotMatch(display, /A --> B/);
  assert.match(display, /Keep this explanation/);
});

test("stripAsciiDiagramSections removes diagram and label sections", () => {
  const stripped = stripAsciiDiagramSections(
    "Explain the idea.\n\n### Diagram:\nA --> B\n\n### Labels:\n- A",
  );

  assert.match(stripped, /Explain the idea/);
  assert.doesNotMatch(stripped, /### Diagram:/);
  assert.doesNotMatch(stripped, /### Labels:/);
});

test("parseStoredMessagePayload enriches stored portion and step payloads", () => {
  const payload = parseStoredMessagePayload({
    payload: {
      portions: [{ id: "p1", content: "### Diagram:\nA --> B\n\nExplain the branches.", narrationText: "Look." }],
      steps: [{ id: "s1", text: "Frame", diagramPrompt: "Tree", imageUrl: "/api/quiz-media/x" }],
      visualSequence: false,
    },
  });

  assert.equal(payload.portionStepMap[0].stepIndex, 0);
  assert.doesNotMatch(payload.portions[0].content, /### Diagram:/);
  assert.match(payload.portions[0].content, /Explain the branches/);
});

test("enrichPayloadWithPortionStepMapping preserves narration text on portions", () => {
  const enriched = enrichPayloadWithPortionStepMapping({
    portions: [
      {
        id: "p1",
        content: "### Diagram:\nA --> B",
        narrationText: "Look at the diagram.",
      },
    ],
    steps: [{ id: "s1", text: "Frame", diagramPrompt: "Tree", imageUrl: "/api/quiz-media/x" }],
  });

  assert.equal(enriched.portions[0].narrationText, "Look at the diagram.");
});
