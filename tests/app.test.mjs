import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";

const tempDir = mkdtempSync(join(tmpdir(), "littlecode-images-"));
process.env.SQLITE_DATABASE_PATH = join(tempDir, "images-test.sqlite");

const { buildOpenAiPrompt, generateQuiz } = await import("../lib/ai.js");
const { createFallbackQuiz, fallbackCurriculum, getFocusesForYear, getYearLevels, validateQuizData } = await import("../lib/curriculum.js");
const { attachQuizImagesFromResponse, enrichQuestionImages, extractImagesFromResponsesPayload } = await import("../lib/images.js");
const { formatExplanationSteps } = await import("../lib/explanation-format.js");
const { ensureQuestionVisuals } = await import("../lib/question-display.js");
const { saveQuestionImage } = await import("../lib/question-images.js");
const db = await import("../lib/db.js");

before(() => {
  db.getDb();
});

after(() => {
  db.resetDatabaseForTests();
  rmSync(tempDir, { recursive: true, force: true });
});

test("fallback curriculum covers Year 7 Australian subject samples", () => {
  const subjects = Object.keys(fallbackCurriculum);
  assert.ok(subjects.length >= 6);

  for (const subject of subjects) {
    const data = fallbackCurriculum[subject];
    assert.ok(data.overview.includes("Year 7"));
    assert.ok(data.focuses.length >= 5);
    assert.ok(data.quiz.length >= 5);
  }
});

test("fallback quiz respects selected subject, focus, and question count", () => {
  const quiz = createFallbackQuiz({
    subject: "Science",
    focus: "Mixtures and separation",
    questionCount: 3,
    difficulty: "core",
    yearLevel: "Year 8",
  });

  assert.equal(quiz.subject, "Science");
  assert.equal(quiz.focus, "Mixtures and separation");
  assert.equal(quiz.yearLevel, "Year 8");
  assert.equal(quiz.questions.length, 3);
  assert.match(quiz.curriculumSummary, /Year 8 Science/);
});

test("OpenAI prompt requests strict Australian curriculum JSON quiz data", () => {
  const prompt = buildOpenAiPrompt({
    subject: "Mathematics",
    focus: "Linear relationships and graphing",
    questionCount: 4,
    difficulty: "extension",
    yearLevel: "Year 8",
    questionStyle: "mixed",
  });

  assert.match(prompt, /Australian Year 8/);
  assert.match(prompt, /Return only valid JSON/);
  assert.match(prompt, /Include exactly 4 multiple-choice questions/);
  assert.match(prompt, /Australian English/);
  assert.match(prompt, /Question style: mixed/);
  assert.match(prompt, /Linear relationships and graphing/);
  assert.match(prompt, /worded scenario or real-life problem/);
  assert.match(prompt, /plausible distractor options/);
  assert.match(prompt, /needsDiagram/);
  assert.match(prompt, /diagramPrompt/);
  assert.match(prompt, /diagramSpec/);
});

test("OpenAI prompt requests hybrid diagram marking without inline image generation", () => {
  const prompt = buildOpenAiPrompt(
    {
      subject: "Mathematics",
      focus: "Area and volume",
      questionCount: 5,
      difficulty: "mixed",
      yearLevel: "Year 8",
      questionStyle: "worded",
    },
    { includeDiagramMarking: true },
  );

  assert.match(prompt, /Do not call image_generation tools/);
  assert.match(prompt, /diagramSpec/);
  assert.match(prompt, /number_line/);
  assert.match(prompt, /diagramPrompt/);
  assert.match(prompt, /At most \d+ questions may use a non-empty "diagramPrompt"/);
});

test("Year 8 focus areas are available for quiz generation", () => {
  const scienceFocuses = getFocusesForYear("Science", "Year 8");
  assert.ok(scienceFocuses.some((item) => item.includes("Chemical change")));
  assert.ok(scienceFocuses.some((item) => item.includes(" — ")));

  const mathsFocuses = getFocusesForYear("Mathematics", "Year 8");
  assert.ok(mathsFocuses.some((item) => item.includes("Linear relationships")));
});

