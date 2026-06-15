import assert from "node:assert/strict";
import test from "node:test";
import { inferCircuitDiagramSpec, normalizeCircuitSpec } from "../lib/circuit-diagram.js";
import { normalizeCoachSteps } from "../lib/study-message-payload.js";
import { isAsciiDiagramContent, stripAsciiDiagramArtifacts } from "../lib/study-message-content.js";
import { normalizeDiagramSpec } from "../lib/study-diagram-render.js";
import { questionHasValidDiagramChannel } from "../lib/quiz-diagram-prompt-rules.js";

test("normalizeCircuitSpec accepts parallel circuit with components", () => {
  const spec = normalizeCircuitSpec({
    diagramType: "circuit",
    layout: "parallel",
    voltage: 12,
    components: [
      { id: "R1", value: 4, unit: "Ω" },
      { id: "R2", value: 6, unit: "Ω" },
      { id: "R3", value: 12, unit: "Ω" },
    ],
  });

  assert.equal(spec.layout, "parallel");
  assert.equal(spec.voltage, 12);
  assert.equal(spec.components.length, 3);
  assert.equal(spec.components[0].id, "R1");
});

test("normalizeDiagramSpec routes circuit_diagram alias", () => {
  const spec = normalizeDiagramSpec({
    diagramType: "circuit_diagram",
    layout: "series",
    batteryVoltage: 9,
    resistors: [{ id: "R1", resistance: 10 }],
  });

  assert.equal(spec.diagramType, "circuit");
  assert.equal(spec.layout, "series");
  assert.equal(spec.voltage, 9);
});

test("inferCircuitDiagramSpec parses coach ASCII circuit prose", () => {
  const raw = `+-------------------------------------+ [R1] [R2] (4 Ω, red) (6 Ω, blue) | I₁ = 3 A | I₂ = 2 A
Explanation of Colors:
- **Red resistor (R1)** = 4 Ω
- **Blue resistor (R2)** = 6 Ω
- **Green battery** = 12 V source`;

  assert.equal(isAsciiDiagramContent(raw), true);
  const spec = inferCircuitDiagramSpec(raw);
  assert.equal(spec.layout, "parallel");
  assert.equal(spec.voltage, 12);
  assert.equal(spec.components.length, 2);
  assert.equal(spec.components[0].id, "R1");
  assert.equal(spec.components[0].value, 4);
});

test("normalizeCoachSteps strips ASCII circuit text and attaches diagramSpec", () => {
  const raw = `+-------------------------------------+ [R1] (4 Ω, red) [R2] (6 Ω, blue) | I₁ = 3 A |
Explanation of Colors:
- **Red resistor (R1)** = 4 Ω
If you want, I can create a polished color image file for this circuit.`;

  const [step] = normalizeCoachSteps([
    {
      title: "Step 1",
      text: raw,
      diagramPrompt: "",
    },
  ]);

  assert.equal(step.diagramSpec?.diagramType, "circuit");
  assert.doesNotMatch(step.text, /Explanation of Colors/i);
  assert.doesNotMatch(step.text, /\+\-{4,}/);
  assert.doesNotMatch(stripAsciiDiagramArtifacts(raw), /polished color image/i);
});

test("questionHasValidDiagramChannel accepts circuit diagramSpec", () => {
  assert.equal(
    questionHasValidDiagramChannel({
      needsDiagram: true,
      diagramSpec: {
        diagramType: "circuit",
        layout: "parallel",
        voltage: 12,
        components: [{ id: "R1", value: 4, unit: "Ω" }],
      },
    }),
    true,
  );
});
