import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildIntroNarrationScript,
  buildPortionNarrationScript,
  buildStepNarrationScript,
} from "../lib/study-narration-script.js";
import { studyClientNarrationEnabled, studyServerTtsEnabled } from "../lib/study-narration-config.js";
import { attachNarrationToCoachPortions, attachNarrationToCoachSteps } from "../lib/study-narration.js";

function withEnv(overrides, run) {
  const previous = {};
  for (const [key, value] of Object.entries(overrides)) {
    previous[key] = process.env[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    return run();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

test("step narration script includes frame context and callouts", () => {
  const script = buildStepNarrationScript(
    {
      title: "Step 1 — Big picture",
      text: "Notice the overall structure first.",
      callouts: [{ label: "Nucleus", detail: "Control centre" }],
    },
    { frameIndex: 1, totalFrames: 3 },
  );

  assert.match(script, /part 1 of 3/i);
  assert.match(script, /Big picture/);
  assert.match(script, /Nucleus: Control centre/);
});

test("step narration prefers narrationText over raw display markdown", () => {
  const script = buildStepNarrationScript({
    narrationText: "N factorial equals one hundred and twenty.",
    text: "$n! = 120$",
  });

  assert.equal(script, "N factorial equals one hundred and twenty.");
});

test("intro narration script is trimmed", () => {
  const script = buildIntroNarrationScript("  Let's begin the walkthrough.  ");
  assert.equal(script, "Let's begin the walkthrough.");
});

test("portion narration script uses narrationText only", () => {
  const script = buildPortionNarrationScript({
    label: "Fibonacci definition",
    narrationText: "Fibonacci starts with zero and one.",
    content: "$F_0 = 0$",
  });

  assert.equal(script, "Fibonacci starts with zero and one.");
});

test("server TTS is off unless explicitly enabled", () => {
  withEnv(
    {
      STUDY_COACH_TTS_ENABLED: undefined,
      STUDY_COACH_NARRATION_ENABLED: undefined,
      STUDY_COACH_NARRATION: undefined,
      NEXT_PUBLIC_STUDY_COACH_NARRATION_ENABLED: undefined,
    },
    () => {
      assert.equal(studyServerTtsEnabled(), false);
    },
  );

  withEnv({ STUDY_COACH_TTS_ENABLED: "true", STUDY_COACH_NARRATION: undefined }, () => {
    assert.equal(studyServerTtsEnabled(), true);
  });

  withEnv({ STUDY_COACH_TTS_ENABLED: "false", STUDY_COACH_NARRATION: "true" }, () => {
    assert.equal(studyServerTtsEnabled(), false);
  });
});

test("client narration is off unless explicitly enabled", () => {
  withEnv(
    {
      STUDY_COACH_NARRATION_ENABLED: undefined,
      NEXT_PUBLIC_STUDY_COACH_NARRATION_ENABLED: undefined,
    },
    () => {
      assert.equal(studyClientNarrationEnabled(), false);
    },
  );

  withEnv({ STUDY_COACH_NARRATION_ENABLED: "true" }, () => {
    assert.equal(studyClientNarrationEnabled(), true);
  });
});

test("attach portion narration skips when disabled", async () => {
  await withEnv({ STUDY_COACH_TTS_ENABLED: "false", STUDY_COACH_NARRATION: undefined }, async () => {
    const portions = [{ label: "Intro", content: "Cells.", narrationText: "Cells are tiny." }];
    const result = await attachNarrationToCoachPortions(portions, { subject: "Science", yearLevel: "Year 7" });

    assert.equal(result.portions[0].audioUrl || "", "");
  });
});

test("attach narration skips when disabled", async () => {
  await withEnv({ STUDY_COACH_TTS_ENABLED: "false", STUDY_COACH_NARRATION: undefined }, async () => {
    const steps = [{ text: "Explain cells.", title: "Step 1" }];
    const result = await attachNarrationToCoachSteps(steps, { subject: "Science", yearLevel: "Year 7" });

    assert.equal(result.introAudioUrl, "");
    assert.equal(result.steps[0].audioUrl, undefined);
  });
});
