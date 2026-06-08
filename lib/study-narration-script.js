import { buildIntroSpeechText, buildPortionSpeechText, buildStepSpeechText } from "./speech-text.js";

export function buildIntroNarrationScript(intro, introNarrationText = "") {
  return buildIntroSpeechText(intro, introNarrationText);
}

export function buildPortionNarrationScript(portion) {
  return buildPortionSpeechText(portion);
}

export function buildStepNarrationScript(step, { frameIndex = 0, totalFrames = 0 } = {}) {
  return buildStepSpeechText(step, { frameIndex, totalFrames });
}
