/**
 * Shared renderability rules for quiz generation, self-review, and regeneration prompts.
 * Students see visuals via KaTeX (text), diagramSpec SVG, Mermaid SVG, or OpenAI images for organic subjects only.
 */

import { normalizeDiagramSpec } from "./study-diagram-render.js";

/** 0 = unlimited. When QUIZ_QUALITY_FIRST=true and unset, default to unlimited. */
function maxDiagramsPerQuiz() {
  const configured = Number(process.env.QUIZ_MAX_DIAGRAMS_PER_QUIZ);
  if (Number.isFinite(configured) && configured >= 0) {
    return Math.round(configured);
  }
  if (process.env.QUIZ_QUALITY_FIRST === "true") {
    return 0;
  }
  return 8;
}

/** Patterns that indicate a diagram was wrongly embedded in question/option prose. */
const EMBEDDED_DIAGRAM_PATTERNS = [
  /```\s*mermaid/i,
  /^#{1,3}\s*Diagram:/im,
  /^#{1,3}\s*Labels:/im,
  /^#{1,3}\s*.*\b(?:Circuit\s+)?Visual\b/im,
  /\b[A-Z][A-Za-z0-9]*\s*-->\s*[A-Z]/,
  /[A-Za-z][A-Za-z0-9]*\s*--+\s*[^.\n?]+/,
  /\+\s*---+.*(?:Ω|ohm)/i,
  /R\d\s*\([^)]*(?:Ω|ohm)/i,
  /\d+\s*V\s+supply/i,
  /(?:^|\n)\s*[|+\\\/\-]{3,}/m,
  /\[MATH\d+\]/i,
];

export function detectEmbeddedDiagramInProse(text) {
  const value = String(text || "");
  return EMBEDDED_DIAGRAM_PATTERNS.some((pattern) => pattern.test(value));
}

export function questionHasValidDiagramChannel(question) {
  if (!question?.needsDiagram) {
    return true;
  }

  if (normalizeDiagramSpec(question?.diagramSpec)) {
    return true;
  }

  const diagramType = String(question?.diagramType || question?.diagramSpec?.diagramType || "").trim();
  const mermaidSource = String(question?.diagramMermaid || "").trim();
  if (
    mermaidSource &&
    (diagramType === "flowchart" || diagramType === "process_diagram" || !diagramType)
  ) {
    return true;
  }

  if (String(question?.diagramPrompt || question?.imagePrompt || "").trim()) {
    return true;
  }

  if (question.imageGenerated === "openai" && String(question?.imageUrl || "").trim()) {
    return true;
  }

  return false;
}

export function hasInvalidDiagramSpecWithoutFallback(question) {
  const raw = question?.diagramSpec;
  if (!raw || typeof raw !== "object") {
    return false;
  }
  if (normalizeDiagramSpec(raw)) {
    return false;
  }
  return !String(question?.diagramPrompt || "").trim() && !String(question?.diagramMermaid || "").trim();
}

export function buildQuizForbiddenVisualRules() {
  return `
Visual renderability — FORBIDDEN in question, options, and explanation text:
- Never ASCII diagrams, box-drawing, or arrow flows (e.g. A --> B, Battery -- 4Ω -- Bulb, + --- R1 (4Ω) --- +).
- Never "### Parallel Circuit Visual", "### Diagram:", code fences with circuit text-art, or "### Labels:" sections.
- Never put circuit schematics in explanation — circuits render via diagramSpec SVG on the question.
- Never raw LaTeX commands outside $...$ delimiters (e.g. bare \\frac{a}{b} in prose).
- Never \`\`\`mermaid code fences inside question text — Mermaid belongs in diagramMermaid only.
- Never placeholder tokens such as [MATH0] — write full expressions inside $...$ delimiters.
- Never TikZ, SVG, or HTML markup for diagrams in question text.
- Put ALL visuals in structured fields (diagramSpec, diagramMermaid, or diagramPrompt) — not in prose.`.trim();
}

