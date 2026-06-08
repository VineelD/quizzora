import { normalizeDiagramSpec, preferAiDiagramForStep, isDiagramImagePending, stepNeedsGeneratedImage } from "./study-diagram-render.js";
import { applyQuizQuestionClarityFixes } from "./quiz-quality.js";
import {
  normalizeQuizQuestionFields,
  prepareQuizOptionMarkdown,
  prepareQuizQuestionMarkdown,
  sanitizeQuizText,
} from "./quiz-display-text.js";

export { prepareQuizDisplayText } from "./quiz-display-text.js";

export function normalizeQuizQuestionTextForDisplay(text) {
  return prepareQuizQuestionMarkdown(text);
}

export function normalizeQuizOptionTextForDisplay(text) {
  return prepareQuizOptionMarkdown(text);
}

export function normalizeQuizQuestionsForDisplay(questions) {
  if (!Array.isArray(questions)) {
    return questions;
  }

  return questions.map((question) => {
    if (!question || typeof question !== "object") {
      return question;
    }
    return normalizeQuizQuestionFields(applyQuizQuestionClarityFixes(question));
  });
}

export function questionNeedsImage(question) {
  const prompt = String(question.diagramPrompt || question.imagePrompt || "").trim();
  return Boolean(prompt) && !question.imageUrl?.trim();
}

/** Only OpenAI-generated images are shown to students — never misleading placeholders. */
export function hasVerifiedDiagram(question) {
  return question.imageGenerated === "openai" && Boolean(question.imageUrl?.trim());
}

export function hasClientQuizDiagram(question) {
  if (hasVerifiedDiagram(question)) {
    return false;
  }

  if (preferAiDiagramForStep(question, "quiz") && process.env.OPENAI_IMAGE_GENERATION !== "false") {
    if (isDiagramImagePending(question, "quiz") || stepNeedsGeneratedImage(question, "quiz")) {
      return false;
    }
  }

  if (normalizeDiagramSpec(question?.diagramSpec)) {
    return true;
  }

  const diagramType = String(question?.diagramType || question?.diagramSpec?.diagramType || "").trim();
  const mermaidSource = String(question?.diagramMermaid || "").trim();
  return (diagramType === "flowchart" || diagramType === "process_diagram") && Boolean(mermaidSource);
}

export function hasQuizVisual(question) {
  return hasVerifiedDiagram(question) || hasClientQuizDiagram(question) || isDiagramImagePending(question, "quiz");
}

export function stripUnverifiedVisual(question) {
  if (hasVerifiedDiagram(question)) {
    return question;
  }

  const {
    imageUrl,
    imageAlt,
    imageGenerated,
    imageError,
    imagePrompt,
    ...rest
  } = question;

  const diagramPrompt = String(rest.diagramPrompt || imagePrompt || "").trim();
  const needsGeneratedImage = Boolean(diagramPrompt) && !hasClientQuizDiagram(rest);

  return {
    ...rest,
    diagramPrompt,
    imagePrompt: diagramPrompt,
    imageUrl: "",
    imageAlt: "",
    imageGenerated: "",
    imageError:
      imageError ||
      (needsGeneratedImage ? "Diagram was not generated for this question." : ""),
  };
}

export function ensureQuestionVisuals(questions) {
  return normalizeQuizQuestionsForDisplay(questions.map(stripUnverifiedVisual));
}

export function questionHasDiagramIntent(question) {
  if (!question) {
    return false;
  }

  return Boolean(
    String(question.diagramPrompt || question.imagePrompt || "").trim() ||
      normalizeDiagramSpec(question?.diagramSpec) ||
      String(question.diagramMermaid || "").trim() ||
      String(question.imageError || "").trim(),
  );
}

export const STUDENT_DIAGRAM_FAILURE_MESSAGE = "Diagram unavailable";
