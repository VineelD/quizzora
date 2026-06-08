import assert from "node:assert/strict";
import { test } from "node:test";
import {
  BLOCKERS,
  buildMessageContext,
  evaluateSituationalNarration,
  hasComplexVisual,
  isNarrationDismissed,
  isSkimmingPattern,
  readVisitCount,
  setNarrationDismissed,
  SITUATIONS,
} from "../lib/study-narration-situational.js";

class MemoryStorage {
  constructor() {
    this.store = new Map();
  }

  getItem(key) {
    return this.store.has(key) ? this.store.get(key) : null;
  }

  setItem(key, value) {
    this.store.set(key, String(value));
  }

  removeItem(key) {
    this.store.delete(key);
  }
}

test("first visit offers narration and auto-narrates welcome", () => {
  const payload = {
    intro: "Welcome to your concept walkthrough about cells and organelles in this assignment.",
    steps: [{ title: "Big picture", text: "Start with the whole cell before zooming into parts." }],
  };
  const messageContext = buildMessageContext(payload);
  const result = evaluateSituationalNarration(
    {
      isFirstVisit: true,
      tabVisible: true,
      narrationDismissed: false,
      sessionDismissed: false,
      prefersReducedMotion: false,
    },
    messageContext,
    { clientNarrationEnabled: true },
  );

  assert.equal(result.shouldOfferNarration, true);
  assert.equal(result.shouldAutoNarrate, true);
  assert.ok(result.situations.includes(SITUATIONS.FIRST_VISIT));
});

test("dismissed narration preference blocks offer", () => {
  const payload = {
    intro: "Welcome to your concept walkthrough about cells and organelles in this assignment.",
    steps: [{ text: "Cells are the basic units of life and every organism is built from them." }],
  };
  const messageContext = buildMessageContext(payload);
  const result = evaluateSituationalNarration(
    {
      isFirstVisit: true,
      narrationDismissed: true,
      sessionDismissed: false,
      tabVisible: true,
    },
    messageContext,
  );

  assert.equal(result.shouldOfferNarration, false);
  assert.equal(result.shouldAutoNarrate, false);
  assert.ok(result.blockers.includes(BLOCKERS.DISMISSED));
});

test("skimming pattern blocks narration offer", () => {
  const payload = {
    intro: "A longer intro that is worth listening to when the student is actually reading.",
    steps: [{ text: "Mitochondria produce energy for the cell through cellular respiration." }],
  };
  const messageContext = buildMessageContext(payload);
  const result = evaluateSituationalNarration(
    {
      tabVisible: true,
      narrationDismissed: false,
      sessionDismissed: false,
      maxScrollDepth: 0.8,
      maxScrollVelocity: 3.2,
      longestPauseMs: 1200,
    },
    messageContext,
  );

  assert.equal(result.shouldOfferNarration, false);
  assert.ok(result.blockers.includes(BLOCKERS.SKIMMING));
  assert.equal(isSkimmingPattern({ maxScrollDepth: 0.8, maxScrollVelocity: 3.2, longestPauseMs: 1200 }), true);
});

test("complex visual offers narration without auto-start", () => {
  const payload = {
    steps: [
      {
        text: "This diagram shows how energy moves through the cell.",
        diagramMermaid: "graph TD; A-->B;",
      },
    ],
  };
  const messageContext = buildMessageContext(payload);

  assert.equal(hasComplexVisual(payload), true);

  const result = evaluateSituationalNarration(
    {
      isFirstVisit: false,
      tabVisible: true,
      narrationDismissed: false,
      sessionDismissed: false,
      prefersReducedMotion: false,
    },
    messageContext,
  );

  assert.equal(result.shouldOfferNarration, true);
  assert.equal(result.shouldAutoNarrate, false);
  assert.ok(result.situations.includes(SITUATIONS.COMPLEX_VISUAL));
});

test("short text-only replies do not offer narration", () => {
  const payload = {
    steps: [{ text: "Sure." }],
  };
  const messageContext = buildMessageContext(payload);
  const result = evaluateSituationalNarration(
    {
      tabVisible: true,
      narrationDismissed: false,
      sessionDismissed: false,
    },
    messageContext,
  );

  assert.equal(result.shouldOfferNarration, false);
  assert.ok(result.blockers.includes(BLOCKERS.SHORT_TEXT));
});

test("explicit play always enables narration", () => {
  const payload = { steps: [{ text: "Ok." }] };
  const messageContext = buildMessageContext(payload);
  const result = evaluateSituationalNarration(
    {
      explicitPlayRequested: true,
      narrationDismissed: true,
      tabVisible: false,
      skimmingDetected: true,
    },
    messageContext,
  );

  assert.equal(result.shouldOfferNarration, true);
  assert.equal(result.shouldAutoNarrate, true);
  assert.deepEqual(result.situations, [SITUATIONS.EXPLICIT_PLAY]);
});

test("visit count and dismissed prefs persist per assignment", () => {
  const storage = new MemoryStorage();
  const assignmentId = 42;

  assert.equal(readVisitCount(assignmentId, storage), 0);
  setNarrationDismissed(assignmentId, true, storage);
  assert.equal(isNarrationDismissed(assignmentId, storage), true);
});