test("OpenAI prompt includes curriculum path context", () => {
  const prompt = buildOpenAiPrompt({
    subject: "Mathematics",
    focus: "Linear relationships — Plotting linear graphs",
    questionCount: 4,
    difficulty: "extension",
    yearLevel: "Year 8",
    questionStyle: "mixed",
  });

  assert.match(prompt, /Curriculum path/);
  assert.match(prompt, /Subtopic focus: Plotting linear graphs/);
});

test("year levels span Year 7 through VCE Year 12", () => {
  assert.deepEqual(getYearLevels(), ["Year 7", "Year 8", "Year 9", "Year 10", "Year 11", "Year 12"]);
  assert.ok(getFocusesForYear("Mathematics", "Year 12").some((focus) => /VCE/i.test(focus)));
});

test("validated quiz data normalizes a complete OpenAI-style response", () => {
  const quiz = validateQuizData({
    subject: "English",
    focus: "Persuasive techniques",
    yearLevel: "Year 7",
    curriculumSummary: "Students identify language choices in persuasive texts.",
    learningIntentions: ["Identify persuasive language."],
    questions: [
      {
        question: "Which option is an emotive phrase?",
        options: ["A fair chance", "On Tuesday", "Four desks", "A blue pen"],
        answer: "A fair chance",
        explanation: "The phrase appeals to values and emotion.",
        imagePrompt: "A short persuasive poster showing two contrasting campaign slogans.",
      },
    ],
  });

  assert.equal(quiz.questions[0].options.length, 4);
  assert.equal(quiz.questions[0].answer, "A fair chance");
  assert.match(quiz.questions[0].imagePrompt, /persuasive poster/);
});

test("quiz generation fails when OpenAI key is missing", async () => {
  const previousKey = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;

  try {
    await assert.rejects(
      () =>
        generateQuiz({
          subject: "Science",
          focus: "Mixtures and separation",
          questionCount: 3,
          difficulty: "core",
        }),
      /OPENAI_API_KEY is missing/,
    );
  } finally {
    if (previousKey) {
      process.env.OPENAI_API_KEY = previousKey;
    }
  }
});

test("explanation text is split into readable steps and self-correction noise is removed", () => {
  const steps = formatExplanationSteps(
    "Bottom area = 250 m²; Wall area = 140 m²; Total area = 390 m². Recalculate: None of the options match.",
  );

  assert.equal(steps.length, 3);
  assert.match(steps[0], /Bottom area/);
  assert.equal(steps.some((step) => /Recalculate/.test(step)), false);
});

test("unverified diagram placeholders are stripped before students see questions", () => {
  const [question] = ensureQuestionVisuals([
    {
      question: "Use the diagram.",
      options: ["A", "B", "C", "D"],
      answer: "A",
      explanation: "Step one.",
      imagePrompt: "Diagram of a rectangular swimming pool with labelled length, width, and depth.",
      imageUrl: "data:image/svg+xml;base64,placeholder",
      imageGenerated: "placeholder",
    },
  ]);

  assert.equal(question.imageUrl, "");
  assert.match(question.diagramPrompt, /swimming pool/);
  assert.match(question.imageError, /not generated/);
});

test("verified OpenAI diagrams are kept for display", () => {
  const [question] = ensureQuestionVisuals([
    {
      question: "Use the diagram.",
      options: ["A", "B", "C", "D"],
      answer: "A",
      explanation: "Step one.",
      imagePrompt: "Labelled bar graph.",
      imageUrl: "/api/quiz-media/1",
      imageGenerated: "openai",
    },
  ]);

  assert.equal(question.imageUrl, "/api/quiz-media/1");
});

