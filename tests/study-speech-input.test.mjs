import assert from "node:assert/strict";
import { test } from "node:test";
import { studySpeechInputEnabled } from "../lib/study-speech-input-config.js";
import {
  isStudySpeechInputSupported,
  speechInputErrorMessage,
  supportsSpeechRecognitionGrammars,
} from "../lib/study-speech-input.js";

const SPEECH_ENV_KEYS = [
  "NEXT_PUBLIC_STUDY_COACH_SPEECH_INPUT_ENABLED",
  "STUDY_COACH_SPEECH_INPUT_ENABLED",
];

function withSpeechEnv(values, run) {
  const saved = Object.fromEntries(SPEECH_ENV_KEYS.map((key) => [key, process.env[key]]));
  try {
    for (const key of SPEECH_ENV_KEYS) {
      if (values[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = values[key];
      }
    }
    return run();
  } finally {
    for (const key of SPEECH_ENV_KEYS) {
      if (saved[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = saved[key];
      }
    }
  }
}

test("speech input is unavailable in non-browser environments", () => {
  assert.equal(isStudySpeechInputSupported(), false);
});

test("speech input error messages are user friendly", () => {
  assert.match(speechInputErrorMessage("not-allowed"), /blocked/i);
  assert.match(speechInputErrorMessage("service-not-allowed"), /blocked/i);
  assert.match(speechInputErrorMessage("network"), /internet connection/i);
  assert.match(speechInputErrorMessage("no-speech"), /No speech detected/i);
});

test("speech recognition grammars are unavailable in node test runtime", () => {
  assert.equal(supportsSpeechRecognitionGrammars(), false);
});

test("study speech input is enabled by default", () => {
  withSpeechEnv({}, () => {
    assert.equal(studySpeechInputEnabled(), true);
  });
});

test("study speech input respects env flags", () => {
  withSpeechEnv({ STUDY_COACH_SPEECH_INPUT_ENABLED: "false" }, () => {
    assert.equal(studySpeechInputEnabled(), false);
  });

  withSpeechEnv({ NEXT_PUBLIC_STUDY_COACH_SPEECH_INPUT_ENABLED: "false" }, () => {
    assert.equal(studySpeechInputEnabled(), false);
  });

  withSpeechEnv(
    {
      STUDY_COACH_SPEECH_INPUT_ENABLED: "false",
      NEXT_PUBLIC_STUDY_COACH_SPEECH_INPUT_ENABLED: "true",
    },
    () => {
      assert.equal(studySpeechInputEnabled(), true);
    },
  );
});
