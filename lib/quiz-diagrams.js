import {
  buildEducationalDiagramPrompt,
  buildResponsesImageTool,
  extractImagesFromResponsesPayload,
  parseImageDimensions,
} from "./images.js";
import { cacheDiagramImage, getCachedDiagramImageUrl } from "./diagram-image-cache.js";
import { generateValidatedDiagramImage } from "./diagram-image-validate.js";
import { stripUnverifiedVisual } from "./question-display.js";
import { fetchOpenAiWithRetry, resolveOpenAiRetryOptions } from "./openai-errors.js";
import {
  normalizeDiagramSpec,
  preferAiDiagramForStep,
  resolveStepDiagramPrompt,
  shouldSkipImageGeneration,
  stepNeedsGeneratedImage,
} from "./study-diagram-render.js";
import { resolveQuizProvider } from "./openai-policy.js";

export function quizQualityFirstEnabled() {
  return process.env.QUIZ_QUALITY_FIRST === "true";
}

/** 0 = unlimited. When QUIZ_QUALITY_FIRST=true and unset, default to unlimited. */
export function maxDiagramsPerQuiz() {
  const configured = Number(process.env.QUIZ_MAX_DIAGRAMS_PER_QUIZ);
  if (Number.isFinite(configured) && configured >= 0) {
    return Math.round(configured);
  }
  if (quizQualityFirstEnabled()) {
    return 0;
  }
  return 8;
}

export function quizImageGenerationEnabled() {
  if (process.env.DISABLE_OPENAI === "true" || resolveQuizProvider() === "question_bank") {
    return false;
  }
  return process.env.OPENAI_IMAGE_GENERATION !== "false";
}

export function normalizeQuestionDiagramFields(question) {
  const diagramPrompt = String(question.diagramPrompt || question.imagePrompt || "").trim();
  const diagramSpec = normalizeDiagramSpec(question.diagramSpec);
  const diagramMermaid = String(question.diagramMermaid || "").trim();
  const needsDiagram =
    Boolean(question.needsDiagram) ||
    Boolean(diagramPrompt) ||
    Boolean(diagramSpec) ||
    Boolean(diagramMermaid);

  return {
    ...question,
    needsDiagram,
    diagramPrompt,
    imagePrompt: diagramPrompt,
    ...(diagramSpec ? { diagramSpec } : {}),
    ...(diagramMermaid ? { diagramMermaid } : {}),
  };
}

export function questionNeedsGeneratedImage(question) {
  const normalized = normalizeQuestionDiagramFields(question);
  if (!normalized.needsDiagram) {
    return false;
  }
  if (shouldSkipImageGeneration(normalized, "quiz")) {
    return false;
  }

  const prompt = resolveStepDiagramPrompt(normalized, "quiz");
  return Boolean(prompt) && !normalized.imageUrl?.trim();
}

export function prioritizeDiagramQuestions(questions) {
  return questions
    .map((question, index) => ({ question: normalizeQuestionDiagramFields(question), index }))
    .filter(({ question }) => questionNeedsGeneratedImage(question))
    .sort((left, right) => {
      const leftScore = (left.question.needsDiagram ? 2 : 0) + (left.question.diagramPrompt ? 1 : 0);
      const rightScore = (right.question.needsDiagram ? 2 : 0) + (right.question.diagramPrompt ? 1 : 0);
      return rightScore - leftScore || left.index - right.index;
    });
}

export function selectQuestionsForImageGeneration(questions, limit = maxDiagramsPerQuiz()) {
  const prioritized = prioritizeDiagramQuestions(questions);
  if (limit === 0) {
    return prioritized;
  }
  return prioritized.slice(0, Math.max(0, limit));
}

function buildQuizDiagramInput(question, context) {
  const prompt = resolveStepDiagramPrompt(question, context);
  return buildEducationalDiagramPrompt({
    subject: context.subject || "Science",
    yearLevel: context.yearLevel || "Year 7",
    focus: context.focus || "",
    brief: prompt,
    diagramType: question.diagramType || question.diagramSpec?.diagramType || "generic",
    labels: Array.isArray(question.diagramLabels) ? question.diagramLabels : [],
    title: question.diagramTitle || "",
    caption: question.diagramCaption || "",
  });
}

async function requestQuizDiagramImage(diagramInput, diagramType) {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return null;
  }

  const body = {
    model:
      process.env.OPENAI_DIAGRAM_MODEL ||
      process.env.OPENAI_MODEL ||
      "gpt-4o-mini",
    input: diagramInput,
    tools: [buildResponsesImageTool({ diagramType })],
    temperature: 0.3,
  };

  const response = await fetchOpenAiWithRetry(
    process.env.OPENAI_ENDPOINT || "https://api.openai.com/v1/responses",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
    resolveOpenAiRetryOptions(),
  );

  if (!response.ok) {
    return null;
  }

  const payload = await response.json();
  const images = extractImagesFromResponsesPayload(payload);
  if (!images.length) {
    return null;
  }

  return images[0];
}

