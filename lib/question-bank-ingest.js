import { createHash } from "node:crypto";
import {
  normalizeQuizQuestionFields,
  repairQuizMathDelimiters,
  sanitizeQuizText,
} from "./quiz-display-text.js";
import { applyQuizQuestionClarityFixes, validateQuizQuestionClarity } from "./quiz-quality.js";

function stripCodeFence(text) {
  return String(text || "")
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
}

export function extractResponseText(payload) {
  if (typeof payload?.output_text === "string") {
    return payload.output_text;
  }

  const content = payload?.output
    ?.flatMap((item) => item.content || [])
    ?.map((item) => item.text || "")
    ?.join("")
    ?.trim();

  return content || "";
}

export function parseGeneratedQuestionFromResponse(body) {
  const text = extractResponseText(body);
  if (!text) {
    return { ok: false, reason: "empty_response" };
  }

  let parsed;
  try {
    parsed = JSON.parse(stripCodeFence(text));
  } catch {
    return { ok: false, reason: "invalid_json" };
  }

  if (!parsed || typeof parsed !== "object") {
    return { ok: false, reason: "invalid_shape" };
  }

  const repaired = {
    ...parsed,
    question: repairQuizMathDelimiters(String(parsed.question || "")),
    options: Array.isArray(parsed.options)
      ? parsed.options.map((option) => repairQuizMathDelimiters(String(option)))
      : [],
    ...(parsed.answer != null ? { answer: repairQuizMathDelimiters(String(parsed.answer)) } : {}),
    ...(typeof parsed.explanation === "string"
      ? { explanation: repairQuizMathDelimiters(String(parsed.explanation)) }
      : {}),
  };

  const normalized = normalizeQuizQuestionFields(repaired);
  const fixed = applyQuizQuestionClarityFixes(normalized);
  const review = validateQuizQuestionClarity(fixed, { focus: "" });

  if (!review.valid) {
    const critical = review.issues.find((issue) => issue.severity === "critical");
    return { ok: false, reason: critical?.message || "clarity_failed" };
  }

  const sanitized = {
    ...fixed,
    question: sanitizeQuizText(fixed.question),
    options: fixed.options.map((option) => sanitizeQuizText(option)),
    answer: sanitizeQuizText(fixed.answer),
    explanation:
      typeof fixed.explanation === "string" ? sanitizeQuizText(fixed.explanation) : fixed.explanation,
  };

  if (!sanitized.question || !Array.isArray(sanitized.options) || sanitized.options.length < 4) {
    return { ok: false, reason: "missing_options" };
  }

  if (!sanitized.answer || !sanitized.options.includes(sanitized.answer)) {
    return { ok: false, reason: "answer_mismatch" };
  }

  return { ok: true, question: sanitized };
}

export function hashQuestionContent(question) {
  const stem = String(question.question || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
  const options = [...(question.options || [])]
    .map((option) =>
      String(option || "")
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim(),
    )
    .sort()
    .join("|");

  return createHash("sha256").update(`${stem}::${options}`).digest("hex");
}
