import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, beforeEach, test } from "node:test";

const tempDir = mkdtempSync(join(tmpdir(), "littlecode-qb-quiz-"));
process.env.SQLITE_DATABASE_PATH = join(tempDir, "test.sqlite");

const db = await import("../lib/db.js");

before(() => {
  db.resetDatabaseForTests();
  db.getDb();
});

beforeEach(() => {
  const database = db.getDb();
  database.exec("DELETE FROM question_embeddings");
  database.exec("DELETE FROM question_bank_items");
});

after(() => {
  db.resetDatabaseForTests();
  rmSync(tempDir, { recursive: true, force: true });
});

import { resolveQuizProvider } from "../lib/openai-policy.js";
import { generateQuizFromQuestionBank } from "../lib/quiz-from-question-bank.js";

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

async function withEnvAsync(overrides, fn) {
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
    return await fn();
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

function insertQuestion({ focusLabel, question, difficulty = "core" }) {
  const database = db.getDb();
  database
    .prepare(
      `
      INSERT INTO question_bank_items (
        focus_label, year_level, subject, topic_key, subtopic, acara_codes,
        difficulty, question_style, question_json, content_hash, quality_status, source
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'published', 'test')
    `,
    )
    .run(
      focusLabel,
      "Year 7",
      "Science",
      "cells",
      "animal cells",
      "[]",
      difficulty,
      "mcq",
      JSON.stringify(question),
      `hash-${Math.random()}`,
    );
}

test("resolveQuizProvider uses question bank when DISABLE_OPENAI=true", () => {
  withEnv({ DISABLE_OPENAI: "true", QUIZ_PROVIDER: undefined }, () => {
    assert.equal(resolveQuizProvider(), "question_bank");
  });
});

test("generateQuizFromQuestionBank returns published questions without OpenAI", async () => {
  insertQuestion({
    focusLabel: "Cells › Animal cells",
    question: {
      question: "Which organelle controls the cell?",
      options: ["Nucleus", "Ribosome", "Vacuole", "Cell wall"],
      answer: "Nucleus",
      explanation: "The nucleus stores DNA.",
    },
  });
  insertQuestion({
    focusLabel: "Cells › Animal cells",
    question: {
      question: "Which organelle makes ATP?",
      options: ["Mitochondria", "Chloroplast", "Golgi", "Lysosome"],
      answer: "Mitochondria",
      explanation: "Mitochondria produce energy.",
    },
  });

  await withEnvAsync({ QUIZ_PROVIDER: "question_bank", OPENAI_API_KEY: "sk-test" }, async () => {
    const result = await generateQuizFromQuestionBank({
      yearLevel: "Year 7",
      subject: "Science",
      focus: "Cells › Animal cells",
      questionCount: 2,
      difficulty: "mixed",
      questionStyle: "worded",
    });

    assert.equal(result.source, "Question bank");
    assert.equal(result.quiz.questions.length, 2);
    assert.ok(result.quiz.questions.every((item) => item.question && item.answer));
  });
});

test("generateQuizFromQuestionBank fails clearly when bank is empty", async () => {
  await withEnvAsync({ QUIZ_PROVIDER: "question_bank" }, async () => {
    await assert.rejects(
      () =>
        generateQuizFromQuestionBank({
          yearLevel: "Year 7",
          subject: "Science",
          focus: "Cells › Animal cells",
          questionCount: 3,
        }),
      (error) => error.statusCode === 503 && /Question bank has only 0/.test(error.message),
    );
  });
});
