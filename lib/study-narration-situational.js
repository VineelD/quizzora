/**
 * Situational narration scoring for Study Coach (client-side, privacy-friendly).
 *
 * Narration is offered only when browsing signals and message context warrant it.
 * Auto-narration is limited to first-visit welcome or explicit user play.
 */

import { hasDiagramSteps, isDiagramCapableStep } from "./study-message-normalize.js";

export const NARRATION_STORAGE_PREFIX = "studyCoach.";

export const SITUATIONS = {
  FIRST_VISIT: "first_visit",
  EXPLICIT_PLAY: "explicit_play",
  COMPLEX_VISUAL: "complex_visual",
  STRUGGLING: "struggling",
  ACCESSIBILITY: "accessibility",
};

export const BLOCKERS = {
  DISABLED: "disabled",
  DISMISSED: "dismissed",
  SKIMMING: "skimming",
  SHORT_TEXT: "short_text",
  HIDDEN_TAB: "hidden_tab",
};

export const MIN_NARRATION_CONTENT_CHARS = 120;
export const COACH_MESSAGE_WINDOW_MS = 2 * 60 * 1000;
export const STEP_IDLE_STRUGGLE_MS = 30 * 1000;
export const SKIM_SCROLL_VELOCITY = 2.5;
export const SKIM_MIN_DEPTH = 0.45;
export const SKIM_MAX_PAUSE_MS = 4000;

export function narrationStorageKey(assignmentId, field) {
  return `${NARRATION_STORAGE_PREFIX}${field}:${assignmentId}`;
}

