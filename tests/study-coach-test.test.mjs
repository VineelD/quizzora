import assert from "node:assert/strict";
import { test } from "node:test";
import { retrieveStudyCoachRagContext } from "../lib/curriculum-doc-retrieve.js";
import {
  buildStudyCoachTestContext,
  listEmbeddedFocusLabels,
  runStudyCoachRagTest,
} from "../lib/study-coach-test.js";

function withEnv(overrides, fn) {
  const previous = {};
  for (const [key, value] of Object.entries(overrides)) {
    previous[key] = process.env[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  try {
    return fn();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

test("buildStudyCoachTestContext maps focus label to coach context", () => {
  const context = buildStudyCoachTestContext("Biological sciences › Cells › Animal cells");
  assert.equal(context.yearLevel, "Year 7");
  assert.equal(context.subject, "Science");
  assert.equal(context.focus, "Biological sciences › Cells › Animal cells");
  assert.ok(context.curriculumSummary.includes("Year 7"));
});

test("listEmbeddedFocusLabels returns an array", () => {
  const labels = listEmbeddedFocusLabels();
  assert.ok(Array.isArray(labels));
  for (const entry of labels) {
    assert.ok(entry.focusLabel);
  }
});

test("retrieveStudyCoachRagContext honors forceRag when global flag is off", async () => {
  await withEnv({ STUDY_COACH_RAG_ENABLED: undefined }, async () => {
    const result = await retrieveStudyCoachRagContext(
      {
        context: buildStudyCoachTestContext("Biological sciences › Cells › Animal cells"),
        message: "What is a cell membrane?",
      },
      {
        forceRag: true,
        fetchImpl: async () => ({
          ok: true,
          json: async () => ({ embedding: [1, 0, 0] }),
        }),
      },
    );
    assert.ok(Array.isArray(result.chunks));
  });
});

test("runStudyCoachRagTest returns reply and rag chunks with mocked LLM", async () => {
  const coachJson = JSON.stringify({
    intro: "Cells have membranes that control what enters and leaves.",
    onTopic: true,
    followUps: ["Show me another example"],
    portions: [],
    steps: [],
  });

  const result = await runStudyCoachRagTest(
    {
      focusLabel: "Biological sciences › Cells › Animal cells",
      message: "What is a cell membrane?",
      history: [],
    },
    {
      fetchImpl: async (url, options) => {
        const body = JSON.parse(options.body || "{}");
        if (body.model && body.messages) {
          return {
            ok: true,
            json: async () => ({
              choices: [{ message: { content: coachJson } }],
            }),
          };
        }
        return {
          ok: true,
          json: async () => ({ embedding: [1, 0, 0] }),
        };
      },
    },
  );

  assert.match(result.reply, /membrane/i);
  assert.equal(result.ragEnabled, true);
  assert.ok(Array.isArray(result.ragChunks));
  assert.equal(result.context.subject, "Science");
});
