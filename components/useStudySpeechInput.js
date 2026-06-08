"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { normalizeSpokenTranscript } from "../lib/spoken-topic-vocab.js";
import {
  getSpeechRecognitionConstructor,
  isStudySpeechInputSupported,
  pauseStudyNarration,
  speechInputErrorMessage,
} from "../lib/study-speech-input.js";

export async function refineTranscriptViaApi({
  text,
  mathMode,
  assignmentId,
  topicVocab = [],
  signal,
}) {
  const response = await fetch("/api/student/study/speech-refine", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text,
      mathMode,
      assignmentId,
      topicVocab,
    }),
    signal,
  });

  if (!response.ok) {
    throw new Error("Speech refine request failed.");
  }

  return response.json();
}

export function useStudySpeechInput({
  onTranscript,
  disabled = false,
  mathMode = false,
  topicVocab = [],
  onCorrection,
}) {
  const recognitionRef = useRef(null);
  const wantsListeningRef = useRef(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState("");

  const shouldNormalize = mathMode || topicVocab.length > 0;

  const normalizeChunk = useCallback(
    (chunk) => {
      if (!chunk || !shouldNormalize) {
        return { text: chunk, corrections: [] };
      }
      return normalizeSpokenTranscript(chunk, { mathMode, topicVocab });
    },
    [mathMode, shouldNormalize, topicVocab],
  );

  const stopListening = useCallback(() => {
    wantsListeningRef.current = false;
    if (recognitionRef.current) {
      recognitionRef.current.onend = null;
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setListening(false);
  }, []);

  const startListening = useCallback(() => {
    const SpeechRecognition = getSpeechRecognitionConstructor();
    if (!SpeechRecognition) {
      setError("Voice input is not supported in this browser. Try Chrome or Edge, or type your message.");
      return;
    }
    if (disabled) {
      return;
    }

    pauseStudyNarration();
    setError("");
    wantsListeningRef.current = true;

    const recognition = new SpeechRecognition();
    recognition.lang = "en-AU";
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event) => {
      let interim = "";
      let finalText = "";

      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const transcript = event.results[index][0]?.transcript || "";
        if (event.results[index].isFinal) {
          const normalized = normalizeChunk(transcript);
          if (normalized.corrections.length) {
            onCorrection?.(normalized.corrections[normalized.corrections.length - 1]);
          }
          finalText += normalized.text;
        } else {
          interim += normalizeChunk(transcript).text;
        }
      }

      onTranscript?.({
        final: finalText.trim(),
        interim: interim.trim(),
      });
    };

    recognition.onerror = (event) => {
      if (event.error !== "aborted") {
        setError(speechInputErrorMessage(event.error));
      }
      stopListening();
    };

    recognition.onend = () => {
      if (wantsListeningRef.current) {
        try {
          recognition.start();
          return;
        } catch {
          wantsListeningRef.current = false;
        }
      }
      recognitionRef.current = null;
      setListening(false);
    };

    recognitionRef.current = recognition;

    try {
      recognition.start();
      setListening(true);
    } catch {
      setError("Could not start voice input. Try again or type your message.");
      stopListening();
    }
  }, [disabled, normalizeChunk, onCorrection, onTranscript, stopListening]);

  const toggleListening = useCallback(() => {
    if (listening) {
      stopListening();
      return;
    }
    startListening();
  }, [listening, startListening, stopListening]);

  useEffect(() => () => stopListening(), [stopListening]);

  return {
    error,
    listening,
    stopListening,
    supported: isStudySpeechInputSupported(),
    toggleListening,
  };
}
