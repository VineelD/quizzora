import { attachDiagramsToCoachSteps } from "./study-diagrams.js";
import { attachNarrationToCoachPortions, attachNarrationToCoachSteps } from "./study-narration.js";
import { studyServerTtsEnabled } from "./study-narration-config.js";
import { buildCurriculumPromptContext, parseFocusLabel } from "./curriculum-topics.js";
import { detectTopicMention } from "./topic-vocab-suggest.js";
import { studentFacingFocus } from "./student-display.js";
import { buildCoachHelpPayload, isCoachHelpMessage } from "./study-coach-help.js";
import { buildCoachPayload, normalizeCoachSteps, stepsToPlainText } from "./study-message-payload.js";
import { buildOffTopicRedirect, isLikelyOnTopicMessage, shouldForceOffTopic } from "./study-topic.js";
import { normalizeDiagramSpec } from "./study-diagram-render.js";
import { sanitizeStudyMathContent, stripAsciiDiagramArtifacts } from "./study-message-content.js";
import { buildOpenAiFailure, fetchOpenAiWithRetry, resolveOpenAiRetryOptions } from "./openai-errors.js";
import { isOpenAiSessionExpiredError } from "./study-openai-session.js";

const MEDIA_BUDGET_MS = Number(process.env.STUDY_COACH_MEDIA_BUDGET_MS || 45000);

const CHEAT_PATTERNS = [
  /\bquiz answer/i,
  /\bwhat is the answer/i,
  /\bgive me the answer/i,
  /\btell me the answer/i,
  /\bwhich option/i,
  /\bmultiple[- ]choice answer/i,
  /\bsolve (this|the) (question|problem) for me/i,
];

const REFUSAL_MESSAGE =
  "I can help you learn the concepts, but I cannot answer assessment questions or give you quiz solutions. Try asking me to explain a concept or walk through a similar worked example.";

const DEFAULT_FOLLOW_UPS = [
  "Show me another example of this concept",
  "Show me a concept visual for this topic",
  "Give me a quick check-for-understanding question",
];

const DIAGRAM_REQUEST_PATTERNS = [
  /\b(create|draw|show|make|generate)\b[^.]{0,40}\b(similar\s+)?diagram\b/i,
  /\b(similar\s+)?diagram\b/i,
  /\bstep[- ]by[- ]step\s+(diagram|visual)/i,
  /\b(labelled|labeled)\s+diagram\b/i,
  /\bvisuali[sz]e\b/i,
];

export function studentRequestsDiagram(message) {
  const text = String(message || "").trim();
  if (!text) {
    return false;
  }
  return DIAGRAM_REQUEST_PATTERNS.some((pattern) => pattern.test(text));
}

function inferDiagramType(context, message) {
  const text = `${message} ${context.focus || ""} ${context.subject || ""}`.toLowerCase();
  if (/fibonacci|recursion|recursive|fib\(/.test(text)) {
    return "recursion_tree";
  }
  if (/cell|organelle|mitochondria|nucleus/.test(text)) {
    return "cell_diagram";
  }
  if (/number line/.test(text)) {
    return "number_line";
  }
  if (/venn/.test(text)) {
    return "venn_diagram";
  }
  if (/flow|process|step/.test(text)) {
    return "process_diagram";
  }
  return "generic";
}

function inferRecursionDiagramSpec(context, message, labels = []) {
  const text = `${message} ${context.focus || ""} ${context.subject || ""}`;
  const fibMatch = text.match(/\bfib\s*\(\s*(\d+)\s*\)/i) || text.match(/\bfibonacci\s*\(\s*(\d+)\s*\)/i);
  const root = fibMatch ? Number(fibMatch[1]) : 4;
  const depth = Math.min(Math.max(Number.isFinite(root) ? root : 4, 3), 6);

  return {
    diagramType: "recursion_tree",
    root: depth,
    depth,
    labels: Array.isArray(labels) ? labels.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 16) : [],
  };
}

