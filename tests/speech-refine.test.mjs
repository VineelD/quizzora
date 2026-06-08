import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applyMlVocabRefinement,
  cosineSimilarity,
  findNearestVocabTerm,
  resetSpeechRefineMlState,
} from "../lib/speech-refine-ml.js";
import {
  SPEECH_REFINE_VOCAB_CAP,
  studyCoachSpeechMlModel,
  studyCoachSpeechMlRefineEnabled,
} from "../lib/speech-refine-config.js";
import {
  checkSpeechRefineRateLimit,
  resetSpeechRefineRateLimits,
} from "../lib/speech-refine-rate-limit.js";
import { refineSpeechText } from "../lib/speech-refine.js";

const SPEECH_ML_ENV_KEYS = ["STUDY_COACH_SPEECH_ML_REFINE", "STUDY_COACH_SPEECH_ML_MODEL"];

function withSpeechMlEnv(values, run) {
  const saved = Object.fromEntries(SPEECH_ML_ENV_KEYS.map((key) => [key, process.env[key]]));
  try {
    for (const key of SPEECH_ML_ENV_KEYS) {
      if (values[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = values[key];
      }
    }
    return run();
  } finally {
    for (const key of SPEECH_ML_ENV_KEYS) {
      if (saved[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = saved[key];
      }
    }
  }
}

test("cosineSimilarity returns 1 for identical vectors", () => {
  assert.equal(cosineSimilarity([1, 0, 0], [1, 0, 0]), 1);
});

test("findNearestVocabTerm picks the highest-scoring term", () => {
  const match = findNearestVocabTerm(
    [1, 0],
    [
      [0.2, 0.9],
      [0.95, 0.1],
      [0.1, 0.1],
    ],
    ["photosynthesis", "Fibonacci", "discriminant"],
  );

  assert.equal(match.term, "Fibonacci");
  assert.ok(match.score > 0.9);
});

test("applyMlVocabRefinement uses injected similarity function", async () => {
  resetSpeechRefineMlState();

  const findSimilarTerm = async (phrase) => {
    if (/fiber naughty/i.test(phrase)) {
      return { term: "Fibonacci", score: 0.91 };
    }
    return { term: null, score: 0 };
  };

  const result = await applyMlVocabRefinement("explain fiber naughty in this sequence", ["Fibonacci"], {
    findSimilarTerm,
  });

  assert.match(result.text, /Fibonacci/i);
  assert.equal(result.corrections.length, 1);
  assert.equal(result.corrections[0].to, "Fibonacci");
  assert.ok(result.corrections[0].score >= 0.9);
});

test("refineSpeechText applies local math rules and ML layer when mathMode is true", async () => {
  const findSimilarTerm = async (phrase) => {
    if (phrase === "disk comment") {
      return { term: "discriminant", score: 0.88 };
    }
    return { term: null, score: 0 };
  };

  const result = await refineSpeechText("disk comment and sin square theta", {
    mathMode: true,
    topicVocab: ["discriminant"],
    mlEnabled: true,
    findSimilarTerm,
  });

  assert.match(result.text, /discriminant/i);
  assert.match(result.text, /sin²θ/);
  assert.doesNotMatch(result.text, /\$/);
  assert.equal(result.corrections.some((entry) => entry.to === "discriminant"), true);
});

test("refineSpeechText skips ML when mathMode is false", async () => {
  let mlCalled = false;
  const findSimilarTerm = async () => {
    mlCalled = true;
    return { term: "Fibonacci", score: 0.99 };
  };

  const result = await refineSpeechText("quadratic disk comment formula", {
    mathMode: false,
    topicVocab: ["quadratic formula"],
    mlEnabled: true,
    findSimilarTerm,
  });

  assert.equal(mlCalled, false);
  assert.match(result.text, /disk comment/i);
  assert.equal(result.corrections.length, 0);
});

test("speech ML refine config defaults to enabled with MiniLM model", () => {
  withSpeechMlEnv({}, () => {
    assert.equal(studyCoachSpeechMlRefineEnabled(), true);
    assert.equal(studyCoachSpeechMlModel(), "Xenova/all-MiniLM-L6-v2");
  });
});

test("speech ML refine config respects env flags", () => {
  withSpeechMlEnv({ STUDY_COACH_SPEECH_ML_REFINE: "false" }, () => {
    assert.equal(studyCoachSpeechMlRefineEnabled(), false);
  });

  withSpeechMlEnv({ STUDY_COACH_SPEECH_ML_MODEL: "Xenova/custom-model" }, () => {
    assert.equal(studyCoachSpeechMlModel(), "Xenova/custom-model");
  });
});

test("speech refine rate limit allows one request per 400ms per session", () => {
  resetSpeechRefineRateLimits();

  const first = checkSpeechRefineRateLimit("student-1");
  const second = checkSpeechRefineRateLimit("student-1");

  assert.equal(first.allowed, true);
  assert.equal(second.allowed, false);
  assert.ok(second.retryAfterMs > 0);
});

test("vocab embedding batch is capped at 200 terms", () => {
  assert.equal(SPEECH_REFINE_VOCAB_CAP, 200);
});
