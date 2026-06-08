import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildIntroSpeechText,
  buildPortionSpeechText,
  buildStepSpeechText,
  normalizeTextForSpeech,
} from "../lib/speech-text.js";

test("strips markdown and bold for speech", () => {
  const spoken = normalizeTextForSpeech("## Cells\n\n**Nucleus** controls the cell.");
  assert.match(spoken, /Cells/);
  assert.match(spoken, /Nucleus controls the cell/);
  assert.doesNotMatch(spoken, /\*\*/);
  assert.doesNotMatch(spoken, /##/);
});

test("converts inline LaTeX and factorials to spoken math", () => {
  const spoken = normalizeTextForSpeech("So $n! = 120$ for this example.");
  assert.match(spoken, /n factorial/);
  assert.match(spoken, /equals/);
  assert.match(spoken, /120/);
  assert.doesNotMatch(spoken, /\\\(/);
});

test("replaces fenced code blocks with on-screen cue", () => {
  const spoken = normalizeTextForSpeech("Try this:\n```csharp\nvar x = 5;\n```\nThen continue.");
  assert.match(spoken, /code example on your screen/i);
  assert.doesNotMatch(spoken, /var x/);
});

test("removes off-topic labels without mockery phrasing", () => {
  const spoken = normalizeTextForSpeech("OFF-TOPIC: Let's keep our study session focused on Science.");
  assert.doesNotMatch(spoken, /off[- ]topic/i);
  assert.match(spoken, /stay focused on our topic/i);
});

test("prefers narrationText on steps and normalizes display fallback", () => {
  const fromNarration = buildStepSpeechText({
    narrationText: "Five factorial equals one hundred and twenty.",
    text: "$5! = 120$",
  });
  assert.equal(fromNarration, "Five factorial equals one hundred and twenty.");

  const fromDisplay = buildStepSpeechText({
    title: "Step 1 — Factorials",
    text: "Remember that **5!** equals $120$.",
  });
  assert.match(fromDisplay, /Chapter 1/);
  assert.match(fromDisplay, /5 factorial/);
  assert.match(fromDisplay, /120/);
});

test("adds concept pauses for application hooks", () => {
  const spoken = normalizeTextForSpeech("Here's how a cell works. Now, the nucleus takes control.");
  assert.match(spoken, /Here's how/);
  assert.match(spoken, /\.\.\./);
});

test("portion speech prefers narrationText and stays concise", () => {
  const fromNarration = buildPortionSpeechText({
    label: "Fibonacci definition",
    narrationText: "Fibonacci starts with zero and one.",
    content: "$F_0 = 0$",
  });
  assert.equal(fromNarration, "Fibonacci starts with zero and one.");

  const fromLabel = buildPortionSpeechText({
    label: "Recurrence rule",
    content: "$F_n = F_{n-1} + F_{n-2}$",
  });
  assert.match(fromLabel, /Recurrence rule/);
  assert.ok(fromLabel.length <= 200);
});

test("intro speech prefers introNarrationText", () => {
  const spoken = buildIntroSpeechText(
    "## Welcome\n\nLet's begin with **cells**.",
    "Welcome. Let's begin with cells.",
  );
  assert.equal(spoken, "Welcome. Let's begin with cells.");
});
