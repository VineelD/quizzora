import { saveQuestionImage } from "./question-images.js";
import { stripUnverifiedVisual } from "./question-display.js";
import { updateQuizQuestions } from "./db.js";
import { aspectLayoutHint, parseImageDimensions, resolveImageSizeForDiagramType } from "./diagram-image-validate.js";
import { diagramTypeHint } from "./study-diagram-meta.js";

export { parseImageDimensions, resolveImageSizeForDiagramType } from "./diagram-image-validate.js";

export function quizQualityFirstEnabled() {
  return process.env.QUIZ_QUALITY_FIRST === "true";
}

/** Explicit OPENAI_IMAGE_QUALITY wins; otherwise high when QUIZ_QUALITY_FIRST=true. */
export function resolveOpenAiImageQuality() {
  const explicit = String(process.env.OPENAI_IMAGE_QUALITY || "").trim();
  if (explicit) {
    return explicit;
  }
  if (quizQualityFirstEnabled()) {
    return "high";
  }
  return "";
}

export function buildResponsesImageTool({ diagramType = "generic" } = {}) {
  const tool = {
    type: "image_generation",
    action: "generate",
  };

  const quality = resolveOpenAiImageQuality();
  const size = resolveImageSizeForDiagramType(diagramType);
  if (quality) {
    tool.quality = quality;
  }
  if (size) {
    tool.size = size;
  }

  return tool;
}

export function buildEducationalDiagramPrompt({
  subject = "Science",
  yearLevel = "Year 7",
  focus = "",
  brief = "",
  diagramType = "generic",
  labels = [],
  title = "",
  caption = "",
}) {
  const labelBlock = labels.length
    ? labels.map((label) => `- ${label}`).join("\n")
    : "- Label every important part clearly.";

  return `
Educational diagram for Australian ${yearLevel} ${subject}.
Topic: ${focus}
Brief: ${brief}
${title ? `Title: ${title}` : ""}
${caption ? `Caption: ${caption}` : ""}
Diagram style: ${diagramType.replace(/_/g, " ")}
Visual guidance: ${diagramTypeHint(diagramType)}
${aspectLayoutHint(diagramType)}

Requirements:
- Educational clarity over decoration — axes, legends, step numbers, and leader lines where helpful.
- Large readable sans-serif labels; white background; high contrast; NO overlapping text.
- Curriculum-appropriate for ${yearLevel} ${subject}.
- No quiz answers or multiple-choice options.

Labels to include:
${labelBlock}
`.trim();
}

export function extractImagesFromResponsesPayload(payload) {
  const outputs = Array.isArray(payload?.output) ? payload.output : [];
  return outputs
    .filter((item) => item?.type === "image_generation_call" && item?.result)
    .map((item) => String(item.result));
}

async function saveBase64Image(base64Data) {
  const buffer = Buffer.from(base64Data, "base64");
  return saveQuestionImage(buffer, "png");
}

function withoutMisleadingVisual(question, imageError = "") {
  return stripUnverifiedVisual({
    ...question,
    imageError: imageError || "Diagram was not generated for this question.",
  });
}

export async function attachQuizImagesFromResponse(questions, payload) {
  const images = extractImagesFromResponsesPayload(payload);
  let imageIndex = 0;
  const enriched = [];

  for (const question of questions) {
    const imagePrompt = String(question.diagramPrompt || question.imagePrompt || "").trim();
    if (!imagePrompt) {
      enriched.push(question);
      continue;
    }

    const base64Image = images[imageIndex];
    imageIndex += 1;

    if (base64Image) {
      enriched.push({
        ...question,
        imageUrl: await saveBase64Image(base64Image),
        imageAlt: imagePrompt,
        diagramPrompt: imagePrompt,
        imagePrompt,
        imageError: "",
        imageGenerated: "openai",
      });
      continue;
    }

    enriched.push(
      withoutMisleadingVisual(
        question,
        images.length === 0
          ? "No diagram was returned in the quiz generation response."
          : "A diagram was missing for this visual question.",
      ),
    );
  }

  return enriched;
}

export async function enrichQuestionImages(questions) {
  return questions.map((question) => stripUnverifiedVisual(question));
}

export async function enrichQuizWithImages(quiz) {
  const questions = await enrichQuestionImages(quiz.questions);
  return {
    ...quiz,
    questions,
  };
}

export async function enrichStoredQuizImages(quizId, questions) {
  if (!Array.isArray(questions)) {
    return questions;
  }
  const enriched = await enrichQuestionImages(questions);
  const changed = JSON.stringify(enriched) !== JSON.stringify(questions);
  if (changed && quizId) {
    updateQuizQuestions(quizId, enriched);
  }
  return enriched;
}