export async function generateQuizDiagram(question, context) {
  if (!quizImageGenerationEnabled()) {
    return null;
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return null;
  }

  const prompt = resolveStepDiagramPrompt(question, context);
  if (!prompt) {
    return null;
  }

  const diagramType = question.diagramType || question.diagramSpec?.diagramType || "generic";
  const size = buildResponsesImageTool({ diagramType }).size;
  const { width: imageWidth, height: imageHeight } = parseImageDimensions(size);
  const diagramInput = buildQuizDiagramInput(question, context);

  const cachedUrl = getCachedDiagramImageUrl(diagramInput);
  if (cachedUrl) {
    return {
      imageUrl: cachedUrl,
      imageAlt: prompt,
      imageError: "",
      imageGenerated: "openai",
      imageWidth,
      imageHeight,
    };
  }

  const validated = await generateValidatedDiagramImage({
    diagramPrompt: prompt,
    diagramType,
    apiKey,
    generateOnce: async (refinedPrompt) => {
      const imageBase64 = await requestQuizDiagramImage(
        buildEducationalDiagramPrompt({
          subject: context.subject || "Science",
          yearLevel: context.yearLevel || "Year 7",
          focus: context.focus || "",
          brief: refinedPrompt,
          diagramType,
          labels: Array.isArray(question.diagramLabels) ? question.diagramLabels : [],
          title: question.diagramTitle || "",
          caption: question.diagramCaption || "",
        }),
        diagramType,
      );
      if (!imageBase64) {
        return null;
      }
      return { imageBase64 };
    },
  });

  if (!validated?.imageBase64) {
    return null;
  }

  const buffer = Buffer.from(validated.imageBase64, "base64");
  return {
    imageUrl: cacheDiagramImage(diagramInput, buffer, "png"),
    imageAlt: prompt,
    imageError: "",
    imageGenerated: "openai",
    imageWidth,
    imageHeight,
  };
}

export function buildQuizDiagramReport(questions) {
  const rows = [];
  if (!Array.isArray(questions)) {
    return { notes: [], failedCount: 0, skippedCount: 0, needsAttention: false, summary: "" };
  }

  questions.forEach((question, index) => {
    const label = `Question ${index + 1}`;
    if (question?.imageSkipped) {
      rows.push(`${label}: diagram skipped — ${question.imageError || "not generated"}`);
      return;
    }
    if (question?.imageError && !question?.imageUrl?.trim()) {
      rows.push(`${label}: diagram unavailable — ${question.imageError}`);
    }
  });

  const skippedCount = questions.filter((question) => question?.imageSkipped).length;
  const failedCount = questions.filter(
    (question) => question?.imageError && !question?.imageUrl?.trim() && !question?.imageSkipped,
  ).length;

  return {
    notes: rows,
    skippedCount,
    failedCount,
    needsAttention: rows.length > 0,
    summary: rows.length
      ? `${rows.length} diagram issue${rows.length === 1 ? "" : "s"} — see notes below.`
      : "All requested diagrams generated successfully.",
  };
}

export async function attachDiagramsToQuizQuestions(questions, context = {}) {
  const normalized = questions.map(normalizeQuestionDiagramFields);
  const targetIndexes = new Set(selectQuestionsForImageGeneration(normalized).map((item) => item.index));
  const cap = maxDiagramsPerQuiz();

  if (!quizImageGenerationEnabled()) {
    return normalized.map((question) => {
      if (questionNeedsGeneratedImage(question)) {
        return stripUnverifiedVisual({
          ...question,
          imageError: "Diagram generation is disabled on this server (OPENAI_IMAGE_GENERATION=false).",
          imageSkipped: true,
        });
      }
      return stripUnverifiedVisual(question);
    });
  }

  const enriched = normalized.map((question, index) => {
    if (!questionNeedsGeneratedImage(question)) {
      return stripUnverifiedVisual(question);
    }
    if (cap > 0 && !targetIndexes.has(index)) {
      return stripUnverifiedVisual({
        ...question,
        imageError: `Diagram not generated — quiz cap of ${cap} illustrations per quiz.`,
        imageSkipped: true,
      });
    }
    return question;
  });

  const targets = [...targetIndexes].map((index) => ({ question: enriched[index], index }));
  const results = await Promise.all(
    targets.map(async ({ question, index }) => {
      const diagram = await generateQuizDiagram(question, context);
      if (!diagram) {
        return { index, failed: true };
      }
      return { index, diagram, stripSpec: preferAiDiagramForStep(question, "quiz") };
    }),
  );

  for (const result of results) {
    if (result.failed) {
      enriched[result.index] = stripUnverifiedVisual({
        ...enriched[result.index],
        imageError: "Diagram was not generated for this question.",
      });
      continue;
    }

    enriched[result.index] = {
      ...enriched[result.index],
      ...result.diagram,
      imagePrompt: resolveStepDiagramPrompt(enriched[result.index], context),
      ...(result.stripSpec
        ? {
            diagramSpec: undefined,
            diagramMermaid: "",
          }
        : {}),
    };
  }

  return enriched.map((question, index) => {
    if (targetIndexes.has(index) && results.some((result) => result.index === index && !result.failed)) {
      return question;
    }
    if (question.imageGenerated === "openai" && question.imageUrl?.trim()) {
      return question;
    }
    return stripUnverifiedVisual(question);
  });
}
