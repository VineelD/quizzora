"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { buildIntroNarrationScript, buildPortionNarrationScript, buildStepNarrationScript } from "../lib/study-narration-script.js";
import { STUDY_PAUSE_NARRATION_EVENT } from "../lib/study-speech-input.js";

const TRANSITION_MS = 240;
const SPEECH_RESUME_MS = 80;

function pickSpeechVoice() {
  if (typeof window === "undefined" || !window.speechSynthesis) {
    return null;
  }
  const voices = window.speechSynthesis.getVoices();
  return (
    voices.find((voice) => /en-au/i.test(voice.lang)) ||
    voices.find((voice) => /en-gb/i.test(voice.lang)) ||
    voices.find((voice) => /english/i.test(voice.name)) ||
    voices[0] ||
    null
  );
}

function speakWithBrowser(script, onDone) {
  if (typeof window === "undefined" || !window.speechSynthesis || !script) {
    onDone?.();
    return () => {};
  }

  window.speechSynthesis.cancel();

  const startSpeaking = () => {
    const utterance = new SpeechSynthesisUtterance(script);
    const voice = pickSpeechVoice();
    if (voice) {
      utterance.voice = voice;
      utterance.lang = voice.lang;
    } else {
      utterance.lang = "en-AU";
    }
    utterance.rate = 0.95;
    utterance.onend = () => onDone?.();
    utterance.onerror = () => onDone?.();
    window.speechSynthesis.speak(utterance);
  };

  startSpeaking();
  window.setTimeout(() => {
    if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
      return;
    }
    window.speechSynthesis.resume();
    startSpeaking();
  }, SPEECH_RESUME_MS);

  return () => {
    window.speechSynthesis.cancel();
  };
}

function playAudioUrl(url, onDone, onFallback) {
  const audio = new Audio(url);
  let finished = false;

  const finish = (useFallback = false) => {
    if (finished) {
      return;
    }
    finished = true;
    if (useFallback) {
      onFallback?.();
      return;
    }
    onDone?.();
  };

  audio.onended = () => finish(false);
  audio.onerror = () => finish(true);
  const playPromise = audio.play();
  if (playPromise?.catch) {
    playPromise.catch(() => finish(true));
  }
  return audio;
}

