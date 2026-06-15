function collapseWhitespace(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Build searchable text for question-bank embeddings.
 * Coach RAG includes answer + explanation; student mode omits the keyed answer.
 *
 * @param {{ focusLabel?: string, question: object, mode?: 'coach' | 'student' }} params
 */
export function buildQuestionBankEmbedText({ focusLabel = "", question, mode = "coach" }) {
  const parts = [];
  const focus = collapseWhitespace(focusLabel);
  if (focus) {
    parts.push(`Focus: ${focus}`);
  }

  const stem = collapseWhitespace(question?.question);
  if (stem) {
    parts.push(stem);
  }

  const options = Array.isArray(question?.options) ? question.options : [];
  if (options.length) {
    parts.push(`Options: ${options.map((option) => collapseWhitespace(option)).filter(Boolean).join(" | ")}`);
  }

  if (mode === "coach") {
    const answer = collapseWhitespace(question?.answer);
    if (answer) {
      parts.push(`Answer: ${answer}`);
    }
    const explanation = collapseWhitespace(question?.explanation);
    if (explanation) {
      parts.push(`Explanation: ${explanation}`);
    }
  }

  return parts.join("\n");
}