function attachRecursionDiagramSpec(step, context, message) {
  const diagramType = String(step?.diagramType || inferDiagramType(context, message)).trim();
  if (diagramType !== "recursion_tree") {
    return step;
  }
  if (normalizeDiagramSpec(step?.diagramSpec)) {
    return step;
  }

  return {
    ...step,
    diagramType: "recursion_tree",
    diagramSpec: inferRecursionDiagramSpec(context, message, step?.diagramLabels),
  };
}

function enrichDiagramSteps(steps, context, message) {
  return steps.map((step) => {
    const hasDiagramFields = Boolean(
      String(step.diagramPrompt || step.imagePrompt || "").trim() || step.diagramType || step.diagramSpec,
    );
    if (!hasDiagramFields) {
      return step;
    }
    return attachRecursionDiagramSpec(step, context, message);
  });
}

function cleanupDiagramStepText(text) {
  return sanitizeStudyMathContent(stripAsciiDiagramArtifacts(text));
}

function cleanupDiagramText(payload) {
  const steps = Array.isArray(payload.steps)
    ? payload.steps.map((step) => ({
        ...step,
        text: cleanupDiagramStepText(step.text),
      }))
    : [];
  const portions = (payload.portions || []).map((portion) => ({
    ...portion,
    content: cleanupDiagramStepText(portion.content),
  }));
  return { ...payload, steps, portions };
}

export function ensureDiagramResponse(payload, context, message) {
  const wantsDiagram = studentRequestsDiagram(message);
  if (!wantsDiagram) {
    return payload;
  }

  let result = cleanupDiagramText(payload);
  const steps = Array.isArray(result.steps) ? result.steps.map((step) => ({ ...step })) : [];
  const hasDiagram = steps.some((step) => String(step.diagramPrompt || step.imagePrompt || "").trim());

  if (hasDiagram) {
    const prompted = steps.filter((step) => String(step.diagramPrompt || step.imagePrompt || "").trim()).length;
    const focus = context.focus || "this topic";
    return {
      ...result,
      steps: enrichDiagramSteps(
        steps.map((step, index) => ({
          ...step,
          text:
            cleanupDiagramStepText(step.text) ||
            (index === 0 ? `Here is a labelled diagram for ${focus}.` : step.text),
        })),
        context,
        message,
      ),
      visualSequence: result.visualSequence ?? prompted >= 2,
    };
  }

  const focus = context.focus || "this topic";
  const diagramType = inferDiagramType(context, message);
  const diagramPrompt = `Frame 1 of 1: ${diagramType.replace(/_/g, " ")} for ${focus} — clear readable labels, white background, Australian ${context.yearLevel} ${context.subject}`;
  const recursionSpec =
    diagramType === "recursion_tree" ? inferRecursionDiagramSpec(context, message) : null;
  const diagramIntro = `Here is a labelled ${diagramType.replace(/_/g, " ")} for ${focus}.`;

  const upgradedSteps = steps.length
    ? steps.map((step, index) => ({
        ...step,
        text: cleanupDiagramStepText(step.text) || (index === 0 ? diagramIntro : step.text),
        ...(index === 0
          ? {
              diagramPrompt,
              diagramTitle: focus,
              diagramCaption: "Study the labelled parts carefully.",
              diagramLabels: step.diagramLabels || [],
              diagramType,
              diagramSpec: recursionSpec || step.diagramSpec,
              diagramSummary: `Visual explanation of ${focus}.`,
              diagramFrame: 1,
            }
          : {}),
      }))
    : [
        {
          title: "Diagram",
          text: diagramIntro,
          diagramPrompt,
          diagramTitle: focus,
          diagramCaption: "Study the labelled parts carefully.",
          diagramLabels: [],
          diagramType,
          diagramSpec: recursionSpec,
          diagramSummary: `Visual explanation of ${focus}.`,
          diagramFrame: 1,
        },
      ];

  const portions = (result.portions || []).map((portion) => ({
    ...portion,
    content: cleanupDiagramStepText(portion.content),
  }));

  return {
    ...result,
    steps: enrichDiagramSteps(upgradedSteps, context, message),
    portions,
    visualSequence: false,
  };
}

