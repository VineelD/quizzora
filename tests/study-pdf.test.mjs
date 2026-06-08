import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { test } from "node:test";
const require = createRequire(import.meta.url);
const pdfkitEntry = require.resolve("pdfkit");
const helveticaAfm = join(dirname(pdfkitEntry), "data", "Helvetica.afm");
require("pdfkit");

const { buildCoachPdfDocumentMarkers, buildCoachPdfSectionTitles } = await import("../lib/study-export-content.js");
const {
  FORMULA_FLASH_SECTION_MARKER,
  buildStudyFileTitle,
  extractStudyPdfText,
  renderStudyCoachPdf,
} = await import("../lib/study-pdf.js");

const richCoachContext = {
  yearLevel: "Year 12",
  subject: "Mathematics",
  focus: "Fibonacci sequences",
};

const richCoachPayload = {
  topicHeader: "Fibonacci sequences",
  intro: "Here's how Fibonacci works in practice.",
  keyIdeas: ["Each term sums the previous two"],
  formulas: [{ label: "Recurrence", expression: "F_n = F_{n-1} + F_{n-2}" }],
  portions: [
    {
      label: "Concept in action",
      content: "Trace 1, 1, 2, 3, 5 and explain how each term is formed.",
    },
  ],
  steps: [
    {
      diagramType: "recursion_tree",
      diagramSpec: { diagramType: "recursion_tree", root: 4, depth: 3 },
      diagramTitle: "Fibonacci tree",
      diagramSummary: "Shows recursive calls for F(4).",
    },
  ],
};

function assertMarkersAppearInOrder(text, markers) {
  let lastIndex = -1;
  for (const marker of markers) {
    const index = text.indexOf(marker);
    assert.ok(index >= 0, `expected PDF text to include marker: ${marker}`);
    assert.ok(index >= lastIndex, `expected "${marker}" after prior sections`);
    lastIndex = index;
  }
}

test("pdfkit Helvetica.afm resolves from node_modules", () => {
  assert.ok(existsSync(helveticaAfm), `missing ${helveticaAfm}`);
  assert.ok(!helveticaAfm.includes("ROOT"), `virtual path: ${helveticaAfm}`);
});

test("renderStudyCoachPdf produces a valid PDF buffer", async () => {
  const buffer = await renderStudyCoachPdf({
    assignmentTitle: "Test assignment",
    context: { yearLevel: "Year 9", subject: "Science", focus: "Cells" },
    payload: {
      topicHeader: "Cell structure",
      intro: "Organelles and their roles.",
      formulas: [{ label: "Surface area to volume", expression: "SA:V ratio decreases as size grows" }],
      steps: [],
    },
  });

  assert.ok(buffer.length > 100);
  assert.equal(buffer.subarray(0, 4).toString("utf8"), "%PDF");
});

test("buildCoachPdfSectionTitles lists structured study sections in UI order", () => {
  const titles = buildCoachPdfSectionTitles({
    keyIdeas: ["Each term sums the previous two"],
    portions: [{ label: "Concept in action", content: "Trace the sequence." }],
    steps: [{ title: "Hero visual", text: "", diagramType: "recursion_tree", diagramSpec: { diagramType: "recursion_tree" } }],
    formulas: [{ label: "Recurrence", expression: "F_n = F_{n-1} + F_{n-2}" }],
  });

  assert.deepEqual(titles, [
    "Key formulas",
    "Concept visual",
    "Concept in action",
    "Hero visual",
    "Key ideas",
  ]);
});

test("renderStudyCoachPdf section order matches breadcrumb, formula marker, and section titles", async () => {
  const buffer = await renderStudyCoachPdf({
    assignmentTitle: "Fibonacci study",
    context: richCoachContext,
    payload: richCoachPayload,
  });

  const minimal = await renderStudyCoachPdf({
    assignmentTitle: "Fibonacci study",
    context: richCoachContext,
    payload: {
      topicHeader: "Fibonacci sequences",
      formulas: [{ label: "Recurrence", expression: "F_n = F_{n-1} + F_{n-2}" }],
      steps: [],
    },
  });

  assert.equal(buffer.subarray(0, 4).toString("utf8"), "%PDF");
  assert.ok(buffer.length > minimal.length + 120, "rich coach payload should produce a larger PDF");

  const pdfText = extractStudyPdfText(buffer);
  const markers = buildCoachPdfDocumentMarkers(richCoachPayload, richCoachContext);

  assert.ok(markers[0].includes("Year 12"));
  assert.ok(markers.some((marker) => marker.includes("Fibonacci works")));
  assert.ok(markers.includes("Key formulas"));
  assert.ok(markers.includes("Concept in action"));
  assert.ok(markers.includes(FORMULA_FLASH_SECTION_MARKER));
  assertMarkersAppearInOrder(pdfText, markers);
});

test("renderStudyCoachPdf rejects title-only payloads", async () => {
  await assert.rejects(
    () =>
      renderStudyCoachPdf({
        assignmentTitle: "Empty study",
        context: { yearLevel: "Year 9", subject: "Science", focus: "Cells" },
        payload: {
          topicHeader: "Cell structure",
          intro: "",
          formulas: [],
          portions: [],
          steps: [],
        },
      }),
    /No exportable content/i,
  );
});

test("buildStudyFileTitle prefers formulas and diagrams", () => {
  assert.match(
    buildStudyFileTitle(
      {
        topicHeader: "Photosynthesis",
        formulas: [{ label: "Equation", expression: "6CO2 + 6H2O -> C6H12O6 + 6O2" }],
        steps: [{ diagramType: "number_line", diagramSpec: { diagramType: "number_line", min: 0, max: 10 } }],
      },
      { focus: "Photosynthesis" },
    ),
    /Study notes/i,
  );
});

test("renderStudyCoachPdf strips markdown headers and LaTeX delimiters", async () => {
  const buffer = await renderStudyCoachPdf({
    assignmentTitle: "Trig study",
    context: richCoachContext,
    payload: {
      topicHeader: "Trigonometry",
      portions: [
        {
          label: "Identities",
          content: "### Pythagorean identity\n\n- $\\sin^2\\theta + \\cos^2\\theta = 1$\n- Use **unit circle** values",
        },
      ],
      steps: [],
    },
  });

  const pdfText = extractStudyPdfText(buffer);
  assert.ok(!pdfText.includes("###"), "PDF should not contain raw markdown header markers");
  assert.ok(!pdfText.includes("$"), "PDF should not contain visible LaTeX delimiters");
  assert.ok(/Pythagorean identity/i.test(pdfText));
  assert.ok(/unit circle/i.test(pdfText));
});
