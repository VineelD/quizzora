"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  COACH_MESSAGE_WINDOW_MS,
  createDefaultBrowseSignals,
  evaluateSituationalNarration,
  incrementVisitCount,
  isNarrationDismissed,
  isSessionNarrationDismissed,
  readVisitCount,
  setNarrationDismissed,
  setSessionNarrationDismissed,
} from "../lib/study-narration-situational.js";

function readPrefersReducedMotion() {
  if (typeof window === "undefined") {
    return false;
  }
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

export function useSituationalNarration({
  assignmentId,
  coachMessageCount = 0,
  scrollContainerRef = null,
  clientNarrationEnabled = true,
}) {
  const [signals, setSignals] = useState(() =>
    createDefaultBrowseSignals({
      assignmentId: String(assignmentId || ""),
      prefersReducedMotion: readPrefersReducedMotion(),
    }),
  );

  const pageOpenedAtRef = useRef(Date.now());
  const lastInteractionAtRef = useRef(Date.now());
  const lastScrollTopRef = useRef(0);
  const lastScrollAtRef = useRef(Date.now());
  const longestPauseMsRef = useRef(0);
  const maxScrollDepthRef = useRef(0);
  const maxScrollVelocityRef = useRef(0);
  const visitedStepsRef = useRef(new Set());
  const stepRevisitCountRef = useRef(0);
  const coachMessageTimesRef = useRef([]);
  const activeStepKeyRef = useRef("");
  const stepFocusedAtRef = useRef(Date.now());

  useEffect(() => {
    if (!assignmentId || typeof window === "undefined") {
      return undefined;
    }

    const storage = window.localStorage;
    const session = window.sessionStorage;
    const priorVisits = readVisitCount(assignmentId, storage);
    const isFirstVisit = priorVisits === 0;
    incrementVisitCount(assignmentId, storage);

    setSignals(
      createDefaultBrowseSignals({
        assignmentId: String(assignmentId),
        isFirstVisit,
        narrationDismissed: isNarrationDismissed(assignmentId, storage),
        sessionDismissed: isSessionNarrationDismissed(assignmentId, session),
        prefersReducedMotion: readPrefersReducedMotion(),
      }),
    );

    pageOpenedAtRef.current = Date.now();
    lastInteractionAtRef.current = Date.now();
  }, [assignmentId]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncMotion = () => {
      setSignals((current) => ({
        ...current,
        prefersReducedMotion: media.matches,
      }));
    };
    syncMotion();
    media.addEventListener("change", syncMotion);
    return () => media.removeEventListener("change", syncMotion);
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") {
      return undefined;
    }

    const syncVisibility = () => {
      setSignals((current) => ({
        ...current,
        tabVisible: document.visibilityState === "visible",
      }));
    };
    syncVisibility();
    document.addEventListener("visibilitychange", syncVisibility);
    return () => document.removeEventListener("visibilitychange", syncVisibility);
  }, []);

  useEffect(() => {
    if (!coachMessageCount) {
      return;
    }

    const now = Date.now();
    coachMessageTimesRef.current = [...coachMessageTimesRef.current, now].filter(
      (timestamp) => now - timestamp <= COACH_MESSAGE_WINDOW_MS,
    );

    setSignals((current) => ({
      ...current,
      recentCoachMessageCount: coachMessageTimesRef.current.length,
    }));
  }, [coachMessageCount]);

  const recordInteraction = useCallback(() => {
    const now = Date.now();
    const pause = now - lastInteractionAtRef.current;
    if (pause > longestPauseMsRef.current) {
      longestPauseMsRef.current = pause;
    }
    lastInteractionAtRef.current = now;

    setSignals((current) => ({
      ...current,
      lastInteractionAt: now,
      pageTimeMs: now - pageOpenedAtRef.current,
      longestPauseMs: longestPauseMsRef.current,
      stepIdleMs: activeStepKeyRef.current ? now - stepFocusedAtRef.current : 0,
    }));
  }, []);

  const recordScroll = useCallback(
    (container) => {
      if (!container) {
        return;
      }

      const now = Date.now();
      const scrollHeight = Math.max(container.scrollHeight - container.clientHeight, 1);
      const depth = container.scrollTop / scrollHeight;
      if (depth > maxScrollDepthRef.current) {
        maxScrollDepthRef.current = depth;
      }

      const elapsedSec = Math.max((now - lastScrollAtRef.current) / 1000, 0.05);
      const delta = Math.abs(container.scrollTop - lastScrollTopRef.current) / scrollHeight;
      const velocity = delta / elapsedSec;
      if (velocity > maxScrollVelocityRef.current) {
        maxScrollVelocityRef.current = velocity;
      }

      lastScrollTopRef.current = container.scrollTop;
      lastScrollAtRef.current = now;

      const pause = now - lastInteractionAtRef.current;
      const skimmingDetected =
        maxScrollDepthRef.current >= 0.45 &&
        maxScrollVelocityRef.current >= 2.5 &&
        longestPauseMsRef.current < 4000 &&
        pause < 4000;

      setSignals((current) => ({
        ...current,
        maxScrollDepth: maxScrollDepthRef.current,
        maxScrollVelocity: maxScrollVelocityRef.current,
        skimmingDetected,
        pageTimeMs: now - pageOpenedAtRef.current,
      }));
    },
    [],
  );

  useEffect(() => {
    const container = scrollContainerRef?.current;
    if (!container) {
      return undefined;
    }

    const onScroll = () => recordScroll(container);
    container.addEventListener("scroll", onScroll, { passive: true });
    return () => container.removeEventListener("scroll", onScroll);
  }, [recordScroll, scrollContainerRef]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const onActivity = () => recordInteraction();
    const options = { passive: true };
    window.addEventListener("pointerdown", onActivity, options);
    window.addEventListener("keydown", onActivity, options);
    window.addEventListener("wheel", onActivity, options);
    return () => {
      window.removeEventListener("pointerdown", onActivity, options);
      window.removeEventListener("keydown", onActivity, options);
      window.removeEventListener("wheel", onActivity, options);
    };
  }, [recordInteraction]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const now = Date.now();
      setSignals((current) => ({
        ...current,
        pageTimeMs: now - pageOpenedAtRef.current,
        stepIdleMs: activeStepKeyRef.current ? now - stepFocusedAtRef.current : current.stepIdleMs,
      }));
    }, 1000);

    return () => window.clearInterval(timer);
  }, []);

  const recordStepChange = useCallback(
    (stepKey) => {
      const key = String(stepKey || "");
      if (!key) {
        return;
      }

      if (visitedStepsRef.current.has(key)) {
        stepRevisitCountRef.current += 1;
      } else {
        visitedStepsRef.current.add(key);
      }

      activeStepKeyRef.current = key;
      stepFocusedAtRef.current = Date.now();
      recordInteraction();

      setSignals((current) => ({
        ...current,
        activeStepKey: key,
        stepRevisitCount: stepRevisitCountRef.current,
        stepIdleMs: 0,
      }));
    },
    [recordInteraction],
  );

  const recordExplicitPlay = useCallback(() => {
    recordInteraction();
    setSignals((current) => ({
      ...current,
      explicitPlayRequested: true,
    }));
  }, [recordInteraction]);

  const recordDismiss = useCallback(
    ({ persist = true, sessionOnly = false } = {}) => {
      if (!assignmentId || typeof window === "undefined") {
        return;
      }

      if (sessionOnly) {
        setSessionNarrationDismissed(assignmentId, true, window.sessionStorage);
        setSignals((current) => ({
          ...current,
          sessionDismissed: true,
          explicitPlayRequested: false,
        }));
        return;
      }

      setNarrationDismissed(assignmentId, true, window.localStorage);
      setSessionNarrationDismissed(assignmentId, true, window.sessionStorage);
      setSignals((current) => ({
        ...current,
        narrationDismissed: true,
        sessionDismissed: true,
        explicitPlayRequested: false,
      }));
    },
    [assignmentId],
  );

  const evaluateForMessage = useCallback(
    (messageContext) =>
      evaluateSituationalNarration(signals, messageContext, {
        clientNarrationEnabled,
      }),
    [clientNarrationEnabled, signals],
  );

  const situational = useMemo(
    () => ({
      signals,
      evaluateForMessage,
      recordInteraction,
      recordExplicitPlay,
      recordDismiss,
      recordStepChange,
    }),
    [evaluateForMessage, recordDismiss, recordExplicitPlay, recordInteraction, recordStepChange, signals],
  );

  return situational;
}
