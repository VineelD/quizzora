/**
 * Distribute a total question count across subtopics (round-robin remainder).
 * @param {number} totalCount
 * @param {string[]} subtopicKeys - focus labels or subtopic identifiers
 * @returns {Record<string, number>}
 */
export function distributeQuestionCounts(totalCount, subtopicKeys) {
  const keys = (subtopicKeys || []).map(String).filter(Boolean);
  const total = Math.max(0, Math.floor(Number(totalCount) || 0));
  if (!keys.length) {
    return {};
  }
  if (total === 0) {
    return Object.fromEntries(keys.map((key) => [key, 0]));
  }

  const base = Math.floor(total / keys.length);
  let remainder = total % keys.length;
  const result = {};

  for (const key of keys) {
    result[key] = base + (remainder > 0 ? 1 : 0);
    if (remainder > 0) {
      remainder -= 1;
    }
  }

  return result;
}

/**
 * @param {object} body
 * @returns {{ selectedTopics: string[], selectedSubtopics: string[], focus: string }}
 */
export function resolveTopicSelectionFromBody(body) {
  const selectedTopics = Array.isArray(body.selectedTopics)
    ? body.selectedTopics.map(String).filter(Boolean)
    : [];
  const selectedSubtopics = Array.isArray(body.selectedSubtopics)
    ? body.selectedSubtopics.map(String).filter(Boolean)
    : [];

  let focus = String(body.focus || "").trim();
  if (!focus && selectedSubtopics.length === 1) {
    focus = selectedSubtopics[0];
  } else if (!focus && selectedSubtopics.length > 1) {
    const preview = selectedSubtopics.slice(0, 2).join("; ");
    focus =
      selectedSubtopics.length > 2
        ? `${preview} (+${selectedSubtopics.length - 2} more)`
        : preview;
  } else if (!focus) {
    focus = "Mixtures and separation";
  }

  return { selectedTopics, selectedSubtopics, focus };
}