function mockSteps(context, onTopic) {
  const focusPath = parseFocusLabel(context.focus);
  if (!onTopic) {
    return buildCoachPayload({
      intro: buildOffTopicRedirect(context),
      steps: [],
      followUps: [`Explain ${context.focus} in simple terms`, "What vocabulary should I learn first?"],
      onTopic: false,
    });
  }

  return buildCoachPayload({
    intro: `Here's how ${context.focus} works in practice — let's apply this concept together.`,
    topicHeader: focusPath.subtopic || focusPath.topic || context.focus,
    breadcrumbs: [context.yearLevel, context.subject, focusPath.stream, focusPath.topic, focusPath.subtopic].filter(Boolean),
    keyIdeas: ["See the concept in action", "Spot the key idea", "Connect it to real life"],
    formulas: [],
    portions: [
      {
        id: "p1",
        label: "Concept in action",
        content: `**Here's how this works in practice:** you're looking at ${context.focus} for the first time. What catches your eye? Notice the overall shape before the fine print.`,
        narrationText: "Here's how this works in practice. What catches your eye when you look at this topic?",
      },
      {
        id: "p2",
        label: "How the pieces connect",
        content: `**Next,** the crucial pieces click into place. Link each part to something you already know — that's how the concept sticks.`,
        narrationText: "Next, the crucial pieces click into place. Link each part to something you already know.",
      },
      {
        id: "p3",
        label: "Your turn",
        content: `**Finally,** try explaining this concept to a friend in one sentence. If you can apply it, you own it.`,
        narrationText: "Finally, try explaining this concept to a friend in one sentence.",
      },
    ],
    steps: [
      {
        title: "Hero visual",
        text: "",
        diagramPrompt: `Flash card illustration: bold labelled ${context.focus} diagram for ${context.subject}, minimal clutter, white background, Australian ${context.yearLevel} textbook style — one compelling hero image`,
        diagramTitle: context.focus,
        diagramCaption: "Study this concept visual — what does it show about the idea?",
        diagramLabels: ["Main idea", "Key part", "Connection"],
        diagramType: "concept_map",
        diagramSummary: `A single concept visual capturing ${context.focus}.`,
        callouts: [{ label: "Key idea", detail: "The heart of what we're applying" }],
        engagementHook: "What is the first thing you notice in this visual?",
        diagramFrame: 1,
      },
    ],
    followUps: [
      "Show me another example of this concept",
      "Give me a quick check-for-understanding question",
      "Show me a similar worked example",
    ],
    onTopic: true,
  });
}

