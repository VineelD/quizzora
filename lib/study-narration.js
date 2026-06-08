import { saveCoachMedia } from "./question-images.js";
import { studyServerTtsEnabled } from "./study-narration-config.js";
import {
  buildIntroNarrationScript,
  buildPortionNarrationScript,
  buildStepNarrationScript,
} from "./study-narration-script.js";

function maxNarrationPerReply(stepCount = 0) {
  const configured = Number(process.env.STUDY_COACH_MAX_NARRATION_PER_REPLY || 6);
  return Math.max(0, Math.min(configured, stepCount || configured));
}

export async function generateStudyNarrationAudio(text) {
  const script = String(text || "").trim();
  if (!script) {
    return null;
  }

  if (!studyServerTtsEnabled()) {
    return null;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || process.env.STUDY_COACH_MOCK === "true") {
    if (!apiKey) {
      console.warn("[study-narration] OPENAI_API_KEY missing; skipping server TTS.");
    }
    return null;
  }

  const speed = Number(process.env.STUDY_COACH_TTS_SPEED || 0.95);
  const ttsBody = {
    model: process.env.STUDY_COACH_TTS_MODEL || "tts-1",
    input: script,
    voice: process.env.STUDY_COACH_TTS_VOICE || "alloy",
    response_format: "mp3",
  };
  if (Number.isFinite(speed) && speed >= 0.25 && speed <= 4) {
    ttsBody.speed = speed;
  }

  const response = await fetch(process.env.OPENAI_TTS_ENDPOINT || "https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(ttsBody),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    console.error(
      "[study-narration] OpenAI TTS failed:",
      response.status,
      errorBody.slice(0, 240) || response.statusText,
    );
    return null;
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  return {
    audioUrl: saveCoachMedia(buffer, "audio/mpeg"),
    narrationText: script,
  };
}

export async function attachNarrationToCoachSteps(
  steps,
  context,
  { intro = "", introNarrationText = "", visualSequence = false, deadline = null } = {},
) {
  if (!studyServerTtsEnabled() || !Array.isArray(steps) || !steps.length) {
    return { steps, introAudioUrl: "" };
  }

  const limit = Math.min(maxNarrationPerReply(steps.length), 2);
  const totalFrames = visualSequence ? steps.filter((step) => step.diagramPrompt?.trim() || step.imageUrl).length : 0;
  const enriched = [...steps];
  let introAudioUrl = "";

  if (deadline != null && deadline <= Date.now()) {
    return { steps: enriched, introAudioUrl: "" };
  }

  const introScript = intro?.trim() ? buildIntroNarrationScript(intro, introNarrationText) : "";
  if (introScript) {
    const introAudio = await generateStudyNarrationAudio(introScript);
    if (introAudio) {
      introAudioUrl = introAudio.audioUrl;
    }
  }

  const narrationTargets = enriched
    .map((step, index) => ({ step, index }))
    .filter(({ step }) => !step.audioUrl)
    .slice(0, limit);

  const results = await Promise.all(
    narrationTargets.map(async ({ step, index }) => {
      if (deadline != null && deadline <= Date.now()) {
        return null;
      }

      const frameIndex = step.diagramFrame || (step.diagramPrompt || step.imageUrl ? index + 1 : 0);
      const script = buildStepNarrationScript(step, {
        frameIndex,
        totalFrames: totalFrames || step.totalFrames || 0,
      });

      if (!script) {
        return null;
      }

      const audio = await generateStudyNarrationAudio(script);
      if (!audio) {
        return null;
      }

      return { index, audio };
    }),
  );

  for (const result of results) {
    if (!result) {
      continue;
    }
    enriched[result.index] = {
      ...enriched[result.index],
      audioUrl: result.audio.audioUrl,
      narrationText: result.audio.narrationText,
    };
  }

  return { steps: enriched, introAudioUrl };
}

export async function attachNarrationToCoachPortions(portions, context, { deadline = null } = {}) {
  if (!studyServerTtsEnabled() || !Array.isArray(portions) || !portions.length) {
    return { portions: portions || [] };
  }

  const limit = Math.min(maxNarrationPerReply(portions.length), portions.length);
  const enriched = [...portions];

  if (deadline != null && deadline <= Date.now()) {
    return { portions: enriched };
  }

  const narrationTargets = enriched
    .map((portion, index) => ({ portion, index }))
    .filter(({ portion }) => !portion.audioUrl)
    .slice(0, limit);

  const results = await Promise.all(
    narrationTargets.map(async ({ portion, index }) => {
      if (deadline != null && deadline <= Date.now()) {
        return null;
      }

      const script = buildPortionNarrationScript(portion);
      if (!script) {
        return null;
      }

      const audio = await generateStudyNarrationAudio(script);
      if (!audio) {
        return null;
      }

      return { index, audio };
    }),
  );

  for (const result of results) {
    if (!result) {
      continue;
    }
    enriched[result.index] = {
      ...enriched[result.index],
      audioUrl: result.audio.audioUrl,
      narrationText: result.audio.narrationText,
    };
  }

  return { portions: enriched };
}
