/**
 * Study Coach narration flags (budget control).
 *
 * STUDY_COACH_TTS_ENABLED — paid OpenAI TTS on the server (default off).
 *   Legacy alias: STUDY_COACH_NARRATION=true also enables server TTS.
 *
 * STUDY_COACH_NARRATION_ENABLED — browser Web Speech + narration UI (default off).
 *   Exposed to the client bundle as NEXT_PUBLIC_STUDY_COACH_NARRATION_ENABLED via next.config.mjs.
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

export function studyServerTtsEnabled() {
  const ttsFlag = readTriState("STUDY_COACH_TTS_ENABLED");
  if (ttsFlag != null) {
    return ttsFlag;
  }

  const narrationFlag = readTriState("STUDY_COACH_NARRATION_ENABLED");
  if (narrationFlag === false) {
    return false;
  }

  return process.env.STUDY_COACH_NARRATION === "true";
}

export function studyClientNarrationEnabled() {
  const publicFlag = readTriState("NEXT_PUBLIC_STUDY_COACH_NARRATION_ENABLED");
  if (publicFlag != null) {
    return publicFlag;
  }

  const narrationFlag = readTriState("STUDY_COACH_NARRATION_ENABLED");
  if (narrationFlag != null) {
    return narrationFlag;
  }

  return false;
}