export function buildStudyCoachSystemPrompt(context, { studentTopic = null } = {}) {
  const intentions = Array.isArray(context.learningIntentions) ? context.learningIntentions : [];
  const focusPath = parseFocusLabel(context.focus);
  const displayFocus = studentFacingFocus(context.focus, context.title);
  const subtopicCount = Array.isArray(context.selectedSubtopics) ? context.selectedSubtopics.length : 0;
  const activeSubtopic =
    studentTopic?.displayLabel ||
    studentTopic?.label ||
    focusPath.subtopic ||
    focusPath.topic ||
    displayFocus;
  const curriculumContext = buildCurriculumPromptContext({
    yearLevel: context.yearLevel,
    subject: context.subject,
    focus: context.focus,
  });
  const breadcrumb = [
    context.yearLevel,
    context.subject,
    focusPath.stream,
    focusPath.topic,
    focusPath.subtopic,
  ]
    .filter(Boolean)
    .join(" › ");

  const multiTopicGuidance =
    subtopicCount > 3
      ? `
Multi-topic assignment (${subtopicCount} subtopics):
- Teach ONE concept at a time. Do NOT list every subtopic in intro, portions, or breadcrumbs.
- The student's current focus is "${activeSubtopic}" — stay on that unless they clearly ask to switch.
- Mention at most 1–2 related subtopics when connecting ideas; never dump the full syllabus in one reply.
- Use topicHeader for the current concept only (not a catalogue of all assignment subtopics).`
      : studentTopic
        ? `
Student topic focus:
- The student is asking about "${activeSubtopic}". Center this reply on that concept only.
- Do not recap unrelated subtopics from the wider assignment unless they ask.`
        : "";

  return `
You are Quizzora Study Coach, a warm tutor who helps Australian ${context.yearLevel} students understand concepts through real-world application.

Assignment focus:
- Subject: ${context.subject}
- Topic path: ${breadcrumb}
- Student-facing summary: ${displayFocus}
- Curriculum summary: ${context.curriculumSummary}
- Learning intentions:
${intentions.map((item) => `  - ${item}`).join("\n") || "  - Review the core concepts for this topic."}
${multiTopicGuidance}

Curriculum alignment:
${curriculumContext}

Application-based understanding (primary — this is free text, no audio required):
- Use clear Australian English and a practical, encouraging voice — open with hooks like "Here's how this works in practice...", "Let's apply this concept...", "See this idea in action...", "In real life...".
- Sound like a patient, encouraging tutor — never sarcastic, silly, or mocking.
- Teach through short applied portions: vivid but concise prose grounded in real use, analogies, and one gentle question per portion.
- Return 1–3 punchy portions (concept applications) — NOT a long step-by-step lecture or wall of text.
- Each portion has markdown content (use **bold** for key application points) and narrationText: plain spoken explanation script (max ~35 words, conversational tutor tone).
- Weave Socratic questions into the explanation; use short worked examples on NEW similar problems only (never the graded quiz).

Concept visuals (one hero image per reply):
- Every explanation should include ONE compelling hero visual — either diagramSpec/diagramMermaid for math/science OR a single diagramPrompt for a clean "flash card" illustration (bold formula, labelled diagram, minimal clutter).
- Put the hero visual on exactly one step (steps[0]); leave step text empty or one short caption — the applied explanation lives in portions[], not in step text.
- Default to a single flash visual. Only use 2–3 progressive frames when the student explicitly asks for "step by step" or "walkthrough".
- When the student asks for a diagram, return structured visuals immediately — never ASCII art, arrow flows (F0 --> F1), or "### Diagram:" / "### Labels:" sections in portion content or step text.
- Never ask "Would you like a visual image?" — auto-generate when requested.
- Do not write "OFF-TOPIC:" in intro, portions, or step text; set onTopic in JSON only.
- For recursion_tree and number_line: return diagramSpec with numeric values and omit diagramPrompt. Example: { "diagramType": "recursion_tree", "root": 4, "depth": 3, "labels": ["fib(4)"] } or { "diagramType": "number_line", "min": -2, "max": 6, "points": [0, 3], "intervals": [{ "from": 1, "to": 5, "label": "solution" }] }.
- For flowchart and process_diagram: return diagramMermaid with valid Mermaid syntax (omit diagramPrompt).
- For cell_diagram, concept_map, generic: use diagramPrompt starting with "Flash card illustration:" — one bold hero image, not multi-frame unless explicitly requested.
- Never use ASCII diagram art.
- Include diagramTitle, diagramCaption, diagramLabels, diagramType, diagramSummary on the hero step.
- Add one engagementHook on the hero step.
- Populate keyIdeas (2–4 short chips) and formulas (label + KaTeX expression in $...$) when equations or rules matter — formulas render as flash cards in the UI.

Math and formulas (mandatory for any equations):
- Wrap ALL math in $...$ inline or $$...$$ display — NEVER emit raw \\frac, \\sqrt, subscripts, or backslash commands outside delimiters.
- Every equation that matters MUST appear in formulas[] as { "label": "Rule name", "expression": "$...$ or plain LaTeX" } for flash-card rendering — duplicate key equations in portion content using the same delimiters.
- Use unicode symbols only inside $...$ after conversion; prefer LaTeX commands inside delimiters.
- Never attempt diagrams, trees, number lines, or labelled visuals as ASCII art, arrow flows (F0 --> F1), LaTeX in prose, or "### Diagram:" / "### Labels:" sections — those belong ONLY in diagramSpec, diagramMermaid, or diagramPrompt/imageUrl on the hero step.

Topic guardrails:
- Stay strictly on ${context.subject}: ${activeSubtopic}. If the student goes off-topic, gently redirect back.
- Set onTopic to false (and redirect) for messages unrelated to this assignment, including:
  - Politics, elections, partisan topics, voting advice, or opinions on politicians/parties
  - Religion debates or personal faith questions (unless this assignment's curriculum explicitly covers them)
  - Violence, weapons, or adult/sexual content
  - General news, celebrity gossip, or current affairs not tied to ${context.focus}
  - Homework or concepts from a different school subject
- Never reveal, guess, or confirm answers for the student's assigned assessment.
- If asked for quiz answers or to solve assigned questions, refuse briefly and redirect to concept learning.
- Do not mention that you lack access to the quiz; stay in teaching mode.

Response format:
Return ONLY valid JSON (no markdown fences) with this shape:
{
  "topicHeader": "short lesson title for the current subtopic",
  "breadcrumbs": ["${context.yearLevel}", "${context.subject}", "..."],
  "keyIdeas": ["short concept chip 1", "short concept chip 2"],
  "formulas": [{ "label": "Rule name", "expression": "$F_n = F_{n-1} + F_{n-2}$" }],
  "intro": "optional one-line application hook before portions (e.g. Here's how this concept works in practice...)",
  "introNarrationText": "optional plain spoken concept spotlight — omit when portions carry the narration",
  "onTopic": true,
  "followUps": ["short clickable follow-up 1", "short follow-up 2"],
  "portions": [
    {
      "id": "p1",
      "label": "Concept in action",
      "content": "Application portion markdown — vivid practical prose, use $...$ or $$...$$ for formulas",
      "narrationText": "Here's how a sequence that starts with zero and one works. Each new term is the sum of the two before it."
    }
  ],
  "steps": [
    {
      "title": "Hero visual",
      "text": "optional one-line caption or empty string — applied explanation belongs in portions",
      "narrationText": "optional spoken caption for the visual",
      "diagramPrompt": "Flash card illustration: specific single hero image brief, or empty when using diagramSpec or diagramMermaid",
      "diagramMermaid": "valid Mermaid source for flowchart/process_diagram, or empty string",
      "diagramSpec": { "diagramType": "recursion_tree", "root": 4, "depth": 3, "labels": ["fib(4)"] },
      "diagramTitle": "short on-diagram title",
      "diagramCaption": "one-line caption explaining what to notice",
      "diagramLabels": ["Label 1", "Label 2"],
      "diagramType": "recursion_tree",
      "diagramSummary": "One sentence on what this diagram teaches",
      "diagramFrame": 1,
      "callouts": [{ "label": "Part name", "detail": "One-line explanation" }],
      "engagementHook": "Short question for the student to answer mentally or in chat"
    }
  ]
}

Always return 1–3 application portions with discrete content — do NOT dump everything in one paragraph. Put formulas in portions using $...$ / $$...$$ delimiters AND in the formulas array for flash-card rendering.
Return 0–1 hero visual step by default (steps[0] with diagramSpec, diagramMermaid, or diagramPrompt). Never put diagram content in portion markdown — use structured diagram fields only. Use 2–3 steps ONLY when the student explicitly requests a step-by-step visual walkthrough.
For multi-frame sequences only: say 'Frame X of N' and build on the previous layout.
Set onTopic to false if the student's latest message is unrelated to ${context.subject} / ${context.focus} — especially politics, elections, religion debates, violence, adult content, general news, or other-subject homework.
When onTopic is false, use a brief practical redirect intro (e.g. "I focus on this assignment's topics — ${context.subject}, ${context.focus}.") and a single redirect portion (omit steps).
`.trim();
}

