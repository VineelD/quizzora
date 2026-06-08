import { protectMathRegions, sanitizeStudyMathContent, unprotectMathRegions } from "./study-message-content.js";

const noisePatterns = [
  /^recalculate:/i,
  /^re-examine/i,
  /^none of the options/i,
  /^check if question/i,
  /^possibly question/i,
  /^adjust answer accordingly/i,
  /^since options are higher/i,
];

function splitOutsideMath(text, pattern) {
  const { text: protectedText, regions } = protectMathRegions(String(text || ""));
  return protectedText
    .split(pattern)
    .map((step) => unprotectMathRegions(step, regions).trim())
    .filter(Boolean);
}

function splitSentencesOutsideMath(text) {
  return splitOutsideMath(text, /(?<=[.!?])\s+(?=[A-Z])/);
}

export function formatExplanationSteps(explanation) {
  if (Array.isArray(explanation)) {
    return explanation.map((step) => String(step).trim()).filter(Boolean);
  }

  const text = String(explanation || "").trim();
  if (!text) {
    return [];
  }

  let steps = [];
  if (text.includes("\n")) {
    steps = splitOutsideMath(text, /\n+/);
  } else if (text.includes(";")) {
    steps = splitOutsideMath(text, /;\s+/);
  } else if (text.length > 160) {
    steps = splitSentencesOutsideMath(text);
  } else {
    steps = [text];
  }

  return steps
    .flatMap((step) => (step.includes(";") ? [step] : splitSentencesOutsideMath(step)))
    .map((step) => step.replace(/^[-*•]\s*/, "").replace(/^\d+\.\s+/, "").trim())
    .map((step) => sanitizeStudyMathContent(step))
    .filter((step) => step && !noisePatterns.some((pattern) => pattern.test(step)))
    .filter((step) => !/\brecalculate\b/i.test(step) && !/\bnone of the options\b/i.test(step));
}

export function normalizeExplanation(explanation) {
  const steps = formatExplanationSteps(explanation);
  return steps.length ? steps.join("\n") : String(explanation || "").trim();
}
