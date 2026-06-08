import assert from "node:assert/strict";
import test from "node:test";
import { canSubmitBeforeDue, formatDueLabel, isPastDue, parseDueAt } from "../lib/dates.js";

test("parseDueAt accepts ISO input", () => {
  const value = parseDueAt("2026-06-10T09:00:00.000Z");
  assert.equal(typeof value, "string");
});

test("isPastDue detects expired assignments", () => {
  assert.equal(isPastDue("2000-01-01T00:00:00.000Z"), true);
  assert.equal(isPastDue(null), false);
});

test("canSubmitBeforeDue respects late policy", () => {
  assert.equal(
    canSubmitBeforeDue({ dueAt: "2000-01-01T00:00:00.000Z", allowLate: false }),
    false,
  );
  assert.equal(
    canSubmitBeforeDue({ dueAt: "2000-01-01T00:00:00.000Z", allowLate: true }),
    true,
  );
});

test("formatDueLabel handles missing due date", () => {
  assert.equal(formatDueLabel(null), "No due date");
});