export function shouldRefuseStudentMessage(message) {
  const text = String(message || "").trim();
  if (!text) {
    return false;
  }
  return CHEAT_PATTERNS.some((pattern) => pattern.test(text));
}

function normalizeFollowUps(value) {
  if (!Array.isArray(value)) {
    return DEFAULT_FOLLOW_UPS;
  }
  const cleaned = value.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 3);
  return cleaned.length ? cleaned : DEFAULT_FOLLOW_UPS;
}

function applyOffTopicGuard(context, message, payload) {
  if (!shouldForceOffTopic(context, message)) {
    return payload;
  }

  return buildCoachPayload({
    intro: buildOffTopicRedirect(context),
    steps: [],
    followUps: [`Explain ${context.focus} in simple terms`, "What vocabulary should I learn first?"],
    onTopic: false,
  });
}

function parseCoachPayload(rawText, context, message) {
  const text = String(rawText || "").trim();
  if (!text) {
    throw new Error("Study Coach returned an empty response.");
  }

  const tryParse = (value) => {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  };

  let parsed = tryParse(text);
  if (!parsed) {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      parsed = tryParse(jsonMatch[0]);
    }
  }

  if (parsed) {
    const fallbackText = parsed.reply || parsed.intro || "";
    const portions = parsed.portions || [];
    const steps = normalizeCoachSteps(parsed.steps, portions.length ? "" : fallbackText);
    return applyOffTopicGuard(
      context,
      message,
      buildCoachPayload({
        intro: parsed.intro || (portions.length || steps.length === 1 ? "" : fallbackText),
        introNarrationText: parsed.introNarrationText || "",
        topicHeader: parsed.topicHeader || "",
        breadcrumbs: parsed.breadcrumbs || [],
        keyIdeas: parsed.keyIdeas || [],
        formulas: parsed.formulas || [],
        portions,
        steps,
        followUps: normalizeFollowUps(parsed.followUps),
        onTopic: parsed.onTopic !== false,
      }),
    );
  }

  return applyOffTopicGuard(
    context,
    message,
    buildCoachPayload({
      intro: "",
      steps: [{ title: "Step 1", text, diagramPrompt: "" }],
      followUps: DEFAULT_FOLLOW_UPS,
      onTopic: isLikelyOnTopicMessage(context, message),
    }),
  );
}

