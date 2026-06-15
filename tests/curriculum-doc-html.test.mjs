import assert from "node:assert/strict";
import { test } from "node:test";
import {
  fixProseWrappedInMath,
  prepareCurriculumDocMarkdown,
  renderCurriculumDocHtml,
  renderCurriculumDocMarkdownToHtml,
} from "../lib/curriculum-doc-html.js";

test("prepareCurriculumDocMarkdown converts plain section headings to markdown h2", () => {
  const source = `
Introduction
You start here.

Key concepts
Force equals mass times acceleration.

Worked examples
Use $F = ma$ with $m = 2\\,\\text{kg}$ and $a = 3\\,\\text{m/s}^2$.
`.trim();

  const prepared = prepareCurriculumDocMarkdown(source);
  assert.match(prepared, /^## Introduction/m);
  assert.match(prepared, /^## Key concepts/m);
  assert.match(prepared, /\$F = ma\$/);
});

test("prepareCurriculumDocMarkdown keeps variables separate from prose in vocabulary", () => {
  const source = `
Essential vocabulary

Side: For example, side $a$ is the side opposite angle $A$.

Included angle: For example, angle $C$ is the included angle between sides $a$ and $b$.
`.trim();

  const prepared = prepareCurriculumDocMarkdown(source);
  assert.match(prepared, /side \$a\$ is the side opposite angle \$A\$/);
  assert.match(prepared, /angle \$C\$ is the included angle between sides \$a\$ and \$b\$/);
  assert.doesNotMatch(prepared, /\$a is the side opposite angle A\$/);
  assert.doesNotMatch(prepared, /\$C is the included angle between sides a and b\$/);
});

test("fixProseWrappedInMath unwraps merged prose spans from legacy exports", () => {
  const merged = "For example, side $a is the side opposite angle A$.";
  const fixed = fixProseWrappedInMath(merged);
  assert.match(fixed, /side \$a\$ is the side opposite angle \$A\$/);
});

test("fixProseWrappedInMath leaves real formulae untouched", () => {
  const formula = "Use $F = ma$ and $\\sin\\theta = \\frac{a}{c}$.";
  const fixed = fixProseWrappedInMath(formula);
  assert.equal(fixed, formula);
});

test("renderCurriculumDocMarkdownToHtml renders inline LaTeX with KaTeX markup", async () => {
  const html = await renderCurriculumDocMarkdownToHtml("The formula is $E = mc^2$ for energy.");
  assert.match(html, /katex/i);
  assert.doesNotMatch(html, /\$E = mc\^2\$/);
});

test("renderCurriculumDocMarkdownToHtml renders vocabulary without gluing italic words", async () => {
  const html = await renderCurriculumDocMarkdownToHtml(
    "Side $a$ is the side opposite angle $A$. Angle $C$ is the included angle between sides $a$ and $b$.",
  );

  assert.doesNotMatch(html, /aisoppositeangleA/i);
  assert.doesNotMatch(html, /Cistheincludedanglebetweensidesaandb/i);
  assert.match(html, /katex/i);
});

test("renderCurriculumDocHtml returns a standalone page with title and body", async () => {
  const html = await renderCurriculumDocHtml({
    subtopic: "Sine and cosine rules",
    yearLevel: "Year 10",
    subject: "Mathematics",
    topicKey: "Trigonometry and measurement",
    acaraCodes: "AC9M10M01",
    markdown: "Use $\\sin\\theta = \\frac{a}{c}$ in right triangles.",
  });

  assert.match(html, /<title>Sine and cosine rules<\/title>/);
  assert.match(html, /class="content"/);
  assert.match(html, /katex/i);
  assert.match(html, /Year 10/);
});
