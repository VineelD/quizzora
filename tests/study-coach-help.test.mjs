import assert from "node:assert/strict";
import { test } from "node:test";
import { buildCoachHelpPayload, isCoachHelpMessage } from "../lib/study-coach-help.js";
import { stepsToPlainText } from "../lib/study-message-payload.js";

test("coach help messages are detected", () => {
  assert.equal(isCoachHelpMessage("stuck?"), true);
  assert.equal(isCoachHelpMessage("help"), true);
  assert.equal(isCoachHelpMessage("Explain slope"), false);
});

test("coach help payload returns a quick text-only walkthrough", () => {
  const payload = buildCoachHelpPayload({ focus: "Linear graphs" });
  assert.equal(payload.steps.length, 2);
  assert.equal(payload.steps[0].diagramPrompt, "");
  assert.match(stepsToPlainText(payload), /Linear graphs/);
});
