import assert from "node:assert/strict";
import { test } from "node:test";
import {
  formatFocusLabel,
  formatMicVocabHint,
  getSubtopicTermsForAssignment,
  getTopicEntries,
  topicKey,
} from "../lib/curriculum-topics.js";
import { buildTopicVocabulary, normalizeSpokenTranscript } from "../lib/spoken-topic-vocab.js";

test("buildTopicVocabulary includes focus path and sibling subtopics", () => {
  const vocab = buildTopicVocabulary({
    yearLevel: "Year 12",
    subject: "Mathematics",
    focus: "VCE Further Mathematics / Recursion and financial modelling — Factorials and permutations",
    curriculumSummary: "Practice with n! and counting arrangements.",
  });

  assert.ok(vocab.includes("Factorials and permutations"));
  assert.ok(vocab.includes("Fibonacci and recurrence relations"));
  assert.ok(vocab.includes("Recursion and financial modelling"));
  assert.ok(vocab.includes("Practice with n! and counting arrangements."));
});

test("getSubtopicTermsForAssignment resolves terms from selected topic keys", () => {
  const terms = getSubtopicTermsForAssignment({
    yearLevel: "Year 11",
    subject: "Science",
    focus: "VCE Biology / Cells and biomolecules — Cellular respiration and photosynthesis",
    selectedTopicKeys: ["VCE Chemistry / Atomic structure and bonding"],
  });

  assert.ok(terms.includes("Cellular respiration and photosynthesis"));
  assert.ok(terms.includes("Periodic trends"));
});

test("normalizeSpokenTranscript fixes domain mishearings", () => {
  const vocab = buildTopicVocabulary({
    yearLevel: "Year 12",
    subject: "Mathematics",
    focus: "VCE Further Mathematics / Recursion and financial modelling — Fibonacci and recurrence relations",
  });

  const recursion = normalizeSpokenTranscript("explain re curse in this sequence", { topicVocab: vocab });
  assert.match(recursion.text, /recursion/i);
  assert.ok(recursion.corrections.some((entry) => /recursion/i.test(entry.corrected)));

  const fibonacci = normalizeSpokenTranscript("how does fiber naughty work", { topicVocab: vocab });
  assert.match(fibonacci.text, /Fibonacci/i);

  const photosynthesis = normalizeSpokenTranscript("what is photo synthesis", {
    topicVocab: ["photosynthesis", "Cellular respiration and photosynthesis"],
  });
  assert.match(photosynthesis.text, /photosynthesis/i);
});

test("buildTopicVocabulary merges terms from five selected subtopics", () => {
  const yearLevel = "Year 12";
  const subject = "Mathematics";
  const entries = getTopicEntries(yearLevel, subject);
  const selectedSubtopics = [
    formatFocusLabel(entries[0], entries[0].subtopics[0]),
    formatFocusLabel(entries[0], entries[0].subtopics[1]),
    formatFocusLabel(entries[1], entries[1].subtopics[0]),
    formatFocusLabel(entries[2], entries[2].subtopics[0]),
    formatFocusLabel(entries[3], entries[3].subtopics[0]),
  ];

  const vocab = buildTopicVocabulary({
    yearLevel,
    subject,
    focus: `${selectedSubtopics[0]}; ${selectedSubtopics[1]} (+3 more)`,
    selectedSubtopics,
  });

  assert.ok(vocab.includes("Factorials and permutations"));
  assert.ok(vocab.includes("Fibonacci and recurrence relations"));
  assert.ok(vocab.includes("Two-way frequency tables"));
  assert.ok(vocab.includes("Matrix operations"));
  assert.ok(vocab.includes("Differentiation rules"));
  assert.ok(!vocab.includes("Complex numbers"));
});

test("select all subtopics simulation includes entire subject topic tree selection", () => {
  const yearLevel = "Year 12";
  const subject = "Mathematics";
  const entries = getTopicEntries(yearLevel, subject);
  const selectedSubtopics = entries.flatMap((row) =>
    row.subtopics.map((subtopic) => formatFocusLabel(row, subtopic)),
  );
  const selectedTopicKeys = entries.map((row) => topicKey(row));

  const vocab = buildTopicVocabulary({
    yearLevel,
    subject,
    focus: `${selectedSubtopics[0]}; ${selectedSubtopics[1]} (+${selectedSubtopics.length - 2} more)`,
    selectedSubtopics,
    selectedTopicKeys,
  });

  assert.ok(vocab.includes("Factorials and permutations"));
  assert.ok(vocab.includes("Normal distribution applications"));
  assert.ok(vocab.includes("Leslie matrix models"));
  assert.ok(vocab.includes("Complex numbers"));
  assert.equal(vocab.length >= selectedSubtopics.length, true);
});

test("formatMicVocabHint summarizes many selected subtopics", () => {
  const hint = formatMicVocabHint({
    subject: "Mathematics",
    selectedSubtopics: [
      "VCE Further Mathematics / Recursion and financial modelling — Factorials and permutations",
      "VCE Further Mathematics / Recursion and financial modelling — Fibonacci and recurrence relations",
      "VCE Further Mathematics / Data analysis and inference — Two-way frequency tables",
      "VCE Further Mathematics / Matrices — Matrix operations",
      "VCE Mathematical Methods / Calculus and functions — Differentiation rules",
    ],
  });

  assert.match(hint, /Mic uses vocabulary for 5 subtopics/);
  assert.match(hint, /Factorials and permutations/);
  assert.match(hint, /Fibonacci and recurrence relations/);
  assert.match(hint, /Two-way frequency tables/);
  assert.match(hint, /and 2 more/);
});

test("normalizeSpokenTranscript applies math mode after topic vocabulary", () => {
  const vocab = buildTopicVocabulary({
    yearLevel: "Year 11",
    subject: "Mathematics",
    focus: "VCE Mathematical Methods / Trigonometry and measurement — Trigonometric identities",
  });

  const result = normalizeSpokenTranscript("sin square theta plus cos square theta", {
    mathMode: true,
    topicVocab: vocab,
  });

  assert.match(result.text, /sin²θ/);
  assert.match(result.text, /cos²θ/);
  assert.doesNotMatch(result.text, /\$/);
});
