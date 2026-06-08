export const STUDY_PAUSE_NARRATION_EVENT = "study-coach-pause-narration";

export function pauseStudyNarration() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(STUDY_PAUSE_NARRATION_EVENT));
  }
}

export function getSpeechRecognitionConstructor() {
  if (typeof window === "undefined") {
    return null;
  }
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

/**
 * Chrome/Edge Web Speech API does not honor SpeechGrammarList hints for
 * domain vocabulary (e.g. "theta", "sine squared"). Study Coach post-processes
 * final transcripts with lib/spoken-math.js when Math input mode is enabled.
 */
export function supportsSpeechRecognitionGrammars() {
  const SpeechRecognition = getSpeechRecognitionConstructor();
  if (!SpeechRecognition) {
    return false;
  }
  try {
    return Boolean(window.SpeechGrammarList || window.webkitSpeechGrammarList);
  } catch {
    return false;
  }
}

export function isStudySpeechInputSupported() {
  return Boolean(getSpeechRecognitionConstructor());
}

export function speechInputErrorMessage(errorCode) {
  if (errorCode === "not-allowed" || errorCode === "service-not-allowed") {
    return "Microphone access was blocked. Allow the microphone for this site in your browser settings.";
  }
  if (errorCode === "no-speech") {
    return "No speech detected. Try speaking again or type your message.";
  }
  if (errorCode === "network") {
    return "Voice input needs an internet connection in this browser. Type your message instead.";
  }
  return "Voice input hit a snag. Try again or type your message.";
}