export function buildQuizDiagramRoutingRules() {
  const diagramCap = maxDiagramsPerQuiz();
  const diagramCapRule =
    diagramCap === 0
      ? `- Mark every visual question with needsDiagram true and provide diagramPrompt (or diagramSpec / diagramMermaid) so each illustration can be generated.`
      : `- At most ${diagramCap} questions may use a non-empty "diagramPrompt" (AI-generated images). Prioritize the highest-need visual questions. Additional visual questions should use diagramSpec or diagramMermaid instead.`;

  return `
Channel-first diagram routing (choose ONE channel per visual question):
- number_line / inequalities → diagramSpec { diagramType: "number_line", min, max, points, intervals }; leave diagramPrompt empty.
- recursion / call tree → diagramSpec { diagramType: "recursion_tree", root, depth, labels }; leave diagramPrompt empty.
- flowchart / process pathway → diagramMermaid with valid Mermaid syntax; diagramType "flowchart" or "process_diagram"; leave diagramPrompt empty.
- Physics parallel/series circuits → needsDiagram true, diagramType "circuit", diagramSpec (NOT diagramPrompt):
  { diagramType: "circuit", layout: "parallel"|"series", voltage: number, voltageUnit: "V",
    components: [{ id: "R1", value: 4, unit: "Ω" }, ...] }
  Copy exact resistor IDs, ohm values, and battery voltage from the stem. Leave diagramPrompt empty.
- cell, apparatus, map (organic/photographic visuals) → needsDiagram true, diagramType cell_diagram/generic,
    diagramPrompt with exact labels; diagramLabels array.
- graph, geometric figure, bar chart, coordinate plane, probability → prefer diagramSpec when a structured schema exists;
  otherwise diagramPrompt only when no spec channel applies.

Science diagramPrompt template (cells/apparatus only — never circuits):
"Educational science diagram: [apparatus/cell]. Given values from question: [exact numbers, units, labels]. Style: white background, large sans-serif labels, no overlapping text, no quiz answers."

Circuit diagramSpec example:
{ "diagramType": "circuit", "layout": "parallel", "voltage": 12, "voltageUnit": "V",
  "components": [{ "id": "R1", "value": 4, "unit": "Ω" }, { "id": "R2", "value": 6, "unit": "Ω" }, { "id": "R3", "value": 12, "unit": "Ω" }] }

For Science, Mathematics (geometry and graphing), Biology, Physics, Geography, and similar visual subjects, mark questions that benefit from illustration with needsDiagram true.
Worded problems involving cells, graphs, geometric shapes, circuits, maps, apparatus, or data displays MUST set needsDiagram true when a visual would help students interpret the scenario.
Copy exact measurements, labels, units, and values from the question text into diagram fields. Never invent or round differently.
${diagramCapRule}
The question must remain fully solvable from the written text alone if the diagram were missing.
Do not call image_generation tools — diagrams are generated in a separate step after quiz text is produced.`.trim();
}

export function buildQuizMathRenderRules() {
  return `
Math renderability (KaTeX in the browser — NOT images, NOT OpenAI):
- Use $...$ for inline math and $$...$$ for display math in question stems when needed.
- MCQ options: wrap each option in exactly one inline $...$ pair on a single line when math is needed.
- Never use $$ display math in options; never put $ delimiters on separate lines.
- Matrices: $\\begin{pmatrix} a \\\\ b \\end{pmatrix}$ on one line per option.
- Keep minus signs and subscripts inside math delimiters; never start option text with "- " as plain text.`.trim();
}

export function buildQuizQuestionJsonSchema(yearLevel = "Year 7") {
  return `{
  "subject": string,
  "focus": string,
  "yearLevel": "${yearLevel}",
  "curriculumSummary": string,
  "learningIntentions": string[],
  "questions": [
    {
      "question": string,
      "options": string[],
      "answer": string,
      "explanation": string,
      "needsDiagram": boolean,
      "diagramType": string,
      "diagramPrompt": string,
      "diagramSpec": { "diagramType": "number_line", "min": number, "max": number, "points": number[], "intervals": [{ "from": number, "to": number, "label": string }] } | { "diagramType": "recursion_tree", "root": number, "depth": number, "labels": string[] } | { "diagramType": "circuit", "layout": "parallel"|"series", "voltage": number, "voltageUnit": string, "components": [{ "id": string, "value": number, "unit": string }] } | null,
      "diagramMermaid": string,
      "diagramTitle": string,
      "diagramCaption": string,
      "diagramLabels": string[]
    }
  ]
}`;
}

export function buildQuizSingleQuestionJsonSchema() {
  return `{
  "question": string,
  "options": string[],
  "answer": string,
  "explanation": string,
  "needsDiagram": boolean,
  "diagramType": string,
  "diagramPrompt": string,
  "diagramSpec": object | null,
  "diagramMermaid": string,
  "diagramTitle": string,
  "diagramCaption": string,
  "diagramLabels": string[]
}`;
}

export function buildQuizReviewQuestionsJsonSchema() {
  return `{
  "questions": [
    {
      "question": string,
      "options": string[],
      "answer": string,
      "explanation": string,
      "needsDiagram": boolean,
      "diagramType": string,
      "diagramPrompt": string,
      "diagramSpec": object | null,
      "diagramMermaid": string,
      "diagramTitle": string,
      "diagramCaption": string,
      "diagramLabels": string[]
    }
  ]
}`;
}

export function buildQuizRenderabilityReviewRules() {
  return `
Renderability review (fix routing before returning):
- If needsDiagram is true, ensure a valid channel is populated: diagramSpec (number_line/recursion_tree), diagramMermaid (flowchart/process), or non-empty diagramPrompt (science images).
- Move any diagram content wrongly embedded in question/options text into the correct structured field.
- diagramSpec numeric values must match the stem exactly.
- For science visuals, duplicate key units and labels in both the stem text and diagramPrompt/diagramLabels.
- Set diagramType when using diagramPrompt (cell_diagram, coordinate_plane, geometric_figure, bar_chart, probability, generic, etc.).
- Clear diagramPrompt when using diagramSpec or diagramMermaid; clear diagramMermaid when using diagramSpec or image diagramPrompt.
- Remove any "### Circuit Visual" or ASCII circuit blocks from explanation — keep explanation as calculation steps only.`.trim();
}

export function buildQuizDiagramRulesBlock({ includeDiagramMarking = true } = {}) {
  if (!includeDiagramMarking) {
    return `
- Set needsDiagram false, leave diagramPrompt empty, and omit diagramSpec and diagramMermaid on every question.`;
  }

  return `
${buildQuizForbiddenVisualRules()}
${buildQuizDiagramRoutingRules()}
${buildQuizMathRenderRules()}`;
}
