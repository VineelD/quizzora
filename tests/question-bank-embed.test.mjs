import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, beforeEach, describe, test } from "node:test";

const tempDir = mkdtempSync(join(tmpdir(), "littlecode-qb-embed-"));
process.env.SQLITE_DATABASE_PATH = join(tempDir, "test.sqlite");
process.env.OLLAMA_EMBED_MODEL = "nomic-embed-text";

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

import { buildQuestionBankEmbedText } from "../lib/question-bank-embed-text.js";
import { blobToEmbedding, embeddingToBlob } from "../lib/ollama-embeddings.js";
import {
  embedQuestionBankItems,
  getQuestionEmbeddingStats,
  hashEmbedText,
  upsertQuestionEmbedding,
} from "../lib/question-bank-embed.js";
import { searchQuestionBank } from "../lib/question-bank-retrieve.js";

function insertPublishedItem(question) {
  const database = db.getDb();
  const result = database
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
      "Year 7 Science — Cells",
      "Year 7",
      "Science",
      "cells",
      "cell structure",
      "[]",
      "core",
      "mcq",
      JSON.stringify(question),
      `hash-${Math.random()}`,
    );
  return Number(result.lastInsertRowid);
}

function mockFetchFactory(vectors) {
  return async (url, init) => {
    if (String(url).includes("/api/tags")) {
      return {
        ok: true,
        async json() {
          return { models: [{ name: "nomic-embed-text" }] };
        },
      };
    }

    const body = JSON.parse(init.body);
    const prompt = body.prompt;
    const vector = vectors[prompt] || vectors.default || [1, 0, 0];
    return {
      ok: true,
      async json() {
        return { embedding: vector };
      },
    };
  };
}

test("buildQuestionBankEmbedText includes coach fields", () => {
  const text = buildQuestionBankEmbedText({
    focusLabel: "Year 7 Science",
    question: {
      question: "What is the nucleus?",
      options: ["A", "B", "C", "D"],
      answer: "A",
      explanation: "The nucleus controls the cell.",
    },
    mode: "coach",
  });
  assert.match(text, /What is the nucleus/);
  assert.match(text, /Answer: A/);
  assert.match(text, /Explanation:/);
});

test("embedding blob round-trip", () => {
  const encoded = embeddingToBlob([0.5, -0.25, 1]);
  const decoded = blobToEmbedding(encoded);
  assert.deepEqual(decoded.map((value) => Math.round(value * 1000)), [500, -250, 1000]);
});

test("embedQuestionBankItems stores vectors for published items", async () => {
  const question = {
    question: "Which organelle makes energy?",
    options: ["Nucleus", "Mitochondria", "Ribosome", "Vacuole"],
    answer: "Mitochondria",
    explanation: "Mitochondria produce ATP.",
  };
  const text = buildQuestionBankEmbedText({
    focusLabel: "Year 7 Science — Cells",
    question,
    mode: "coach",
  });
  const questionId = insertPublishedItem(question);

  const fetchImpl = mockFetchFactory({
    [text]: [1, 0, 0],
    "energy organelle": [0.95, 0.05, 0],
    default: [0, 1, 0],
  });

  const result = await embedQuestionBankItems({ limit: 10, fetchImpl });
  assert.equal(result.embedded, 1);

  const stats = getQuestionEmbeddingStats();
  assert.equal(stats.embedded, 1);
  assert.equal(stats.published, 1);

  const row = db
    .getDb()
    .prepare("SELECT dimensions, text_hash FROM question_embeddings WHERE question_id = ?")
    .get(questionId);
  assert.equal(row.dimensions, 3);
  assert.equal(row.text_hash, hashEmbedText(text));
});

test("searchQuestionBank returns highest-scoring match", async () => {
  const mitochondria = {
    question: "Which organelle makes energy?",
    options: ["Nucleus", "Mitochondria", "Ribosome", "Vacuole"],
    answer: "Mitochondria",
    explanation: "Mitochondria produce ATP.",
  };
  const nucleus = {
    question: "Which part stores DNA?",
    options: ["Nucleus", "Mitochondria", "Ribosome", "Vacuole"],
    answer: "Nucleus",
    explanation: "DNA lives in the nucleus.",
  };

  const mitoText = buildQuestionBankEmbedText({
    focusLabel: "Year 7 Science — Cells",
    question: mitochondria,
    mode: "coach",
  });
  const nucleusText = buildQuestionBankEmbedText({
    focusLabel: "Year 7 Science — Cells",
    question: nucleus,
    mode: "coach",
  });

  const mitoId = insertPublishedItem(mitochondria);
  const nucleusId = insertPublishedItem(nucleus);

  upsertQuestionEmbedding({
    questionId: mitoId,
    embedding: [1, 0, 0],
    model: "nomic-embed-text",
    textHash: hashEmbedText(mitoText),
  });
  upsertQuestionEmbedding({
    questionId: nucleusId,
    embedding: [0, 1, 0],
    model: "nomic-embed-text",
    textHash: hashEmbedText(nucleusText),
  });

  const fetchImpl = mockFetchFactory({
    "energy in cells": [0.98, 0.02, 0],
    default: [0, 0, 1],
  });

  const results = await searchQuestionBank({
    query: "energy in cells",
    yearLevel: "Year 7",
    subject: "Science",
    limit: 2,
    fetchImpl,
  });

  assert.ok(results.length >= 1);
  assert.equal(results[0].questionId, mitoId);
  assert.ok(results[0].score > 0.9);
  assert.equal(results[0].question.answer, "Mitochondria");
});