test("quiz images from the same Responses payload attach to visual questions in order", async () => {
  const enriched = await attachQuizImagesFromResponse(
    [
      {
        question: "What is the volume?",
        options: ["A", "B", "C", "D"],
        answer: "A",
        explanation: "Step one.",
        imagePrompt: "",
      },
      {
        question: "A square of side 6 cm is joined to a rectangle of length 10 cm and width 6 cm.",
        options: ["96 cm²", "72 cm²", "60 cm²", "84 cm²"],
        answer: "96 cm²",
        explanation: "Area = 36 + 60.",
        imagePrompt: "Composite shape with square side 6 cm and rectangle 10 cm by 6 cm.",
      },
      {
        question: "A swimming pool is 25 m long, 10 m wide and 2 m deep.",
        options: ["900 m²", "700 m²", "850 m²", "650 m²"],
        answer: "700 m²",
        explanation: "Tile bottom and four walls.",
        imagePrompt: "Rectangular pool labelled 25 m, 10 m, and 2 m.",
      },
    ],
    {
      output: [
        { type: "message", content: [{ type: "output_text", text: "{}" }] },
        { type: "image_generation_call", result: Buffer.from("shape-image").toString("base64") },
        { type: "image_generation_call", result: Buffer.from("pool-image").toString("base64") },
      ],
    },
  );

  assert.equal(enriched[0].imageUrl, undefined);
  assert.match(enriched[1].imageUrl, /^\/api\/quiz-media\/\d+$/);
  assert.match(enriched[2].imageUrl, /^\/api\/quiz-media\/\d+$/);
  assert.equal(enriched[1].imageGenerated, "openai");
  assert.equal(enriched[2].imageGenerated, "openai");
});

test("missing generated diagrams are omitted instead of showing placeholders", async () => {
  const enriched = await attachQuizImagesFromResponse(
    [
      {
        question: "A swimming pool is 25 m long, 10 m wide and 2 m deep.",
        options: ["900 m²", "700 m²", "850 m²", "650 m²"],
        answer: "700 m²",
        explanation: "Tile bottom and four walls.",
        imagePrompt: "Rectangular pool labelled 25 m, 10 m, and 2 m.",
      },
    ],
    { output: [{ type: "message", content: [{ type: "output_text", text: "{}" }] }] },
  );

  assert.equal(enriched[0].imageUrl, "");
  assert.match(enriched[0].diagramPrompt, /pool labelled/);
  assert.match(enriched[0].imageError, /not generated|missing|No diagram was returned/i);
});

test("Responses API image_generation_call output is parsed into base64 image data", () => {
  const images = extractImagesFromResponsesPayload({
    output: [
      { type: "message", content: [{ type: "output_text", text: "done" }] },
      { type: "image_generation_call", result: "aGVsbG8=" },
    ],
  });

  assert.equal(images.length, 1);
  assert.equal(images[0], "aGVsbG8=");
});

test("generated question images are saved in SQLite and exposed by media URL", async () => {
  const imageUrl = saveQuestionImage(Buffer.from("generated-image"), "png");
  const imageId = db.extractQuizImageId(imageUrl);
  const stored = db.getQuizImage(imageId);

  assert.match(imageUrl, /^\/api\/quiz-media\/\d+$/);
  assert.equal(stored.imageData.toString(), "generated-image");

  const previousImageFlag = process.env.OPENAI_IMAGE_GENERATION;
  process.env.OPENAI_IMAGE_GENERATION = "false";

  try {
    const enriched = await enrichQuestionImages([
      {
        question: "Read the diagram.",
        options: ["A", "B", "C", "D"],
        answer: "A",
        explanation: "Use the diagram.",
        imagePrompt: "A labelled bar graph comparing rainfall in four cities.",
      },
    ]);

    assert.equal(enriched[0].imageUrl, "");
    assert.match(enriched[0].diagramPrompt, /bar graph/);
    assert.match(enriched[0].imageError, /not generated/);
  } finally {
    if (previousImageFlag === undefined) {
      delete process.env.OPENAI_IMAGE_GENERATION;
    } else {
      process.env.OPENAI_IMAGE_GENERATION = previousImageFlag;
    }
  }
});

