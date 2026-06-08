import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";

const tempDir = mkdtempSync(join(tmpdir(), "littlecode-quiz-diagrams-"));
process.env.SQLITE_DATABASE_PATH = join(tempDir, "test.sqlite");

const db = await import("../lib/db.js");
const quizDiagrams = await import("../lib/quiz-diagrams.js");
const { hasClientQuizDiagram, hasQuizVisual } = await import("../lib/question-display.js");

before(() => {
  db.getDb();
});

after(() => {
  db.resetDatabaseForTests();
  rmSync(tempDir, { recursive: true, force: true });
});

test("normalizeQuestionDiagramFields maps needsDiagram and diagramPrompt", () => {
  const normalized = quizDiagrams.normalizeQuestionDiagramFields({
    question: "Label the cell.",
    needsDiagram: true,
    diagramPrompt: "Labelled animal cell with nucleus and mitochondria.",
    imagePrompt: "",
  });

  assert.equal(normalized.needsDiagram, true);
  assert.match(normalized.diagramPrompt, /animal cell/);
  assert.equal(normalized.imagePrompt, normalized.diagramPrompt);
});

test("maxDiagramsPerQuiz defaults to 8 when quality-first is off", () => {
  const previousQuality = process.env.QUIZ_QUALITY_FIRST;
  const previousCap = process.env.QUIZ_MAX_DIAGRAMS_PER_QUIZ;
  delete process.env.QUIZ_QUALITY_FIRST;
  delete process.env.QUIZ_MAX_DIAGRAMS_PER_QUIZ;

  assert.equal(quizDiagrams.maxDiagramsPerQuiz(), 8);

  if (previousQuality === undefined) {
    delete process.env.QUIZ_QUALITY_FIRST;
  } else {
    process.env.QUIZ_QUALITY_FIRST = previousQuality;
  }
  if (previousCap === undefined) {
    delete process.env.QUIZ_MAX_DIAGRAMS_PER_QUIZ;
  } else {
    process.env.QUIZ_MAX_DIAGRAMS_PER_QUIZ = previousCap;
  }
});

test("maxDiagramsPerQuiz defaults to unlimited when QUIZ_QUALITY_FIRST=true", () => {
  const previousQuality = process.env.QUIZ_QUALITY_FIRST;
  const previousCap = process.env.QUIZ_MAX_DIAGRAMS_PER_QUIZ;
  process.env.QUIZ_QUALITY_FIRST = "true";
  delete process.env.QUIZ_MAX_DIAGRAMS_PER_QUIZ;

  assert.equal(quizDiagrams.maxDiagramsPerQuiz(), 0);

  if (previousQuality === undefined) {
    delete process.env.QUIZ_QUALITY_FIRST;
  } else {
    process.env.QUIZ_QUALITY_FIRST = previousQuality;
  }
  if (previousCap === undefined) {
    delete process.env.QUIZ_MAX_DIAGRAMS_PER_QUIZ;
  } else {
    process.env.QUIZ_MAX_DIAGRAMS_PER_QUIZ = previousCap;
  }
});

test("selectQuestionsForImageGeneration selects all visual questions when cap is zero", () => {
  const previous = process.env.QUIZ_MAX_DIAGRAMS_PER_QUIZ;
  process.env.QUIZ_MAX_DIAGRAMS_PER_QUIZ = "0";

  const questions = [
    { question: "Q1", needsDiagram: true, diagramPrompt: "Cell diagram" },
    { question: "Q2", needsDiagram: true, diagramPrompt: "Circuit diagram" },
    { question: "Q3", needsDiagram: true, diagramPrompt: "Map diagram" },
  ];

  const selected = quizDiagrams.selectQuestionsForImageGeneration(questions);
  assert.equal(selected.length, 3);

  if (previous === undefined) {
    delete process.env.QUIZ_MAX_DIAGRAMS_PER_QUIZ;
  } else {
    process.env.QUIZ_MAX_DIAGRAMS_PER_QUIZ = previous;
  }
});

test("resolveOpenAiImageQuality returns high when QUIZ_QUALITY_FIRST=true", async () => {
  const { resolveOpenAiImageQuality, buildResponsesImageTool } = await import("../lib/images.js");
  const previousQuality = process.env.QUIZ_QUALITY_FIRST;
  const previousImage = process.env.OPENAI_IMAGE_QUALITY;

  delete process.env.OPENAI_IMAGE_QUALITY;
  process.env.QUIZ_QUALITY_FIRST = "true";
  assert.equal(resolveOpenAiImageQuality(), "high");
  assert.equal(buildResponsesImageTool().quality, "high");

  process.env.OPENAI_IMAGE_QUALITY = "low";
  assert.equal(resolveOpenAiImageQuality(), "low");

  process.env.OPENAI_IMAGE_QUALITY = "high";
  assert.equal(resolveOpenAiImageQuality(), "high");

  if (previousQuality === undefined) {
    delete process.env.QUIZ_QUALITY_FIRST;
  } else {
    process.env.QUIZ_QUALITY_FIRST = previousQuality;
  }
  if (previousImage === undefined) {
    delete process.env.OPENAI_IMAGE_QUALITY;
  } else {
    process.env.OPENAI_IMAGE_QUALITY = previousImage;
  }
});

