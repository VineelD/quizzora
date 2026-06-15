import assert from "node:assert/strict";
import { test } from "node:test";
import { chunkCurriculumText } from "../lib/curriculum-doc-chunk.js";
import {
  blobToEmbedding,
  cosineSimilarity,
  embeddingToBlob,
} from "../lib/ollama-embeddings.js";
import {
  formatRagChunksForPrompt,
  isStudyCoachRagEnabled,
  rankChunksBySimilarity,
} from "../lib/curriculum-doc-retrieve.js";
import { buildStudyCoachSystemPrompt } from "../lib/study-coach.js";
import { buildStudyCoachChatMessages } from "../lib/study-coach-llm.js";

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

test("chunkCurriculumText splits long docs with overlap", () => {
  const paragraph = "Concept sentence with vocabulary. ".repeat(120);
  const chunks = chunkCurriculumText(`${paragraph}\n\n${paragraph}`, {
    minTokens: 100,
    maxTokens: 150,
    overlapTokens: 20,
  });
  assert.ok(chunks.length >= 2);
  assert.ok(chunks.every((chunk) => chunk.length > 0));
});

test("cosineSimilarity and embedding blob round-trip", () => {
  const vector = [1, 0, 0];
  const blob = embeddingToBlob(vector);
  const restored = blobToEmbedding(blob);
  assert.deepEqual(restored, vector);
  assert.equal(cosineSimilarity(vector, [1, 0, 0]), 1);
  assert.ok(cosineSimilarity(vector, [0, 1, 0]) < 0.01);
});

test("rankChunksBySimilarity orders by score", () => {
  const query = [1, 0];
  const rows = [
    { id: 1, focus_label: "a", year_level: "Year 7", subject: "Science", subtopic: "A", chunk_index: 0, content: "A", embedding: embeddingToBlob([0, 1]) },
    { id: 2, focus_label: "b", year_level: "Year 7", subject: "Science", subtopic: "B", chunk_index: 0, content: "B", embedding: embeddingToBlob([1, 0]) },
  ];
  const ranked = rankChunksBySimilarity(rows, query);
  assert.equal(ranked[0].id, 2);
  assert.ok(ranked[0].score > ranked[1].score);
});

test("searchCurriculumDocs skips query embed when candidates fit within topK", async () => {
  let embedCalls = 0;
  const fetchImpl = async (url, init) => {
    if (String(url).includes("/api/embeddings")) {
      embedCalls += 1;
      throw new Error("embed should not run");
    }
    return fetch(url, init);
  };

  const { searchCurriculumDocs } = await import("../lib/curriculum-doc-retrieve.js");
  const { getDb } = await import("../lib/db.js");
  const db = getDb();
  const focusLabel = "RAG skip-embed test focus";
  db.prepare("DELETE FROM curriculum_doc_chunks WHERE focus_label = ?").run(focusLabel);
  db.prepare(
    `
    INSERT INTO curriculum_doc_chunks (
      focus_label, year_level, subject, topic_key, subtopic, chunk_index, content, embedding, model
    ) VALUES (?, 'Year 7', 'Science', 'test', 'Test', 0, 'Chunk A', ?, 'nomic-embed-text')
    `,
  ).run(focusLabel, embeddingToBlob([1, 0, 0]));
  db.prepare(
    `
    INSERT INTO curriculum_doc_chunks (
      focus_label, year_level, subject, topic_key, subtopic, chunk_index, content, embedding, model
    ) VALUES (?, 'Year 7', 'Science', 'test', 'Test', 1, 'Chunk B', ?, 'nomic-embed-text')
    `,
  ).run(focusLabel, embeddingToBlob([0, 1, 0]));

  const results = await searchCurriculumDocs(
    { focusLabel, query: "What is friction?", limit: 4 },
    { fetchImpl },
  );

  assert.equal(embedCalls, 0);
  assert.equal(results.length, 2);
  assert.equal(results[0].chunkIndex, 0);
  assert.equal(results[1].chunkIndex, 1);
  db.prepare("DELETE FROM curriculum_doc_chunks WHERE focus_label = ?").run(focusLabel);
});

test("formatRagChunksForPrompt respects max length", () => {
  const prompt = formatRagChunksForPrompt(
    [
      { subtopic: "Forces", content: "Gravity pulls objects toward Earth." },
      { subtopic: "Friction", content: "Friction opposes motion between surfaces." },
    ],
    { maxChars: 500 },
  );
  assert.match(prompt, /Gravity pulls/);
  assert.ok(prompt.length <= 500);
});

test("isStudyCoachRagEnabled reads env flag", () => {
  withEnv({ STUDY_COACH_RAG_ENABLED: "true" }, () => {
    assert.equal(isStudyCoachRagEnabled(), true);
  });
  withEnv({ STUDY_COACH_RAG_ENABLED: undefined }, () => {
    assert.equal(isStudyCoachRagEnabled(), false);
  });
});

test("buildStudyCoachSystemPrompt injects rag context when provided", () => {
  const prompt = buildStudyCoachSystemPrompt(
    {
      yearLevel: "Year 7",
      subject: "Science",
      focus: "Forces and motion › Friction and gravity",
      curriculumSummary: "Forces summary",
      learningIntentions: ["Explain friction"],
    },
    { ragContext: "Friction reduces motion on rough surfaces." },
  );
  assert.match(prompt, /Friction reduces motion/);
});

test("buildStudyCoachChatMessages passes rag context into system prompt", () => {
  const messages = buildStudyCoachChatMessages({
    context: {
      yearLevel: "Year 7",
      subject: "Science",
      focus: "Forces and motion › Friction and gravity",
      curriculumSummary: "Forces summary",
      learningIntentions: [],
      selectedTopicKeys: [],
      selectedSubtopics: [],
    },
    history: [],
    message: "What is friction?",
    ragContext: "Friction opposes relative motion.",
  });
  assert.equal(messages[0].role, "system");
  assert.match(messages[0].content, /Friction opposes relative motion/);
});