test("quiz generation attaches diagrams in a follow-up image step", async () => {
  const previousKey = process.env.OPENAI_API_KEY;
  const previousFetch = globalThis.fetch;
  const previousSelfReview = process.env.QUIZ_LLM_SELF_REVIEW;
  const previousValidate = process.env.OPENAI_DIAGRAM_VALIDATE;
  process.env.OPENAI_API_KEY = "test-key";
  process.env.QUIZ_LLM_SELF_REVIEW = "false";
  process.env.OPENAI_DIAGRAM_VALIDATE = "false";

  let responseCalls = 0;
  globalThis.fetch = async (url) => {
    if (String(url).includes("/chat/completions")) {
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: "YES" } }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    responseCalls += 1;
    if (responseCalls === 1) {
      return new Response(
        JSON.stringify({
          output_text: JSON.stringify({
            subject: "Mathematics",
            focus: "Area and volume",
            yearLevel: "Year 8",
            curriculumSummary: "Students calculate area and surface area.",
            learningIntentions: ["Calculate composite area."],
            questions: [
              {
                question: "A square of side 6 cm is joined to a rectangle of length 10 cm and width 6 cm.",
                options: ["96 cm²", "72 cm²", "60 cm²", "84 cm²"],
                answer: "96 cm²",
                explanation: "Square area = 36 cm².\nRectangle area = 60 cm².\nTotal = 96 cm².",
                needsDiagram: true,
                diagramPrompt: "Composite shape with square side 6 cm and rectangle 10 cm by 6 cm.",
              },
            ],
          }),
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    return new Response(
      JSON.stringify({
        output: [{ type: "image_generation_call", result: Buffer.from("generated-image").toString("base64") }],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };

  try {
    const generated = await generateQuiz({
      subject: "Mathematics",
      focus: "Area and volume",
      questionCount: 1,
      difficulty: "core",
      yearLevel: "Year 8",
      questionStyle: "worded",
    });

    assert.equal(responseCalls, 2);
    assert.equal(generated.quiz.questions.length, 1);
    assert.match(generated.quiz.questions[0].imageUrl, /^\/api\/quiz-media\/\d+$/);
    assert.equal(generated.quiz.questions[0].imageGenerated, "openai");
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey) {
      process.env.OPENAI_API_KEY = previousKey;
    } else {
      delete process.env.OPENAI_API_KEY;
    }
    if (previousSelfReview === undefined) {
      delete process.env.QUIZ_LLM_SELF_REVIEW;
    } else {
      process.env.QUIZ_LLM_SELF_REVIEW = previousSelfReview;
    }
    if (previousValidate === undefined) {
      delete process.env.OPENAI_DIAGRAM_VALIDATE;
    } else {
      process.env.OPENAI_DIAGRAM_VALIDATE = previousValidate;
    }
  }
});

test("quiz generation fails instead of falling back when OpenAI returns an error", async () => {
  const previousKey = process.env.OPENAI_API_KEY;
  const previousFetch = globalThis.fetch;
  const previousRetryDelay = process.env.OPENAI_RETRY_BASE_DELAY_MS;
  process.env.OPENAI_API_KEY = "test-key";
  process.env.OPENAI_RETRY_BASE_DELAY_MS = "0";
  globalThis.fetch = async () =>
    new Response("quota exceeded", {
      status: 429,
      statusText: "Too Many Requests",
    });

  try {
    await assert.rejects(
      () =>
        generateQuiz({
          subject: "Science",
          focus: "Mixtures and separation",
          questionCount: 3,
          difficulty: "core",
        }),
      /AI service temporarily unavailable, please try again in a minute/,
    );
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey) {
      process.env.OPENAI_API_KEY = previousKey;
    } else {
      delete process.env.OPENAI_API_KEY;
    }
    if (previousRetryDelay) {
      process.env.OPENAI_RETRY_BASE_DELAY_MS = previousRetryDelay;
    } else {
      delete process.env.OPENAI_RETRY_BASE_DELAY_MS;
    }
  }
});
