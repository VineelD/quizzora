import { attachDiagramsToCoachSteps } from "./study-diagrams.js";
import { attachNarrationToCoachPortions, attachNarrationToCoachSteps } from "./study-narration.js";
import { studyServerTtsEnabled } from "./study-narration-config.js";
import { buildCurriculumPromptContext, parseFocusLabel } from "./curriculum-topics.js";
import { studentFacingFocus } from "./student-display.js";
import { buildCoachHelpPayload, isCoachHelpMessage } from "./study-coach-help.js";
import { buildCoachPayload, extractCoachJsonObject, isCoachPayloadShape, isLikelyRawCoachJson, isOnyxToolStubText, normalizeCoachPayloadCandidate, normalizeCoachSteps, stepsToPlainText, stripLeadingOnyxToolStub } from "./study-message-payload.js";
import { buildOffTopicRedirect, isLikelyOnTopicMessage, shouldForceOffTopic } from "./study-topic.js";
import { inferCircuitDiagramSpec, looksLikeCircuitContent } from "./circuit-diagram.js";
import { normalizeDiagramSpec } from "./study-diagram-render.js";
import { sanitizeStudyMathContent, stripAsciiDiagramArtifacts } from "./study-message-content.js";
import { callStudyCoachLlm, resolveOllamaCoachSource, resolveStudyCoachProvider, shouldSkipDiagramsForCoachSource, streamOllamaStudyCoach, streamOnyxStudyCoach, usesOnyxChatSession, usesOpenAiResponseSession } from "./study-coach-llm.js";
import { resolveOnyxStreamingEnabled } from "./study-coach-onyx.js";
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

