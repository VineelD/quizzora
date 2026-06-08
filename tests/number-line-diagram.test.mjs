import assert from "node:assert/strict";
import { test } from "node:test";
import {
  collectAboveAxisLabels,
  computeStaggeredLabelYs,
  sanitizeLabel,
} from "../lib/number-line-diagram.js";

test("sanitizeLabel strips dollar signs and LaTeX backslashes", () => {
  assert.equal(sanitizeLabel("$P(X \\leq 3.5)$"), "P(X leq 3.5)");
  assert.equal(sanitizeLabel("P(X ≤ 3.5)"), "P(X ≤ 3.5)");
});

test("computeStaggeredLabelYs separates labels at nearby x positions", () => {
  const width = 420;
  const entries = [
    { x: 200, text: "A" },
    { x: 210, text: "B" },
  ];
  const [yA, yB] = computeStaggeredLabelYs(entries, { width, baseY: 36, staggerStep: 12 });

  assert.equal(yA, 36);
  assert.equal(yB, 24);
  assert.notEqual(yA, yB);
});

test("point and probability labels use separate vertical bands", () => {
  const spec = {
    min: 0,
    max: 10,
    points: [3],
    intervals: [{ from: 2.5, to: 3.5, label: "P(X ≤ 3.5)" }],
  };
  const padding = 36;
  const innerWidth = 420 - padding * 2;
  const labels = collectAboveAxisLabels(spec, 0, 10, padding, innerWidth);
  const [labelY] = computeStaggeredLabelYs(labels, { width: 420, baseY: 36 });

  const pointLabelY = 55;
  assert.ok(labelY < 48, "custom labels render above the axis");
  assert.ok(pointLabelY > 48, "point labels render below the axis");
  assert.notEqual(labelY, pointLabelY);
});