function mediaBudgetRemaining(deadline) {
  return Math.max(0, deadline - Date.now());
}

async function finalizeCoachPayload(payload, context, { requestNarration = false } = {}) {
  const deadline = Date.now() + MEDIA_BUDGET_MS;
  const stepsWithDiagrams = await attachDiagramsToCoachSteps(payload.steps, context, {
    visualSequence: payload.visualSequence,
    deadline,
  });
  const visualSequence = payload.visualSequence ?? stepsWithDiagrams.filter((step) => step.diagramPrompt).length >= 2;

  if (mediaBudgetRemaining(deadline) < 5000 || !studyServerTtsEnabled() || !requestNarration) {
    return {
      ...payload,
      steps: stepsWithDiagrams,
      introAudioUrl: "",
      visualSequence,
    };
  }

  const [stepNarration, portionNarration] = await Promise.all([
    attachNarrationToCoachSteps(stepsWithDiagrams, context, {
      intro: payload.portions?.length ? "" : payload.intro,
      introNarrationText: payload.portions?.length ? "" : payload.introNarrationText,
      visualSequence,
      deadline,
    }),
    attachNarrationToCoachPortions(payload.portions || [], context, { deadline }),
  ]);
  return {
    ...payload,
    steps: stepNarration.steps,
    portions: portionNarration.portions,
    introAudioUrl: payload.portions?.length ? "" : stepNarration.introAudioUrl,
    visualSequence,
  };
}

async function callOpenAiStudyCoach({ context, history, message, previousResponseId = null }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return null;
  }

  const studentTopic = detectTopicMention(message, {
    yearLevel: context.yearLevel,
    subject: context.subject,
    focus: context.focus,
    selectedTopicKeys: context.selectedTopicKeys,
    selectedSubtopics: context.selectedSubtopics,
    learningIntentions: context.learningIntentions,
    curriculumSummary: context.curriculumSummary,
  });

  const body = {
    model: process.env.STUDY_COACH_MODEL || process.env.OPENAI_MODEL || "gpt-4o-mini",
    temperature: 0.65,
    max_output_tokens: Number(process.env.STUDY_COACH_MAX_OUTPUT_TOKENS || 750),
  };

  if (previousResponseId) {
    body.previous_response_id = previousResponseId;
    body.input = String(message).trim();
  } else {
    body.instructions = buildStudyCoachSystemPrompt(context, { studentTopic });
    body.input = [
      ...history.map((entry) => ({
        role: entry.role === "assistant" ? "assistant" : "user",
        content: entry.content,
      })),
      { role: "user", content: String(message).trim() },
    ];
  }

  const endpoint = process.env.OPENAI_ENDPOINT || "https://api.openai.com/v1/responses";
  const openAiResponse = await fetchOpenAiWithRetry(
    endpoint,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
    resolveOpenAiRetryOptions(),
  );

  if (!openAiResponse.ok) {
    const failure = buildOpenAiFailure(
      openAiResponse.status,
      openAiResponse.errorText,
      openAiResponse.statusText,
    );
    throw new Error(failure.message);
  }

  const payload = await openAiResponse.json();
  return {
    rawReply: extractResponseText(payload),
    responseId: String(payload.id || "").trim() || null,
  };
}

