import { fetchOpenAiWithRetry, resolveOpenAiRetryOptions } from "./openai-errors.js";
import { quizQualityFirstEnabled } from "./quiz-quality.js";
import { normalizeDiagramType } from "./study-diagram-meta.js";

export const MAX_VALIDATION_ATTEMPTS = 2;

export function maxDiagramValidationAttempts() {
  return quizQualityFirstEnabled() ? 3 : MAX_VALIDATION_ATTEMPTS;
}

const WIDE_DIAGRAM_TYPES = new Set(["number_line", "timeline", "process_diagram"]);

export function diagramValidationEnabled() {
  return process.env.OPENAI_DIAGRAM_VALIDATE !== "false";
}

export function parseImageDimensions(size) {
  const match = String(size || "").trim().match(/^(\d+)x(\d+)$/i);
  if (!match) {
    return { width: 1024, height: 1024 };
  }
  return { width: Number(match[1]), height: Number(match[2]) };
}

export function resolveImageSizeForDiagramType(diagramType) {
  const configured = String(process.env.OPENAI_IMAGE_SIZE || "").trim();
  if (configured) {
    return configured;
  }

  const type = normalizeDiagramType(diagramType);
  if (WIDE_DIAGRAM_TYPES.has(type)) {
    return "1536x1024";
  }

  return "1024x1024";
}

export function aspectLayoutHint(diagramType) {
  const type = normalizeDiagramType(diagramType);
  if (type === "number_line") {
    return "Use a wide horizontal layout — number line spans left to right with tick marks below.";
  }
  if (type === "process_diagram" || type === "timeline") {
    return "Use a wide horizontal layout — stages flow left to right with clear spacing.";
  }
  if (type === "venn_diagram" || type === "bar_chart") {
    return "Centre the diagram with generous margins so labels never touch the canvas edge.";
  }
  return "Centre the diagram with balanced margins on all sides.";
}

export function appendClarityRequirements(prompt, diagramType = "generic") {
  const size = resolveImageSizeForDiagramType(diagramType);
  const { width, height } = parseImageDimensions(size);

  return `
${String(prompt || "").trim()}

Layout and quality requirements:
- Clean educational diagram in Australian curriculum textbook style.
- White or very light background; high contrast sans-serif labels.
- NO overlapping text — generous spacing between labels, ticks, and leader lines.
- Large, readable text; every label must be fully legible at a glance.
- ${aspectLayoutHint(diagramType)}
- Target canvas: ${width}x${height}px — fill the frame without clipping labels at edges.
`.trim();
}

function parseValidationResponse(text) {
  const body = String(text || "").trim();
  const firstLine = body.split(/\r?\n/)[0]?.trim().toUpperCase() || "";
  const valid = firstLine.startsWith("YES");
  const issues = valid
    ? ""
    : body
        .split(/\r?\n/)
        .slice(firstLine.startsWith("NO") ? 1 : 0)
        .join("\n")
        .trim();

  return { valid, issues: issues || (valid ? "" : "Diagram quality check failed.") };
}

export { parseValidationResponse };

export async function validateDiagramImage({
  imageBase64,
  diagramPrompt,
  apiKey,
  model = process.env.OPENAI_DIAGRAM_VALIDATE_MODEL ||
    process.env.OPENAI_DIAGRAM_MODEL ||
    process.env.STUDY_COACH_MODEL ||
    "gpt-4o-mini",
}) {
  if (!apiKey || !imageBase64) {
    return { valid: true, issues: "" };
  }

  const response = await fetchOpenAiWithRetry(
    "https://api.openai.com/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        max_tokens: 220,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Review this educational diagram for student use.

Original brief:
${diagramPrompt}

Check:
1. Is all text readable?
2. Is any text overlapping or crowded?
3. Are labels correct and match the brief?

Reply with YES or NO on the first line only.
If NO, list specific issues on following lines (e.g. overlapping labels, clipped text, wrong values).`,
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:image/png;base64,${imageBase64}`,
                },
              },
            ],
          },
        ],
      }),
    },
    resolveOpenAiRetryOptions(),
  );

  if (!response.ok) {
    return { valid: true, issues: "" };
  }

  const payload = await response.json();
  const content = payload?.choices?.[0]?.message?.content || "";
  return parseValidationResponse(content);
}

export async function generateValidatedDiagramImage({
  diagramPrompt,
  diagramType = "generic",
  apiKey,
  generateOnce,
}) {
  let issues = "";
  let lastResult = null;

  const attempts = maxDiagramValidationAttempts();
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const refinedPrompt = issues
      ? appendClarityRequirements(
          `${diagramPrompt}\n\nFix these issues from the previous attempt:\n${issues}`,
          diagramType,
        )
      : appendClarityRequirements(diagramPrompt, diagramType);

    const result = await generateOnce(refinedPrompt, attempt);
    if (!result?.imageBase64) {
      return null;
    }

    lastResult = { ...result, diagramPrompt: refinedPrompt };

    if (!diagramValidationEnabled()) {
      return lastResult;
    }

    const validation = await validateDiagramImage({
      imageBase64: result.imageBase64,
      diagramPrompt: refinedPrompt,
      apiKey,
    });

    if (validation.valid) {
      return lastResult;
    }

    issues = validation.issues;
  }

  return lastResult;
}
