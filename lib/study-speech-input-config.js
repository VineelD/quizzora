/**
 * Study Coach microphone speech input flag.
 *
 * STUDY_COACH_SPEECH_INPUT_ENABLED — server/build flag (default true).
 * NEXT_PUBLIC_STUDY_COACH_SPEECH_INPUT_ENABLED — client bundle (via next.config.mjs).
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

export function studySpeechInputEnabled() {
  const publicFlag = readTriState("NEXT_PUBLIC_STUDY_COACH_SPEECH_INPUT_ENABLED");
  if (publicFlag != null) {
    return publicFlag;
  }

  const serverFlag = readTriState("STUDY_COACH_SPEECH_INPUT_ENABLED");
  if (serverFlag != null) {
    return serverFlag;
  }

  return true;
}