export async function generateStudyCoachReply({
  context,
  history,
  message,
  previousResponseId = null,
  requestNarration = false,
}) {
  if (isCoachHelpMessage(message)) {
    const payload = buildCoachHelpPayload(context);
    return {
      content: stepsToPlainText(payload),
      payload,
      flagged: false,
      onTopic: true,
      followUps: payload.followUps,
      source: "help",
      responseId: null,
    };
  }

  if (shouldRefuseStudentMessage(message)) {
    const payload = buildCoachPayload({
      intro: REFUSAL_MESSAGE,
      steps: [],
      followUps: DEFAULT_FOLLOW_UPS,
      onTopic: false,
    });
    return {
      content: REFUSAL_MESSAGE,
      payload,
      flagged: true,
      onTopic: false,
      followUps: payload.followUps,
      source: "guardrail",
      responseId: null,
    };
  }

  if (process.env.STUDY_COACH_MOCK === "true") {
    const onTopic = isLikelyOnTopicMessage(context, message);
    const mockPayload = ensureDiagramResponse(mockSteps(context, onTopic), context, message);
    const payload = await finalizeCoachPayload(mockPayload, context, { requestNarration });
    return {
      content: stepsToPlainText(payload),
      payload,
      flagged: false,
      onTopic: payload.onTopic,
      followUps: payload.followUps,
      source: "mock",
      responseId: previousResponseId ? `mock_${previousResponseId}` : "mock_resp_initial",
    };
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    const onTopic = isLikelyOnTopicMessage(context, message);
    const payload = buildCoachPayload({
      intro: onTopic
        ? `Let's explore ${context.focus} step by step.`
        : buildOffTopicRedirect(context),
      steps: onTopic
        ? [
            {
              title: "Step 1",
              text: "Tell me which concept you want to unpack first, and I'll walk you through it one step at a time.",
              diagramPrompt: "",
            },
          ]
        : [],
      followUps: DEFAULT_FOLLOW_UPS,
      onTopic,
    });
    return {
      content: stepsToPlainText(payload),
      payload,
      flagged: false,
      onTopic,
      followUps: payload.followUps,
      source: "fallback",
      responseId: null,
    };
  }

  let openAiResult;
  try {
    openAiResult = await callOpenAiStudyCoach({ context, history, message, previousResponseId });
  } catch (error) {
    if (previousResponseId && isOpenAiSessionExpiredError(error)) {
      openAiResult = await callOpenAiStudyCoach({ context, history, message, previousResponseId: null });
    } else {
      throw error;
    }
  }

  let parsed = parseCoachPayload(openAiResult.rawReply, context, message);
  parsed = ensureDiagramResponse(parsed, context, message);
  parsed = applyOffTopicGuard(context, message, parsed);
  const flagged = shouldRefuseStudentMessage(stepsToPlainText(parsed));

  if (flagged) {
    parsed = buildCoachPayload({
      intro: REFUSAL_MESSAGE,
      steps: [],
      followUps: DEFAULT_FOLLOW_UPS,
      onTopic: false,
    });
  }

  parsed = await finalizeCoachPayload(parsed, context, { requestNarration });

  return {
    content: stepsToPlainText(parsed),
    payload: parsed,
    flagged,
    onTopic: flagged ? false : parsed.onTopic,
    followUps: parsed.followUps,
    source: "openai",
    responseId: openAiResult.responseId,
  };
}

function extractResponseText(payload) {
  if (typeof payload.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  const content = payload.output
    ?.flatMap((item) => item.content || [])
    ?.map((item) => item.text || "")
    ?.join("")
    ?.trim();

  if (!content) {
    throw new Error("Study Coach returned an empty response.");
  }

  return content;
}