test("selectQuestionsForImageGeneration respects QUIZ_MAX_DIAGRAMS_PER_QUIZ", () => {
  const previous = process.env.QUIZ_MAX_DIAGRAMS_PER_QUIZ;
  process.env.QUIZ_MAX_DIAGRAMS_PER_QUIZ = "2";

  const questions = [
    { question: "Q1", needsDiagram: true, diagramPrompt: "Cell diagram" },
    { question: "Q2", needsDiagram: true, diagramPrompt: "Circuit diagram" },
    { question: "Q3", needsDiagram: true, diagramPrompt: "Map diagram" },
    {
      question: "Q4",
      needsDiagram: true,
      diagramSpec: { diagramType: "number_line", min: 0, max: 10, points: [3] },
    },
  ];

  const selected = quizDiagrams.selectQuestionsForImageGeneration(questions);
  assert.equal(selected.length, 2);
  assert.equal(selected[0].index, 0);
  assert.equal(selected[1].index, 1);

  if (previous === undefined) {
    delete process.env.QUIZ_MAX_DIAGRAMS_PER_QUIZ;
  } else {
    process.env.QUIZ_MAX_DIAGRAMS_PER_QUIZ = previous;
  }
});

test("buildQuizDiagramReport notes skipped and failed diagrams", () => {
  const report = quizDiagrams.buildQuizDiagramReport([
    { question: "Q1", imageUrl: "/api/quiz-media/1", imageGenerated: "openai" },
    { question: "Q2", imageSkipped: true, imageError: "Quiz cap reached." },
    { question: "Q3", imageError: "Diagram was not generated for this question." },
  ]);

  assert.equal(report.skippedCount, 1);
  assert.equal(report.failedCount, 1);
  assert.equal(report.notes.length, 2);
  assert.match(report.notes[0], /skipped/);
  assert.match(report.notes[1], /unavailable/);
});

test("attachDiagramsToQuizQuestions skips image generation when disabled", async () => {
  const previous = process.env.OPENAI_IMAGE_GENERATION;
  process.env.OPENAI_IMAGE_GENERATION = "false";

  const enriched = await quizDiagrams.attachDiagramsToQuizQuestions(
    [
      {
        question: "Use the diagram.",
        options: ["A", "B", "C", "D"],
        answer: "A",
        explanation: "Step one.",
        needsDiagram: true,
        diagramPrompt: "Labelled plant cell.",
      },
    ],
    { subject: "Science", yearLevel: "Year 8", focus: "Cells" },
  );

  assert.equal(enriched[0].imageUrl, "");
  assert.match(enriched[0].imageError, /OPENAI_IMAGE_GENERATION=false/);

  if (previous === undefined) {
    delete process.env.OPENAI_IMAGE_GENERATION;
  } else {
    process.env.OPENAI_IMAGE_GENERATION = previous;
  }
});

test("attachDiagramsToQuizQuestions keeps diagramSpec without image generation when AI diagrams disabled", async () => {
  const previousKey = process.env.OPENAI_API_KEY;
  const previousPrefer = process.env.QUIZ_PREFER_AI_DIAGRAMS;
  delete process.env.OPENAI_API_KEY;
  process.env.QUIZ_PREFER_AI_DIAGRAMS = "false";

  const enriched = await quizDiagrams.attachDiagramsToQuizQuestions(
    [
      {
        question: "Which value is on the number line?",
        options: ["A", "B", "C", "D"],
        answer: "A",
        explanation: "Read the point.",
        needsDiagram: true,
        diagramSpec: { diagramType: "number_line", min: 0, max: 10, points: [4] },
      },
    ],
    { subject: "Mathematics", yearLevel: "Year 7", focus: "Number" },
  );

  assert.equal(enriched[0].diagramSpec.diagramType, "number_line");
  assert.equal(enriched[0].imageUrl, "");
  assert.ok(hasClientQuizDiagram(enriched[0]));
  assert.ok(hasQuizVisual(enriched[0]));

  if (previousKey) {
    process.env.OPENAI_API_KEY = previousKey;
  }
  if (previousPrefer === undefined) {
    delete process.env.QUIZ_PREFER_AI_DIAGRAMS;
  } else {
    process.env.QUIZ_PREFER_AI_DIAGRAMS = previousPrefer;
  }
});

test("attachDiagramsToQuizQuestions generates and caches quiz diagrams", async () => {
  const previousKey = process.env.OPENAI_API_KEY;
  const previousFetch = globalThis.fetch;
  process.env.OPENAI_API_KEY = "test-key";

  let fetchCalls = 0;
  globalThis.fetch = async (url) => {
    fetchCalls += 1;
    if (String(url).includes("/chat/completions")) {
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: "YES" } }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    return new Response(
      JSON.stringify({
        output: [{ type: "image_generation_call", result: Buffer.from("quiz-diagram").toString("base64") }],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };

  const questions = [
    {
      question: "Identify the organelle.",
      options: ["A", "B", "C", "D"],
      answer: "A",
      explanation: "Use the diagram.",
      needsDiagram: true,
      diagramPrompt: "Labelled animal cell with nucleus.",
    },
  ];

  const first = await quizDiagrams.attachDiagramsToQuizQuestions(questions, {
    subject: "Science",
    yearLevel: "Year 8",
    focus: "Cells",
  });

  assert.ok(fetchCalls >= 1);
  assert.match(first[0].imageUrl, /^\/api\/quiz-media\/\d+$/);
  assert.equal(first[0].imageGenerated, "openai");

  fetchCalls = 0;
  const second = await quizDiagrams.attachDiagramsToQuizQuestions(questions, {
    subject: "Science",
    yearLevel: "Year 8",
    focus: "Cells",
  });

  assert.equal(fetchCalls, 0);
  assert.equal(second[0].imageUrl, first[0].imageUrl);

  globalThis.fetch = previousFetch;
  if (previousKey) {
    process.env.OPENAI_API_KEY = previousKey;
  } else {
    delete process.env.OPENAI_API_KEY;
  }
});
