import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeSpokenMath, SPOKEN_MATH_PLACEHOLDER } from "../lib/spoken-math.js";

test("converts trig squared phrases to readable unicode math", () => {
  assert.equal(normalizeSpokenMath("sin square theta"), "sin²θ");
  assert.equal(normalizeSpokenMath("sine squared theta"), "sin²θ");
  assert.equal(normalizeSpokenMath("cos square theta"), "cos²θ");
  assert.equal(normalizeSpokenMath("cosine squared theta"), "cos²θ");
  assert.doesNotMatch(normalizeSpokenMath("sin square theta"), /\$/);
});

test("supports latex format without changing delimiter repair expectations", () => {
  assert.equal(normalizeSpokenMath("sin square theta", { format: "latex" }), "$\\sin^2\\theta$");
  assert.equal(normalizeSpokenMath("cos square theta", { format: "latex" }), "$\\cos^2\\theta$");
});

test("normalizes common speech mishearings for trig squared theta", () => {
  assert.equal(normalizeSpokenMath("sign square theta"), "sin²θ");
  assert.equal(normalizeSpokenMath("cause square theta"), "cos²θ");
  assert.equal(normalizeSpokenMath("sin square data"), "sin²θ");
});

test("combines spoken operators and identity phrases", () => {
  const spoken = "sin square theta plus cos square theta equals one";
  const normalized = normalizeSpokenMath(spoken);
  assert.match(normalized, /sin²θ/);
  assert.match(normalized, /cos²θ/);
  assert.match(normalized, /\+/);
  assert.match(normalized, /= one$/);
  assert.doesNotMatch(normalized, /\$/);
});

test("handles square roots, fractions, and variable powers", () => {
  assert.equal(normalizeSpokenMath("square root of x"), "√(x)");
  assert.equal(normalizeSpokenMath("a over b"), "a⁄b");
  assert.equal(normalizeSpokenMath("x squared"), "x²");
  assert.equal(normalizeSpokenMath("n factorial"), "n!");
  assert.doesNotMatch(normalizeSpokenMath("x squared"), /\$/);
});

test("maps pi and theta outside trig-squared patterns", () => {
  assert.equal(normalizeSpokenMath("theta"), "θ");
  assert.match(normalizeSpokenMath("two pi"), /two π/);
});

test("exposes a math-mode placeholder hint", () => {
  assert.match(SPOKEN_MATH_PLACEHOLDER, /sine squared theta/i);
});
