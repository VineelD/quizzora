import { buildSingleQuestionRegenerationPrompt } from "./ai.js";

/**
 * @param {object} request
 * @param {string} request.yearLevel
 * @param {string} request.subject
 * @param {string} request.focus
 * @param {string} [request.difficulty]
 * @param {string} [request.questionStyle]
 */
export function buildQuestionBankBatchPrompt(request) {
  const difficulty = request.difficulty || "core";
  const questionStyle =
    difficulty === "extension" ? "worded" : request.questionStyle || "mixed";

  return buildSingleQuestionRegenerationPrompt(
    {
      yearLevel: request.yearLevel,
      subject: request.subject,
      focus: request.focus,
      difficulty,
      questionStyle,
    },
    {},
  );
}

/**
 * @param {object} row
 * @param {string} model
 */
export function buildBatchRequestLine(row, model) {
  const prompt = buildQuestionBankBatchPrompt({
    yearLevel: row.year_level,
    subject: row.subject,
    focus: row.focus_label,
    difficulty: row.difficulty,
    questionStyle: row.question_style,
  });

  return {
    custom_id: row.custom_id,
    method: "POST",
    url: "/v1/responses",
    body: {
      model,
      input: prompt,
      temperature: 0.35,
      max_output_tokens: Number(process.env.QUESTION_BANK_MAX_OUTPUT_TOKENS || 1200),
    },
  };
}