export function useStudySyncedNarration({
  steps = [],
  portions = [],
  activeIndex,
  intro = "",
  introNarrationText = "",
  introAudioUrl = "",
  enabled = true,
  animate = true,
  started = false,
  portionMode = false,
  autoAdvance = false,
  autoPlay = false,
  onPortionComplete,
}) {
  const audioRef = useRef(null);
  const speechCleanupRef = useRef(null);
  const introPlayedRef = useRef(false);
  const [muted, setMuted] = useState(false);
  const [speaking, setSpeaking] = useState(false);

  const usePortions = portionMode && portions.length > 0;

  useEffect(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) {
      return undefined;
    }

    const primeVoices = () => {
      window.speechSynthesis.getVoices();
    };
    primeVoices();
    window.speechSynthesis.addEventListener("voiceschanged", primeVoices);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", primeVoices);
  }, []);

  const stopPlayback = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (speechCleanupRef.current) {
      speechCleanupRef.current();
      speechCleanupRef.current = null;
    }
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    setSpeaking(false);
  }, []);

  const portionScript = useCallback(
    (index) => {
      const portion = portions[index];
      if (!portion) {
        return "";
      }
      return buildPortionNarrationScript(portion);
    },
    [portions],
  );

  const narratePortion = useCallback(
    (portionOrIndex, { useServerAudio = false, onDone } = {}) => {
      const index = typeof portionOrIndex === "number" ? portionOrIndex : portions.indexOf(portionOrIndex);
      const portion = typeof portionOrIndex === "number" ? portions[portionOrIndex] : portionOrIndex;
      if (!portion) {
        return () => {};
      }

      const script = portionScript(index);
      if (!script && !portion.audioUrl) {
        setSpeaking(false);
        onDone?.();
        return () => {};
      }

      setSpeaking(true);

      const finish = () => {
        setSpeaking(false);
        onDone?.();
      };

      const speakBrowserFallback = () => {
        if (!script) {
          finish();
          return () => {};
        }
        speechCleanupRef.current = speakWithBrowser(script, finish);
        return speechCleanupRef.current;
      };

      if (useServerAudio && portion.audioUrl) {
        audioRef.current = playAudioUrl(
          portion.audioUrl,
          finish,
          () => {
            audioRef.current = null;
            speakBrowserFallback();
          },
        );
        return () => {
          audioRef.current?.pause();
          audioRef.current = null;
        };
      }

      return speakBrowserFallback();
    },
    [portionScript, portions],
  );

  const stepScript = useCallback(
    (index) => {
      const step = steps[index];
      if (!step) {
        return "";
      }
      return buildStepNarrationScript(step, {
        frameIndex: step.diagramFrame || index + 1,
        totalFrames: step.totalFrames || steps.length,
      });
    },
    [steps],
  );

  const playStepNarration = useCallback(
    (index, { useServerAudio = false } = {}) => {
      const step = steps[index];
      if (!step) {
        return () => {};
      }

      const script = stepScript(index);
      if (!script && !step.audioUrl) {
        setSpeaking(false);
        return () => {};
      }

      setSpeaking(true);

      const speakBrowserFallback = () => {
        if (!script) {
          setSpeaking(false);
          return () => {};
        }
        speechCleanupRef.current = speakWithBrowser(script, () => setSpeaking(false));
        return speechCleanupRef.current;
      };

      if (useServerAudio && step.audioUrl) {
        audioRef.current = playAudioUrl(
          step.audioUrl,
          () => setSpeaking(false),
          () => {
            audioRef.current = null;
            speakBrowserFallback();
          },
        );
        return () => {
          audioRef.current?.pause();
          audioRef.current = null;
        };
      }

      return speakBrowserFallback();
    },
    [stepScript, steps],
  );

  const playIntroThenStep = useCallback(
    ({ useServerAudio = false } = {}) => {
      setSpeaking(true);

      const startStepNarration = () => {
        speechCleanupRef.current = playStepNarration(0, { useServerAudio });
      };

      const introScript = buildIntroNarrationScript(intro, introNarrationText);
      if (useServerAudio && introAudioUrl) {
        audioRef.current = playAudioUrl(
          introAudioUrl,
          startStepNarration,
          () => {
            audioRef.current = null;
            if (introScript) {
              speechCleanupRef.current = speakWithBrowser(introScript, startStepNarration);
            } else {
              startStepNarration();
            }
          },
        );
        return;
      }

      if (introScript) {
        speechCleanupRef.current = speakWithBrowser(introScript, startStepNarration);
        return;
      }

      startStepNarration();
    },
    [intro, introAudioUrl, introNarrationText, playStepNarration],
  );

  useEffect(() => {
    introPlayedRef.current = false;
  }, [steps, portions, intro, introAudioUrl]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const handlePause = () => stopPlayback();
    window.addEventListener(STUDY_PAUSE_NARRATION_EVENT, handlePause);
    return () => window.removeEventListener(STUDY_PAUSE_NARRATION_EVENT, handlePause);
  }, [stopPlayback]);

  useEffect(() => {
    if (!enabled || !started || muted || !autoPlay) {
      stopPlayback();
      return undefined;
    }

    let cancelled = false;
    let cleanup = () => {};
    const delay = animate ? TRANSITION_MS : 0;

    const timer = window.setTimeout(() => {
      stopPlayback();
      if (cancelled) {
        return;
      }

      if (usePortions) {
        cleanup = narratePortion(activeIndex, {
          useServerAudio: false,
          onDone: autoAdvance ? onPortionComplete : undefined,
        });
        return;
      }

      const shouldPlayIntro = activeIndex === 0 && !introPlayedRef.current && (introAudioUrl || intro);
      if (shouldPlayIntro) {
        introPlayedRef.current = true;
        playIntroThenStep({ useServerAudio: false });
        return;
      }

      cleanup = playStepNarration(activeIndex, { useServerAudio: false });
    }, delay);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      cleanup();
      stopPlayback();
    };
  }, [
    activeIndex,
    animate,
    autoAdvance,
    autoPlay,
    enabled,
    intro,
    introAudioUrl,
    muted,
    narratePortion,
    onPortionComplete,
    playIntroThenStep,
    playStepNarration,
    started,
    stopPlayback,
    usePortions,
  ]);

  const replayCurrent = useCallback(() => {
    if (muted || !started) {
      return;
    }
    stopPlayback();

    if (usePortions) {
      narratePortion(activeIndex, { useServerAudio: true });
      return;
    }

    if (activeIndex === 0 && (introAudioUrl || intro)) {
      playIntroThenStep({ useServerAudio: true });
      return;
    }

    playStepNarration(activeIndex, { useServerAudio: true });
  }, [
    activeIndex,
    intro,
    introAudioUrl,
    muted,
    narratePortion,
    playIntroThenStep,
    playStepNarration,
    started,
    stopPlayback,
    usePortions,
  ]);

  const beginFromUserGesture = useCallback(() => {
    if (muted) {
      return;
    }
    stopPlayback();
    introPlayedRef.current = true;

    if (usePortions) {
      narratePortion(activeIndex, { useServerAudio: true });
      return;
    }

    if (activeIndex === 0 && (introAudioUrl || intro)) {
      playIntroThenStep({ useServerAudio: true });
      return;
    }

    playStepNarration(activeIndex, { useServerAudio: true });
  }, [
    activeIndex,
    intro,
    introAudioUrl,
    muted,
    narratePortion,
    playIntroThenStep,
    playStepNarration,
    stopPlayback,
    usePortions,
  ]);

  const toggleMute = useCallback(() => {
    setMuted((current) => {
      if (!current) {
        stopPlayback();
      }
      return !current;
    });
  }, [stopPlayback]);

  return {
    muted,
    speaking,
    toggleMute,
    stopPlayback,
    replayCurrent,
    beginFromUserGesture,
    narratePortion,
  };
}