function safeGetItem(storage, key) {
  if (!storage) {
    return null;
  }
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function safeSetItem(storage, key, value) {
  if (!storage) {
    return;
  }
  try {
    storage.setItem(key, value);
  } catch {
    // Ignore quota or privacy-mode failures.
  }
}

export function readVisitCount(assignmentId, storage = null) {
  const raw = safeGetItem(storage, narrationStorageKey(assignmentId, "visitCount"));
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

export function incrementVisitCount(assignmentId, storage = null) {
  const next = readVisitCount(assignmentId, storage) + 1;
  safeSetItem(storage, narrationStorageKey(assignmentId, "visitCount"), String(next));
  return next;
}

export function isNarrationDismissed(assignmentId, storage = null) {
  return safeGetItem(storage, narrationStorageKey(assignmentId, "narrationDismissed")) === "true";
}

export function setNarrationDismissed(assignmentId, dismissed = true, storage = null) {
  const key = narrationStorageKey(assignmentId, "narrationDismissed");
  if (dismissed) {
    safeSetItem(storage, key, "true");
  } else {
    try {
      storage?.removeItem(key);
    } catch {
      // Ignore storage failures.
    }
  }
}

export function isSessionNarrationDismissed(assignmentId, sessionStorage = null) {
  return safeGetItem(sessionStorage, narrationStorageKey(assignmentId, "narrationSessionDismissed")) === "true";
}

export function setSessionNarrationDismissed(assignmentId, dismissed = true, sessionStorage = null) {
  const key = narrationStorageKey(assignmentId, "narrationSessionDismissed");
  if (dismissed) {
    safeSetItem(sessionStorage, key, "true");
  } else {
    try {
      sessionStorage?.removeItem(key);
    } catch {
      // Ignore storage failures.
    }
  }
}

export function hasComplexVisual({ steps = [], portions = [], formulas = [] } = {}) {
  if (hasDiagramSteps(steps)) {
    return true;
  }

  if (steps.some((step) => step.diagramSpec || step.diagramMermaid)) {
    return true;
  }

  if (steps.some((step) => String(step.imageUrl || "").trim())) {
    return true;
  }

  if (Array.isArray(formulas) && formulas.length > 0) {
    return true;
  }

  return portions.some((portion) => {
    const content = String(portion.content || "");
    return /```\s*mermaid/i.test(content) || /diagram|visual|flash/i.test(content);
  });
}

export function getMessageContentLength(payload = {}) {
  const intro = String(payload.intro || "").trim();
  const stepsText = (payload.steps || []).map((step) => String(step.text || step.title || "").trim()).join(" ");
  const portionText = (payload.portions || []).map((portion) => String(portion.content || portion.label || "").trim()).join(" ");
  return (intro + " " + stepsText + " " + portionText).trim().length;
}

export function isShortTextOnly(messageContext = {}) {
  if (messageContext.hasComplexVisual) {
    return false;
  }
  return getMessageContentLength(messageContext.payload || {}) < MIN_NARRATION_CONTENT_CHARS;
}

export function isSkimmingPattern(signals = {}) {
  if (signals.skimmingDetected) {
    return true;
  }

  if (
    Number(signals.maxScrollVelocity || 0) >= SKIM_SCROLL_VELOCITY &&
    Number(signals.maxScrollDepth || 0) >= SKIM_MIN_DEPTH &&
    Number(signals.longestPauseMs || 0) < SKIM_MAX_PAUSE_MS
  ) {
    return true;
  }

  return false;
}

export function isStruggling(signals = {}) {
  return (
    Number(signals.recentCoachMessageCount || 0) >= 2 ||
    Number(signals.stepRevisitCount || 0) >= 1 ||
    Number(signals.stepIdleMs || 0) >= STEP_IDLE_STRUGGLE_MS
  );
}

export function createDefaultBrowseSignals(overrides = {}) {
  return {
    assignmentId: "",
    isFirstVisit: false,
    narrationDismissed: false,
    sessionDismissed: false,
    tabVisible: true,
    explicitPlayRequested: false,
    pageTimeMs: 0,
    maxScrollDepth: 0,
    maxScrollVelocity: 0,
    longestPauseMs: 0,
    skimmingDetected: false,
    recentCoachMessageCount: 0,
    stepRevisitCount: 0,
    stepIdleMs: 0,
    lastInteractionAt: 0,
    activeStepKey: "",
    prefersReducedMotion: false,
    ...overrides,
  };
}

export function buildMessageContext(payload = {}) {
  const hasVisual = hasComplexVisual(payload);
  return {
    payload,
    hasComplexVisual: hasVisual,
    contentLength: getMessageContentLength(payload),
  };
}

/**
 * Score whether narration should be offered or auto-started.
 */
export function evaluateSituationalNarration(signals = {}, messageContext = null, options = {}) {
  const clientNarrationEnabled = options.clientNarrationEnabled !== false;
  const prefersReducedMotion = Boolean(signals.prefersReducedMotion ?? options.prefersReducedMotion);

  if (!clientNarrationEnabled) {
    return {
      shouldOfferNarration: false,
      shouldAutoNarrate: false,
      blockers: [BLOCKERS.DISABLED],
      situations: [],
    };
  }

  if (signals.explicitPlayRequested) {
    return {
      shouldOfferNarration: true,
      shouldAutoNarrate: true,
      blockers: [],
      situations: [SITUATIONS.EXPLICIT_PLAY],
    };
  }

  const blockers = [];
  const situations = [];

  if (signals.narrationDismissed || signals.sessionDismissed) {
    blockers.push(BLOCKERS.DISMISSED);
  }
  if (!signals.tabVisible) {
    blockers.push(BLOCKERS.HIDDEN_TAB);
  }
  if (isSkimmingPattern(signals)) {
    blockers.push(BLOCKERS.SKIMMING);
  }
  if (messageContext && isShortTextOnly(messageContext)) {
    blockers.push(BLOCKERS.SHORT_TEXT);
  }

  if (!blockers.includes(BLOCKERS.DISMISSED)) {
    if (signals.isFirstVisit) {
      situations.push(SITUATIONS.FIRST_VISIT);
    }
    if (messageContext?.hasComplexVisual) {
      situations.push(SITUATIONS.COMPLEX_VISUAL);
    }
    if (isStruggling(signals)) {
      situations.push(SITUATIONS.STRUGGLING);
    }
    if (!prefersReducedMotion && !signals.sessionDismissed) {
      situations.push(SITUATIONS.ACCESSIBILITY);
    }
  }

  if (blockers.length > 0) {
    return {
      shouldOfferNarration: false,
      shouldAutoNarrate: false,
      blockers,
      situations: [],
    };
  }

  const shouldOfferNarration = situations.length > 0;
  const shouldAutoNarrate =
    shouldOfferNarration && signals.isFirstVisit && situations.includes(SITUATIONS.FIRST_VISIT);

  return {
    shouldOfferNarration,
    shouldAutoNarrate,
    blockers,
    situations,
  };
}

export function resolveHeroStep(steps = []) {
  if (!Array.isArray(steps) || !steps.length) {
    return null;
  }
  return steps.find(isDiagramCapableStep) || null;
}
