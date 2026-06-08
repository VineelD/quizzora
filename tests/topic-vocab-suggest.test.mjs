import assert from "node:assert/strict";
import { test } from "node:test";
import { formatFocusLabel, getTopicEntries } from "../lib/curriculum-topics.js";
import {
  detectTopicMention,
  getComposeVocabularySuggestions,
  getVocabularyForTopic,
} from "../lib/topic-vocab-suggest.js";

const year11MethodsContext = {
  yearLevel: "Year 11",
  subject: "Mathematics",
  focus: "VCE Mathematical Methods / Trigonometry and measurement — Trigonometric identities",
  selectedSubtopics: [
    "VCE Mathematical Methods / Trigonometry and measurement — Trigonometric identities",
    "VCE Mathematical Methods / Trigonometry and measurement — Circular functions",
    "VCE Mathematical Methods / Trigonometry and measurement — Applications in 3D problems",
  ],
};

test("detectTopicMention finds trigonometry from natural phrasing", () => {
  const mention = detectTopicMention("Now lets talk about trigonometry", year11MethodsContext);

  assert.ok(mention);
  assert.match(mention.displayLabel, /trigonometry/i);
  assert.equal(mention.topicKey, "VCE Mathematical Methods / Trigonometry and measurement");
});

test("detectTopicMention returns trig-related vocabulary suggestions", () => {
  const suggestions = getComposeVocabularySuggestions("Now lets talk about trigonometry", year11MethodsContext);

  assert.equal(suggestions.mode, "topic");
  assert.match(suggestions.label, /trigonometry/i);
  assert.ok(suggestions.terms.length >= 8);
  assert.ok(suggestions.terms.length <= 20);
  assert.ok(suggestions.terms.some((term) => /trigonometric identities/i.test(term)));
  assert.ok(suggestions.terms.some((term) => /SOH CAH TOA|sine|circular functions/i.test(term)));
  assert.ok(
    suggestions.terms.some((term) => /^theta$|^θ$/i.test(term.trim())),
    "expected glossary seed term theta for trigonometry",
  );
});

test("getVocabularyForTopic scopes terms to a topic key", () => {
  const terms = getVocabularyForTopic("VCE Mathematical Methods / Trigonometry and measurement", year11MethodsContext);

  assert.ok(terms.includes("Trigonometric identities"));
  assert.ok(terms.includes("Circular functions"));
  assert.ok(terms.some((term) => /sine|SOH CAH TOA/i.test(term)));
  assert.ok(!terms.includes("Differentiation rules"));
});

test("detectTopicMention with Further Maths curriculum", () => {
  const yearLevel = "Year 12";
  const subject = "Mathematics";
  const entries = getTopicEntries(yearLevel, subject);
  const recursionRow = entries.find((row) => row.topic === "Recursion and financial modelling");
  assert.ok(recursionRow);

  const context = {
    yearLevel,
    subject,
    focus: formatFocusLabel(recursionRow, recursionRow.subtopics[0]),
    selectedSubtopics: recursionRow.subtopics.slice(0, 3).map((subtopic) => formatFocusLabel(recursionRow, subtopic)),
  };

  const mention = detectTopicMention("can we discuss recursion in this sequence", context);
  assert.ok(mention);
  assert.match(mention.displayLabel, /recursion|Fibonacci|Factorials/i);

  const suggestions = getComposeVocabularySuggestions("lets explore fibonacci next", context);
  assert.equal(suggestions.mode, "topic");
  assert.ok(suggestions.terms.some((term) => /Fibonacci|recurrence|factorial/i.test(term)));
});

test("getComposeVocabularySuggestions defaults to assignment vocabulary", () => {
  const suggestions = getComposeVocabularySuggestions("", year11MethodsContext);

  assert.equal(suggestions.mode, "assignment");
  assert.equal(suggestions.label, "Assignment vocabulary");
  assert.ok(suggestions.terms.length >= 8);
  assert.equal(suggestions.previewCount, 6);
});

test("detectTopicMention fuzzy-matches spoken subtopic names", () => {
  const mention = detectTopicMention("explain trigonometric identites please", year11MethodsContext);
  assert.ok(mention);
  assert.match(mention.displayLabel, /Trigonometric identities/i);
});
