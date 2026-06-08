import assert from "node:assert/strict";
import { test } from "node:test";
import { formatExplanationSteps } from "../lib/explanation-format.js";

test("formatExplanationSteps does not split semicolons inside inline math", () => {
  const steps = formatExplanationSteps("Use \\( a; b \\) and continue.");
  assert.equal(steps.length, 1);
  assert.match(steps[0], /\$a; b\$/);
});

test("formatExplanationSteps splits newline-separated explanation lines with inline math", () => {
  const steps = formatExplanationSteps(
    "Substitute into \\( S_n = S_{n-1} + 3n \\)\nUse \\( z = \\frac{X - \\mu}{\\sigma} \\)",
  );

  assert.equal(steps.length, 2);
  assert.match(steps[0], /S_\{n-1\}/);
  assert.match(steps[1], /\\frac\{X - \\mu\}\{\\sigma\}/);
});
