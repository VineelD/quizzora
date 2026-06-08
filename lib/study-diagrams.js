import { buildResponsesImageTool, extractImagesFromResponsesPayload } from "./images.js";
import { cacheDiagramImage, getCachedDiagramImageUrl } from "./diagram-image-cache.js";
import { diagramTypeHint, normalizeDiagramMetadata } from "./study-diagram-meta.js";
import { shouldSkipImageGeneration } from "./study-diagram-render.js";
import { fetchOpenAiWithRetry, resolveOpenAiRetryOptions } from "./openai-errors.js";

function studyDiagramsEnabled() {
  return process.env.STUDY_COACH_DIAGRAMS !== "false";
}

function maxDiagramsPerReply(visualSequence = false, promptCount = 0) {
  const configured = Number(process.env.STUDY_COACH_MAX_DIAGRAMS_PER_REPLY || 1);
  const cap = visualSequence ? Math.max(configured, 3) : configured;
  return Math.max(0, Math.min(cap, promptCount || cap));
}

function buildStructuredDiagramPrompt({
  context,
  prompt,
  metadata = {},
  frameIndex = 1,
  totalFrames = 1,
  previousPrompt = "",
}) {
  const meta = normalizeDiagramMetadata(metadata);
  const typeHint = diagramTypeHint(meta.diagramType);
  const labelBlock = meta.labels.length ? meta.labels.map((label) => `- ${label}`).join("\n") : "- Add clear, readable labels for every important part.";

  const continuity =
    totalFrames > 1
      ? `
Progressive sequence — frame ${frameIndex} of ${totalFrames}:
- Keep the SAME layout, camera angle, colour palette, and illustration style as earlier frames.
- Only ADD or HIGHLIGHT the new elements described below — do not redesign from scratch.
${previousPrompt ? `- Previous frame showed: ${previousPrompt}` : ""}
`
      : "";

  return `
Create one educational diagram for an Australian ${context.yearLevel} ${context.subject} lesson.
Topic focus: ${context.focus}
Diagram brief: ${prompt}
${meta.title ? `Title on diagram: ${meta.title}` : ""}
${meta.whatItShows ? `Purpose: ${meta.whatItShows}` : ""}
${meta.caption ? `Caption intent: ${meta.caption}` : ""}
${continuity}

Diagram type: ${meta.diagramType.replace(/_/g, " ")}
${typeHint}

Required labels (use these exact terms where applicable):
${labelBlock}

Art direction:
- Educational clarity first — every label must teach something, not decorate.
- Include axes, scale, legend, or step numbers when they help understanding.
- Australian curriculum context for ${context.yearLevel} ${context.subject}.
- Clean textbook-infographic style: white or very light background, high contrast, large readable text.
- Use arrows, colour coding, and numbered steps to guide the eye.
- No quiz answers, no multiple-choice options, no assessment solutions.
- Avoid clutter — show only what the student needs for this teaching moment.
`.trim();
}

function buildDiagramInput(options) {
  return buildStructuredDiagramPrompt(options);
}

export async function generateStudyDiagram({
  context,
  prompt,
  metadata = {},
  frameIndex = 1,
  totalFrames = 1,
  previousPrompt = "",
}) {
  if (!studyDiagramsEnabled()) {
    return null;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || process.env.STUDY_COACH_MOCK === "true") {
    return null;
  }

  const normalizedMeta = normalizeDiagramMetadata({ ...metadata, altText: metadata.altText || prompt });
  const diagramInput = buildDiagramInput({
    context,
    prompt,
    metadata: normalizedMeta,
    frameIndex,
    totalFrames,
    previousPrompt,
  });

  const cachedUrl = getCachedDiagramImageUrl(diagramInput);
  if (cachedUrl) {
    return {
      imageUrl: cachedUrl,
      imageAlt: normalizedMeta.altText || prompt,
      diagram: normalizedMeta,
    };
  }

  const body = {
    model:
      process.env.OPENAI_DIAGRAM_MODEL ||
      process.env.STUDY_COACH_MODEL ||
      process.env.OPENAI_MODEL ||
      "gpt-4o-mini",
    input: diagramInput,
    tools: [buildResponsesImageTool()],
    temperature: 0.3,
  };

  const response = await fetchOpenAiWithRetry(
    process.env.OPENAI_ENDPOINT || "https://api.openai.com/v1/responses",
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

  if (!response.ok) {
    return null;
  }

  const payload = await response.json();
  const images = extractImagesFromResponsesPayload(payload);
  if (!images.length) {
    return null;
  }

  const buffer = Buffer.from(images[0], "base64");
  return {
    imageUrl: cacheDiagramImage(diagramInput, buffer, "png"),
    imageAlt: normalizedMeta.altText || prompt,
    diagram: normalizedMeta,
  };
}

export async function attachDiagramsToCoachSteps(steps, context, { visualSequence = false, deadline = null } = {}) {
  if (!studyDiagramsEnabled() || !Array.isArray(steps) || !steps.length) {
    return steps;
  }

  const promptedSteps = steps
    .map((step, index) => ({ step, index }))
    .filter(({ step }) => step.diagramPrompt?.trim() && !step.imageUrl && !shouldSkipImageGeneration(step));

  const limit = maxDiagramsPerReply(visualSequence, promptedSteps.length);
  const totalFrames = promptedSteps.length;
  const enriched = [...steps];
  const targets = promptedSteps.slice(0, limit);
  let previousPrompt = "";

  const results = await Promise.all(
    targets.map(async ({ step, index }, generated) => {
      if (deadline != null && deadline <= Date.now()) {
        return null;
      }

      const diagram = await generateStudyDiagram({
        context,
        prompt: step.diagramPrompt.trim(),
        metadata: step.diagram || {
          title: step.diagramTitle,
          caption: step.diagramCaption,
          labels: step.diagramLabels,
          whatItShows: step.diagramSummary,
          diagramType: step.diagramType,
          altText: step.imageAlt,
        },
        frameIndex: step.diagramFrame || generated + 1,
        totalFrames: visualSequence ? totalFrames : 1,
        previousPrompt,
      });

      if (!diagram) {
        return { index, failed: true };
      }

      previousPrompt = step.diagramPrompt.trim();

      return {
        index,
        diagram,
        totalFrames: visualSequence ? totalFrames : enriched[index].totalFrames,
      };
    }),
  );

  for (const result of results) {
    if (!result) {
      continue;
    }
    if (result.failed) {
      enriched[result.index] = {
        ...enriched[result.index],
        diagramGenerationFailed: true,
      };
      continue;
    }
    enriched[result.index] = {
      ...enriched[result.index],
      imageUrl: result.diagram.imageUrl,
      imageAlt: result.diagram.imageAlt,
      diagram: result.diagram.diagram,
      totalFrames: result.totalFrames,
    };
  }

  return enriched;
}
