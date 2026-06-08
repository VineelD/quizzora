import assert from "node:assert/strict";
import { test } from "node:test";
import {
  contentHasMermaidFence,
  isMermaidFenceLanguage,
  normalizeDiagramSpec,
  preferAiDiagramForStep,
  resolveDiagramRenderMode,
  shouldSkipImageGeneration,
} from "../lib/study-diagram-render.js";

test("isMermaidFenceLanguage detects mermaid code fences", () => {
  assert.equal(isMermaidFenceLanguage("mermaid"), true);
  assert.equal(isMermaidFenceLanguage("Mermaid"), true);
  assert.equal(isMermaidFenceLanguage("javascript"), false);
});

test("contentHasMermaidFence detects fenced mermaid blocks in markdown", () => {
  assert.equal(contentHasMermaidFence("Here is a flow:\n```mermaid\nflowchart TD\nA-->B\n```"), true);
  assert.equal(contentHasMermaidFence("Plain text only"), false);
});

test("normalizeDiagramSpec validates recursion tree specs", () => {
  const spec = normalizeDiagramSpec({
    diagramType: "recursion_tree",
    root: 4,
    depth: 3,
    labels: ["fib(4)", "fib(3)"],
  });

  assert.equal(spec.diagramType, "recursion_tree");
  assert.equal(spec.root, 4);
  assert.equal(spec.depth, 3);
  assert.equal(spec.labels.length, 2);
  assert.equal(normalizeDiagramSpec({ diagramType: "recursion_tree", root: "x", depth: 2 }), null);
});

test("normalizeDiagramSpec validates number line specs", () => {
  const spec = normalizeDiagramSpec({
    diagramType: "number_line",
    min: -2,
    max: 6,
    points: [0, 3],
    intervals: [{ from: 1, to: 5, label: "solution" }],
  });

  assert.equal(spec.diagramType, "number_line");
  assert.equal(spec.min, -2);
  assert.equal(spec.max, 6);
  assert.equal(spec.points.length, 2);
  assert.equal(spec.intervals[0].label, "solution");
});

test("resolveDiagramRenderMode routes spec, mermaid, and image diagrams", () => {
  assert.equal(
    resolveDiagramRenderMode({
      diagramType: "recursion_tree",
      diagramSpec: { diagramType: "recursion_tree", root: 4, depth: 3 },
    }),
    "spec",
  );

  assert.equal(
    resolveDiagramRenderMode({
      diagramType: "flowchart",
      diagramMermaid: "flowchart TD\nA-->B",
    }),
    "mermaid",
  );

  assert.equal(
    resolveDiagramRenderMode({
      diagramType: "cell_diagram",
      diagramPrompt: "Labelled animal cell",
    }),
    "image",
  );

  assert.equal(resolveDiagramRenderMode({ text: "No diagram" }), "none");
});

test("shouldSkipImageGeneration skips OpenAI image gen for spec and mermaid diagrams", () => {
  const previousPrefer = process.env.STUDY_COACH_PREFER_AI_DIAGRAMS;
  process.env.STUDY_COACH_PREFER_AI_DIAGRAMS = "false";

  assert.equal(
    shouldSkipImageGeneration({
      diagramPrompt: "ignored when spec present",
      diagramSpec: { diagramType: "number_line", min: 0, max: 10, points: [3] },
    }),
    true,
  );

  assert.equal(
    shouldSkipImageGeneration({
      diagramPrompt: "ignored when mermaid present",
      diagramType: "process_diagram",
      diagramMermaid: "flowchart LR\nStart-->End",
    }),
    true,
  );

  assert.equal(
    shouldSkipImageGeneration({
      diagramType: "cell_diagram",
      diagramPrompt: "Labelled cell diagram",
    }),
    false,
  );

  if (previousPrefer === undefined) {
    delete process.env.STUDY_COACH_PREFER_AI_DIAGRAMS;
  } else {
    process.env.STUDY_COACH_PREFER_AI_DIAGRAMS = previousPrefer;
  }
});

test("prefer AI flag routes number_line to image generation and render mode", () => {
  const previousPrefer = process.env.STUDY_COACH_PREFER_AI_DIAGRAMS;
  process.env.STUDY_COACH_PREFER_AI_DIAGRAMS = "true";

  const step = {
    diagramType: "number_line",
    diagramSpec: { diagramType: "number_line", min: 0, max: 10, points: [3] },
  };

  assert.equal(preferAiDiagramForStep(step, "study"), true);
  assert.equal(shouldSkipImageGeneration(step, "study"), false);
  assert.equal(resolveDiagramRenderMode(step, "study"), "image");

  process.env.STUDY_COACH_PREFER_AI_DIAGRAMS = "false";
  assert.equal(resolveDiagramRenderMode(step, "study"), "spec");

  if (previousPrefer === undefined) {
    delete process.env.STUDY_COACH_PREFER_AI_DIAGRAMS;
  } else {
    process.env.STUDY_COACH_PREFER_AI_DIAGRAMS = previousPrefer;
  }
});

test("shouldSkipImageGeneration skips when step text includes a mermaid fence", () => {
  assert.equal(
    shouldSkipImageGeneration({
      diagramPrompt: "would otherwise trigger image gen",
      text: "Process:\n```mermaid\nflowchart TD\nA-->B\n```",
    }),
    true,
  );
});
