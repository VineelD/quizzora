import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildCurriculumPromptContext,
  formatFocusLabel,
  getFlatFocusLabels,
  getSubtopicsForTopicKey,
  getTopicKeysForYear,
  parseFocusLabel,
} from "../lib/curriculum-topics.js";
import { getCurriculumPickerTree, getFocusesForYear } from "../lib/curriculum.js";

test("hierarchical curriculum exposes topic keys and subtopics for Year 12 Mathematics", () => {
  const keys = getTopicKeysForYear("Year 12", "Mathematics");
  assert.ok(keys.some((key) => key.includes("Recursion")));
  const subtopics = getSubtopicsForTopicKey("Year 12", "Mathematics", "VCE Further Mathematics / Recursion and financial modelling");
  assert.ok(subtopics.includes("Fibonacci and recurrence relations"));
  assert.ok(subtopics.includes("Factorials and permutations"));
});

test("focus label round-trips through parseFocusLabel", () => {
  const label = formatFocusLabel(
    {
      topic: "Recursion and financial modelling",
      stream: "VCE Further Mathematics",
      subtopics: ["Factorials and permutations"],
    },
    "Factorials and permutations",
  );
  const parsed = parseFocusLabel(label);
  assert.equal(parsed.stream, "VCE Further Mathematics");
  assert.equal(parsed.topic, "Recursion and financial modelling");
  assert.equal(parsed.subtopic, "Factorials and permutations");
});

test("buildCurriculumPromptContext includes subtopic and reference", () => {
  const focus = "Integers and rational numbers — Adding and subtracting integers";
  const context = buildCurriculumPromptContext({
    yearLevel: "Year 7",
    subject: "Mathematics",
    focus,
  });
  assert.match(context, /Subtopic focus: Adding and subtracting integers/);
  assert.match(context, /AC9M7N01/);
  assert.match(context, /Related subtopics/);
});

test("getFocusesForYear returns granular labels from hierarchy", () => {
  const focuses = getFocusesForYear("Mathematics", "Year 7");
  assert.ok(focuses.some((item) => item.includes("Integers and rational numbers")));
  assert.ok(focuses.some((item) => item.includes(" — ")));
});

test("curriculum picker tree matches hierarchy shape", () => {
  const tree = getCurriculumPickerTree();
  assert.ok(Array.isArray(tree["Year 10"].Science));
  assert.ok(tree["Year 10"].Science[0].subtopics.length >= 3);
  assert.equal(typeof tree["Year 11"].English[0].key, "string");
});
