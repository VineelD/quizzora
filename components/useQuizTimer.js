"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { formatTimerDisplay } from "../lib/quiz-timing.js";

/**
 * Per-question and overall countdown for timed quizzes.
 */
export function useQuizTimer({
  questionTimeLimitSeconds,
  overallTimeLimitSeconds,
  active = true,
  onQuestionExpire,
  onOverallExpire,
}) {
  const [questionRemaining, setQuestionRemaining] = useState(questionTimeLimitSeconds);
  const [overallRemaining, setOverallRemaining] = useState(overallTimeLimitSeconds);
  const questionStartRef = useRef(Date.now());
  const overallStartRef = useRef(Date.now());
  const questionExpiredRef = useRef(false);
  const overallExpiredRef = useRef(false);

  useEffect(() => {
    setQuestionRemaining(questionTimeLimitSeconds);
    setOverallRemaining(overallTimeLimitSeconds);
    questionStartRef.current = Date.now();
    overallStartRef.current = Date.now();
    questionExpiredRef.current = false;
    overallExpiredRef.current = false;
  }, [questionTimeLimitSeconds, overallTimeLimitSeconds]);

  useEffect(() => {
    if (!active) {
      return undefined;
    }

    const interval = window.setInterval(() => {
      const now = Date.now();
      const nextQuestionRemaining = Math.max(
        0,
        questionTimeLimitSeconds - Math.floor((now - questionStartRef.current) / 1000),
      );
      const nextOverallRemaining = Math.max(
        0,
        overallTimeLimitSeconds - Math.floor((now - overallStartRef.current) / 1000),
      );

      setQuestionRemaining(nextQuestionRemaining);
      setOverallRemaining(nextOverallRemaining);

      if (nextQuestionRemaining <= 0 && !questionExpiredRef.current) {
        questionExpiredRef.current = true;
        onQuestionExpire?.();
      }

      if (nextOverallRemaining <= 0 && !overallExpiredRef.current) {
        overallExpiredRef.current = true;
        onOverallExpire?.();
      }
    }, 250);

    return () => window.clearInterval(interval);
  }, [
    active,
    questionTimeLimitSeconds,
    overallTimeLimitSeconds,
    onQuestionExpire,
    onOverallExpire,
  ]);

  const getQuestionElapsedMs = useCallback(() => {
    return Math.max(0, Date.now() - questionStartRef.current);
  }, []);

  const getOverallElapsedMs = useCallback(() => {
    return Math.max(0, Date.now() - overallStartRef.current);
  }, []);

  return {
    questionRemaining,
    overallRemaining,
    questionDisplay: formatTimerDisplay(questionRemaining),
    overallDisplay: formatTimerDisplay(overallRemaining),
    questionProgress:
      questionTimeLimitSeconds > 0 ? questionRemaining / questionTimeLimitSeconds : 0,
    overallProgress:
      overallTimeLimitSeconds > 0 ? overallRemaining / overallTimeLimitSeconds : 0,
    getQuestionElapsedMs,
    getOverallElapsedMs,
  };
}
