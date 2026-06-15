/**
 * Central flags for disabling paid OpenAI usage in quiz + Study Coach paths.
 */

export function isOpenAiDisabled() {
  return String(process.env.DISABLE_OPENAI || "").trim().toLowerCase() === "true";
}

/** @returns {"openai" | "question_bank"} */
export function resolveQuizProvider() {
  const explicit = String(process.env.QUIZ_PROVIDER || "").trim().toLowerCase();
  if (explicit === "question_bank" || explicit === "bank" || explicit === "local") {
    return "question_bank";
  }
  if (explicit === "openai") {
    return "openai";
  }
  if (isOpenAiDisabled()) {
    return "question_bank";
  }
  return "openai";
}

export function quizUsesQuestionBank() {
  return resolveQuizProvider() === "question_bank";
}
