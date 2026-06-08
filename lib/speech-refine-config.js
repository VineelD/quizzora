/**
 * Study Coach speech ML refinement flags.
 *
 * STUDY_COACH_SPEECH_ML_REFINE — enable embedding-based vocab correction (default true).
 * STUDY_COACH_SPEECH_ML_MODEL — Hugging Face model id for Transformers.js (default Xenova/all-MiniLM-L6-v2).
 */

function readTriState(name) {
  const value = process.env[name];
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  return null;
}

export function studyCoachSpeechMlRefineEnabled() {
  const flag = readTriState("STUDY_COACH_SPEECH_ML_REFINE");
  if (flag != null) {
    return flag;
  }
  return true;
}

export function studyCoachSpeechMlModel() {
  return String(process.env.STUDY_COACH_SPEECH_ML_MODEL || "Xenova/all-MiniLM-L6-v2").trim();
}

export const SPEECH_REFINE_RATE_LIMIT_MS = 400;
export const SPEECH_REFINE_VOCAB_CAP = 200;
export const SPEECH_REFINE_SIMILARITY_THRESHOLD = 0.72;
/** Topic → glossary term similarity floor for vocabulary chip expansion. */
export const TOPIC_VOCAB_ML_SIMILARITY_THRESHOLD = 0.38;
