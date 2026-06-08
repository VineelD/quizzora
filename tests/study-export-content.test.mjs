import assert from "node:assert/strict";
import { test } from "node:test";
import { formatCoachExportLine, stripBasicMarkdown } from "../lib/study-export-content.js";

test("stripBasicMarkdown removes heading markers", () => {
  assert.equal(stripBasicMarkdown("### Pythagorean identity"), "Pythagorean identity");
  assert.equal(stripBasicMarkdown("**bold** term"), "bold term");
});

test("formatCoachExportLine converts inline LaTeX to plain text", () => {
  const plain = formatCoachExportLine("$F_n = F_{n-1} + F_{n-2}$");
  assert.ok(!plain.includes("$"));
  assert.match(plain, /F/);
});
