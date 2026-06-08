import assert from "node:assert/strict";
import { test } from "node:test";
import {
  hasFlashableFormulas,
  normalizeFlashFormulas,
  renderFormulaFlashHtml,
} from "../lib/study-formula-flash.js";

test("normalizeFlashFormulas keeps label and expression pairs", () => {
  const items = normalizeFlashFormulas([
    { label: "Fibonacci rule", expression: "F_n = F_{n-1} + F_{n-2}" },
    { expression: "" },
  ]);
  assert.equal(items.length, 1);
  assert.equal(items[0].label, "Fibonacci rule");
  assert.match(items[0].expression, /F_n/);
});

test("hasFlashableFormulas detects usable formulas", () => {
  assert.equal(hasFlashableFormulas([]), false);
  assert.equal(hasFlashableFormulas([{ label: "Area", expression: "A = \\pi r^2" }]), true);
});

test("renderFormulaFlashHtml renders formulas array entries", () => {
  const html = renderFormulaFlashHtml("F_n = F_{n-1} + F_{n-2}");
  assert.match(html, /katex/);
  assert.doesNotMatch(html, /study-formula-flash-fallback/);
});

test("renderFormulaFlashHtml renders KaTeX markup", () => {
  const html = renderFormulaFlashHtml("E = mc^2");
  assert.match(html, /katex/);
  assert.match(html, /mc/);
});

test("renderFormulaFlashHtml wraps bare LaTeX in display mode", () => {
  const html = renderFormulaFlashHtml("a^2 + b^2 = c^2");
  assert.match(html, /katex/);
  assert.doesNotMatch(html, /study-formula-flash-fallback/);
});