const COACH_FORMAT_FALLBACK_INTRO =
  "I had trouble formatting that explanation. Please try asking again in one sentence.";

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
  if (/circuit|resistor|parallel|series|ohm|voltage|current/.test(text)) {
    return "circuit";
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

function attachCircuitDiagramSpec(step, context, message) {
  const blob = `${message} ${step?.text || ""} ${context.focus || ""} ${context.subject || ""}`;
  if (!looksLikeCircuitContent(blob)) {
    return step;
  }

  const existing = normalizeDiagramSpec(step?.diagramSpec);
  if (existing?.diagramType === "circuit") {
    return {
      ...step,
      diagramType: "circuit",
      diagramPrompt: "",
      imagePrompt: "",
      text: cleanupDiagramStepText(step.text),
    };
  }

  const spec = inferCircuitDiagramSpec(blob);
  if (!spec) {
    return step;
  }

  const labels = spec.components.map((item) => `${item.id} ${item.value} ${item.unit}`);
  return {
    ...step,
    diagramType: "circuit",
    diagramSpec: spec,
    diagramPrompt: "",
    imagePrompt: "",
    diagramTitle: step.diagramTitle || "Circuit diagram",
    diagramCaption:
      step.diagramCaption ||
      `${spec.layout === "series" ? "Series" : "Parallel"} circuit with labelled resistors.`,
    diagramLabels: step.diagramLabels?.length ? step.diagramLabels : labels,
    diagramSummary: step.diagramSummary || "Standard circuit schematic with exact component values.",
    text: cleanupDiagramStepText(step.text),
  };
}

function enrichDiagramSteps(steps, context, message) {
  return steps.map((step) => {
    const enriched = attachCircuitDiagramSpec(step, context, message);
    const hasDiagramFields = Boolean(
      String(enriched.diagramPrompt || enriched.imagePrompt || "").trim() ||
        enriched.diagramType ||
        enriched.diagramSpec ||
        looksLikeCircuitContent(`${message} ${enriched.text || ""}`),
    );
    if (!hasDiagramFields) {
      return enriched;
    }
    return attachRecursionDiagramSpec(enriched, context, message);
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
  let result = cleanupDiagramText(payload);
  result = {
    ...result,
    steps: enrichDiagramSteps(result.steps || [], context, message),
  };

  const wantsDiagram = studentRequestsDiagram(message);
  if (!wantsDiagram) {
    return result;
  }

  const steps = Array.isArray(result.steps) ? result.steps.map((step) => ({ ...step })) : [];
  const hasDiagram = steps.some(
    (step) =>
      String(step.diagramPrompt || step.imagePrompt || "").trim() ||
      normalizeDiagramSpec(step.diagramSpec) ||
      String(step.diagramMermaid || "").trim(),
  );

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
  const circuitSpec =
    diagramType === "circuit" ? inferCircuitDiagramSpec(`${message} ${focus} ${steps[0]?.text || ""}`) : null;
  const diagramPrompt = circuitSpec
    ? ""
    : `Frame 1 of 1: ${diagramType.replace(/_/g, " ")} for ${focus} — clear readable labels, white background, Australian ${context.yearLevel} ${context.subject}`;
  const recursionSpec =
    diagramType === "recursion_tree" ? inferRecursionDiagramSpec(context, message) : null;
  const diagramIntro = circuitSpec
    ? `Here is the circuit schematic for ${focus}.`
    : `Here is a labelled ${diagramType.replace(/_/g, " ")} for ${focus}.`;

  const upgradedSteps = steps.length
    ? steps.map((step, index) => ({
        ...step,
        text: cleanupDiagramStepText(step.text) || (index === 0 ? diagramIntro : step.text),
        ...(index === 0
          ? {
              diagramPrompt: circuitSpec ? "" : diagramPrompt,
              diagramTitle: focus,
              diagramCaption: circuitSpec
                ? "Study the labelled resistors and battery voltage."
                : "Study the labelled parts carefully.",
              diagramLabels:
                step.diagramLabels ||
                (circuitSpec
                  ? circuitSpec.components.map((item) => `${item.id} ${item.value} ${item.unit}`)
                  : []),
              diagramType,
              diagramSpec: recursionSpec || circuitSpec || step.diagramSpec,
              diagramSummary: `Visual explanation of ${focus}.`,
              diagramFrame: 1,
            }
          : {}),
      }))
    : [
        {
          title: "Diagram",
          text: diagramIntro,
          diagramPrompt: circuitSpec ? "" : diagramPrompt,
          diagramTitle: focus,
          diagramCaption: circuitSpec
            ? "Study the labelled resistors and battery voltage."
            : "Study the labelled parts carefully.",
          diagramLabels: circuitSpec
            ? circuitSpec.components.map((item) => `${item.id} ${item.value} ${item.unit}`)
            : [],
          diagramType,
          diagramSpec: recursionSpec || circuitSpec,
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

export function buildStudyCoachSystemPrompt(context, { studentTopic = null, ragContext = "" } = {}) {
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
${ragContext ? `\nRetrieved curriculum reference (ground explanations in this material; never treat as quiz answers):\n${ragContext}\n` : ""}
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
- For physics circuits (parallel/series): return diagramSpec ONLY — never ASCII art or diagramPrompt. Example: { "diagramType": "circuit", "layout": "parallel", "voltage": 12, "voltageUnit": "V", "components": [{ "id": "R1", "value": 4, "unit": "Ω" }, { "id": "R2", "value": 6, "unit": "Ω" }] }. Leave step.text empty or one short caption; put colour/value notes in diagramLabels or callouts — never "Explanation of Colors" ASCII blocks.
- For flowchart and process_diagram: return diagramMermaid with valid Mermaid syntax (omit diagramPrompt).
- For cell_diagram, concept_map: use diagramPrompt starting with "Flash card illustration:" — one bold hero image, not multi-frame unless explicitly requested.
- Never use ASCII diagram art, bracket wire art ([R1] | I₁ = 3 A |), or offer to "create a polished image file" — render via diagramSpec/diagramMermaid/diagramPrompt automatically.
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
      "diagramSpec": { "diagramType": "recursion_tree", "root": 4, "depth": 3, "labels": ["fib(4)"] } | { "diagramType": "circuit", "layout": "parallel", "voltage": 12, "components": [{ "id": "R1", "value": 4, "unit": "Ω" }] },
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

/**
 * Compact system prompt for local Ollama — smaller context window, RAG carries curriculum depth.
 */
export function buildStudyCoachOllamaSystemPrompt(context, { studentTopic = null, ragContext = "" } = {}) {
  const intentions = Array.isArray(context.learningIntentions) ? context.learningIntentions : [];
  const focusPath = parseFocusLabel(context.focus);
  const displayFocus = studentFacingFocus(context.focus, context.title);
  const activeSubtopic =
    studentTopic?.displayLabel ||
    studentTopic?.label ||
    focusPath.subtopic ||
    focusPath.topic ||
    displayFocus;

  const intentionsLine =
    intentions.map((item) => `  - ${item}`).join("\n") || "  - Review core concepts for this topic.";

  return `
You are Quizzora Study Coach — a warm Australian tutor for ${context.yearLevel} ${context.subject}.
Current focus: ${activeSubtopic}
Student-facing summary: ${displayFocus}
Learning intentions:
${intentionsLine}
${ragContext ? `\nCurriculum reference (PRIMARY source — teach from this; not quiz answers):\n${ragContext}\n` : "\n(No curriculum excerpts retrieved — use general knowledge aligned to the focus.)\n"}
Teaching rules:
- Exactly 1 short application portion unless the student asks for more; narrationText max ~30 words
- Prefer diagramSpec or diagramMermaid (client-rendered) over diagramPrompt — skip diagramPrompt unless essential
- Math in $...$ when needed; omit formulas[] unless equations are central
- Never reveal quiz answers; refuse off-topic (politics, religion debates, violence, other subjects)
- Stay on ${context.subject} / ${activeSubtopic}

Return ONLY valid JSON (no markdown fences):
{
  "topicHeader": "short title",
  "intro": "one-line hook",
  "onTopic": true,
  "followUps": ["follow-up 1", "follow-up 2"],
  "portions": [{ "id": "p1", "label": "Concept", "content": "markdown", "narrationText": "spoken" }],
  "steps": [{ "title": "Visual", "text": "", "diagramSpec": {} }]
}
Default: 0 steps. Omit keyIdeas, breadcrumbs, formulas unless they add clear value.
When onTopic is false: brief redirect intro, one redirect portion, omit steps.
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

function buildCoachFormatFallbackPayload(context, message) {
  return buildCoachPayload({
    intro: "",
    steps: [{ title: "", text: COACH_FORMAT_FALLBACK_INTRO, diagramPrompt: "" }],
    followUps: DEFAULT_FOLLOW_UPS,
    onTopic: isLikelyOnTopicMessage(context, message),
  });
}

function parseCoachPayload(rawText, context, message) {
  const original = String(rawText || "").trim();
  const text = stripLeadingOnyxToolStub(original);
  if (!text) {
    if (original && isOnyxToolStubText(original)) {
      return applyOffTopicGuard(context, message, buildCoachFormatFallbackPayload(context, message));
    }
    throw new Error("Study Coach returned an empty response.");
  }

  if (isOnyxToolStubText(text)) {
    return applyOffTopicGuard(context, message, buildCoachFormatFallbackPayload(context, message));
  }

  const parsed = extractCoachJsonObject(text);

  if (parsed && isCoachPayloadShape(parsed)) {
    const normalized = normalizeCoachPayloadCandidate(parsed);
    const fallbackText = String(normalized.reply || normalized.intro || "").trim();
    const portions = Array.isArray(normalized.portions) ? normalized.portions : [];
    const steps = normalizeCoachSteps(normalized.steps, portions.length ? "" : fallbackText);
    return applyOffTopicGuard(
      context,
      message,
      buildCoachPayload({
        intro: normalized.intro || (portions.length || steps.length === 1 ? "" : fallbackText),
        introNarrationText: normalized.introNarrationText || "",
        topicHeader: normalized.topicHeader || "",
        breadcrumbs: normalized.breadcrumbs || [],
        keyIdeas: normalized.keyIdeas || [],
        formulas: normalized.formulas || [],
        portions,
        steps,
        followUps: normalizeFollowUps(normalized.followUps),
        onTopic: normalized.onTopic !== false,
      }),
    );
  }

  if (isLikelyRawCoachJson(text)) {
    const salvageText = String(parsed?.intro || parsed?.reply || "")
      .trim()
      .concat(
        Array.isArray(parsed?.portions)
          ? parsed.portions.map((portion) => String(portion?.content || "").trim()).join("\n\n")
          : "",
      )
      .trim();
    if (salvageText) {
      return applyOffTopicGuard(
        context,
        message,
        buildCoachPayload({
          intro: String(parsed?.intro || parsed?.reply || "").trim(),
          topicHeader: String(parsed?.topicHeader || "").trim(),
          portions: Array.isArray(parsed?.portions) ? parsed.portions : [],
          steps: normalizeCoachSteps(parsed?.steps, salvageText),
          followUps: normalizeFollowUps(parsed?.followUps),
          onTopic: parsed?.onTopic !== false,
        }),
      );
    }
    return applyOffTopicGuard(context, message, buildCoachFormatFallbackPayload(context, message));
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

async function finalizeCoachPayload(payload, context, { requestNarration = false, skipDiagrams = false } = {}) {
  if (skipDiagrams) {
    const steps = (payload.steps || []).map((step) => ({
      ...step,
      diagramPrompt: "",
      imagePrompt: "",
    }));
    return {
      ...payload,
      steps,
      introAudioUrl: "",
      visualSequence: false,
    };
  }

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

export function processStudyCoachLlmReply({ rawReply, context, message, source = "unknown" }) {
  let parsed = parseCoachPayload(rawReply, context, message);
  parsed = cleanupDiagramText(parsed);
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

  return {
    content: stepsToPlainText(parsed),
    payload: parsed,
    flagged,
    onTopic: flagged ? false : parsed.onTopic,
    followUps: parsed.followUps,
    source,
    rawReply,
  };
}

export async function generateStudyCoachReply({
  context,
  history,
  message,
  previousResponseId = null,
  requestNarration = false,
  forceRag = false,
  ragContext = undefined,
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

  const provider = resolveStudyCoachProvider();
  const needsOpenAiKey = provider === "openai";
  const needsOnyxKey = provider === "onyx";
  const sessionResponseId = usesOpenAiResponseSession(provider) ? previousResponseId : null;

  if (needsOnyxKey && !process.env.ONYX_API_KEY?.trim()) {
    const onTopic = isLikelyOnTopicMessage(context, message);
    const payload = buildCoachPayload({
      intro: onTopic
        ? `Let's explore ${context.focus} step by step.`
        : buildOffTopicRedirect(context),
      steps: onTopic
        ? [
            {
              title: "Step 1",
              text: "Study Coach is not configured (ONYX_API_KEY is missing). Ask your teacher to check server settings.",
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

  if (needsOpenAiKey && !process.env.OPENAI_API_KEY) {
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

  const onyxSessionId = usesOnyxChatSession(provider) ? previousResponseId : null;
  const llmPreviousResponseId = sessionResponseId ?? onyxSessionId;

  let llmResult;
  const llmOptions = { forceRag, ragContext };
  try {
    llmResult = await callStudyCoachLlm(
      {
        context,
        history,
        message,
        previousResponseId: llmPreviousResponseId,
      },
      llmOptions,
    );
  } catch (error) {
    if (sessionResponseId && isOpenAiSessionExpiredError(error)) {
      llmResult = await callStudyCoachLlm(
        {
          context,
          history,
          message,
          previousResponseId: null,
        },
        llmOptions,
      );
    } else {
      throw error;
    }
  }

  if (!llmResult) {
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

  return finishCoachFromLlmResult({
    llmResult,
    context,
    message,
    requestNarration,
  });
}

async function finishCoachFromLlmResult({ llmResult, context, message, requestNarration = false }) {
  let parsed = parseCoachPayload(llmResult.rawReply, context, message);
  parsed = cleanupDiagramText(parsed);
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

  parsed = await finalizeCoachPayload(parsed, context, {
    requestNarration,
    skipDiagrams: shouldSkipDiagramsForCoachSource(llmResult.source),
  });

  return {
    content: stepsToPlainText(parsed),
    payload: parsed,
    flagged,
    onTopic: flagged ? false : parsed.onTopic,
    followUps: parsed.followUps,
    source: llmResult.source,
    responseId: llmResult.responseId,
    rawReply: llmResult.rawReply,
  };
}

export async function generateStudyCoachReplyStream({
  context,
  history,
  message,
  previousResponseId = null,
  requestNarration = false,
  forceRag = false,
  ragContext = undefined,
  onToken,
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
      streamed: false,
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
      streamed: false,
    };
  }

  if (process.env.STUDY_COACH_MOCK === "true") {
    return generateStudyCoachReply({
      context,
      history,
      message,
      previousResponseId,
      requestNarration,
      forceRag,
      ragContext,
    }).then((result) => ({ ...result, streamed: false }));
  }

  const provider = resolveStudyCoachProvider();
  const llmOptions = { forceRag, ragContext, onToken };

  if (provider === "onyx" && resolveOnyxStreamingEnabled()) {
    const onyxSessionId = usesOnyxChatSession(provider) ? previousResponseId : null;
    const llmResult = await streamOnyxStudyCoach(
      { context, message, previousResponseId: onyxSessionId },
      { onToken: llmOptions.onToken },
    );
    const result = await finishCoachFromLlmResult({
      llmResult,
      context,
      message,
      requestNarration,
    });
    return { ...result, streamed: true };
  }

  if (provider !== "ollama" && provider !== "local" && provider !== "hybrid") {
    const result = await generateStudyCoachReply({
      context,
      history,
      message,
      previousResponseId,
      requestNarration,
      forceRag,
      ragContext,
    });
    return { ...result, streamed: false };
  }

  let llmResult;
  try {
    llmResult = await streamOllamaStudyCoach({ context, history, message }, llmOptions);
  } catch (error) {
    if (provider === "hybrid") {
      llmResult = await callStudyCoachLlm(
        { context, history, message, previousResponseId: null },
        { forceRag, ragContext },
      );
      if (!llmResult) {
        throw error;
      }
      const result = await finishCoachFromLlmResult({
        llmResult,
        context,
        message,
        requestNarration,
      });
      return { ...result, streamed: false };
    }
    throw error;
  }

  const result = await finishCoachFromLlmResult({
    llmResult: {
      ...llmResult,
      source: resolveOllamaCoachSource(provider, llmResult.ollamaTarget),
    },
    context,
    message,
    requestNarration,
  });
  return { ...result, streamed: true };
}
