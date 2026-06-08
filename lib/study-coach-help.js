import { buildCoachPayload } from "./study-message-payload.js";

export function isCoachHelpMessage(message) {
  const text = String(message || "").trim().toLowerCase();
  if (!text) {
    return false;
  }
  return /^(stuck|help|i am stuck|i'm stuck|im stuck|confused|not sure|unsure|where do i start|how do i start|what now)\??$/.test(
    text,
  );
}

export function buildCoachHelpPayload(context) {
  return buildCoachPayload({
    intro: "No worries — let's get you moving.",
    steps: [
      {
        title: "Step 1 — Start with one idea",
        text: `Pick one part of ${context.focus} that feels fuzzy — for example slope, intercept, or plotting points. Ask me to explain just that piece in plain language.`,
        diagramPrompt: "",
        engagementHook: "Which single word from this topic feels hardest right now?",
      },
      {
        title: "Step 2 — Build from there",
        text: "When that clicks, ask for a step-by-step diagram or a similar worked example. I'll guide you without giving quiz answers.",
        diagramPrompt: "",
        engagementHook: "Try one of the suggested prompts above to keep going.",
      },
    ],
    followUps: [
      "Explain the main concepts step by step",
      "Show me a labelled diagram for this topic",
      "Give me a quick check-for-understanding question",
    ],
    onTopic: true,
  });
}
