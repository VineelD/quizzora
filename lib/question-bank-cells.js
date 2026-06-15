import {
  CURRICULUM_HIERARCHY,
  formatFocusLabel,
  topicKey,
} from "./curriculum-topics.js";

/**
 * @returns {Array<{
 *   yearLevel: string,
 *   subject: string,
 *   topicKey: string,
 *   subtopic: string,
 *   focusLabel: string,
 *   acaraCodes: string,
 * }>}
 */
export function enumerateCurriculumCells() {
  const cells = [];

  for (const [yearLevel, subjects] of Object.entries(CURRICULUM_HIERARCHY)) {
    for (const [subject, entries] of Object.entries(subjects)) {
      for (const entry of entries) {
        const key = topicKey(entry);
        for (const subtopic of entry.subtopics || []) {
          cells.push({
            yearLevel,
            subject,
            topicKey: key,
            subtopic,
            focusLabel: formatFocusLabel(entry, subtopic),
            acaraCodes: entry.source || "",
          });
        }
      }
    }
  }

  return cells;
}

export function agentShardForYearLevel(yearLevel) {
  return String(yearLevel || "").trim();
}

/** @param {number} count */
export function assignDifficultySlots(count) {
  const total = Math.max(0, Math.floor(Number(count) || 0));
  const slots = [];
  for (let index = 0; index < total; index += 1) {
    const ratio = total <= 1 ? 0 : index / (total - 1);
    if (ratio < 0.7) {
      slots.push("core");
    } else if (ratio < 0.9) {
      slots.push("standard");
    } else {
      slots.push("extension");
    }
  }
  return slots;
}
