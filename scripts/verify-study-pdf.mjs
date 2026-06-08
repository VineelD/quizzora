#!/usr/bin/env node
/**
 * Verify Study Coach PDF generation resolves pdfkit fonts from real node_modules.
 * Run after `npm run build` to confirm production-safe pdfkit loading.
 */
import { existsSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { renderStudyCoachPdf } from "../lib/study-pdf.js";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(projectRoot, "package.json"));
const pdfkitEntry = require.resolve("pdfkit");
const helveticaAfm = join(dirname(pdfkitEntry), "data", "Helvetica.afm");

if (helveticaAfm.includes("ROOT")) {
  console.error(`FAIL: pdfkit font path still virtual: ${helveticaAfm}`);
  process.exit(1);
}

if (!existsSync(helveticaAfm)) {
  console.error(`FAIL: Helvetica.afm missing at ${helveticaAfm}`);
  process.exit(1);
}

console.log(`OK: Helvetica.afm at ${helveticaAfm}`);

const samplePayload = {
  topicHeader: "Quadratic equations",
  intro: "Quick reference for solving ax² + bx + c = 0.",
  formulas: [
    { label: "Quadratic formula", expression: "x = (-b ± √(b² - 4ac)) / 2a" },
    { label: "Discriminant", expression: "Δ = b² - 4ac" },
  ],
  steps: [],
};

const buffer = await renderStudyCoachPdf({
  assignmentTitle: "Algebra practice",
  context: {
    yearLevel: "Year 10",
    subject: "Mathematics",
    focus: "Quadratic equations",
  },
  payload: samplePayload,
});

if (!buffer?.length || buffer.length < 100) {
  console.error("FAIL: PDF buffer too small");
  process.exit(1);
}

if (buffer.subarray(0, 4).toString("utf8") !== "%PDF") {
  console.error("FAIL: output is not a PDF");
  process.exit(1);
}

const outPath = join(projectRoot, "data", "verify-study-pdf-sample.pdf");
writeFileSync(outPath, buffer);
console.log(`OK: generated ${buffer.length}-byte PDF at ${outPath}`);
