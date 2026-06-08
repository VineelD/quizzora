import { buildTopicVocabulary, normalizeSpokenTranscript } from "./spoken-topic-vocab.js";
import { applyMlVocabRefinement } from "./speech-refine-ml.js";
import { studyCoachSpeechMlRefineEnabled } from "./speech-refine-config.js";

function mapLocalCorrections(corrections = []) {
  return corrections.map((entry) => ({
    from: entry.heard,
    to: entry.corrected,
    score: 1,
  }));
}

/**
 * Refine a speech transcript with local rules, then optional ML vocabulary matching.
 */
export async function refineSpeechText(
  text,
  {
    mathMode = false,
    topicVocab = [],
    mlEnabled = studyCoachSpeechMlRefineEnabled(),
    assignmentId = null,
    findSimilarTerm,
  } = {},
) {
  const local = normalizeSpokenTranscript(text, { mathMode, topicVocab });
  const corrections = mapLocalCorrections(local.corrections);

  if (!mathMode || !mlEnabled || !topicVocab.length) {
    return { text: local.text, corrections };
  }

  const cacheKey = assignmentId ? `assignment:${assignmentId}:${topicVocab.length}` : null;
  const ml = await applyMlVocabRefinement(local.text, topicVocab, {
    findSimilarTerm,
    cacheKey,
  });

  return {
    text: ml.text,
    corrections: [...corrections, ...ml.corrections],
  };
}

export { buildTopicVocabulary };
