import { normalizeDiagramType } from "./study-diagram-meta.js";

export const SPEC_DIAGRAM_TYPES = new Set(["recursion_tree", "number_line"]);

const MERMAID_DIAGRAM_TYPES = new Set(["flowchart", "process_diagram"]);

export const AI_PREFERRED_DIAGRAM_TYPES = new Set([
  "number_line",
  "process_diagram",
  "venn_diagram",
  "bar_chart",
  "coordinate_plane",
  "geometric_figure",
  "probability",
  "geometry",
]);

export function studyCoachPreferAiDiagrams() {
  return process.env.STUDY_COACH_PREFER_AI_DIAGRAMS !== "false";
}

export function quizPreferAiDiagrams() {
  return process.env.QUIZ_PREFER_AI_DIAGRAMS !== "false";
}

export function preferAiDiagramForStep(step, context = "study") {
  const prefer = context === "quiz" ? quizPreferAiDiagrams() : studyCoachPreferAiDiagrams();
  if (!prefer || process.env.OPENAI_IMAGE_GENERATION === "false") {
    return false;
  }

  const diagramType = normalizeDiagramType(
    step?.diagramType || step?.diagram?.diagramType || step?.diagramSpec?.diagramType || "",
  );
  return AI_PREFERRED_DIAGRAM_TYPES.has(diagramType);
}

export function promptFromDiagramSpec(spec, context = {}) {
  if (!spec) {
    return "";
  }

  if (spec.diagramType === "number_line") {
    const points = spec.points?.length ? `Mark points at: ${spec.points.join(", ")}.` : "";
    const intervals = spec.intervals?.length
      ? `Highlight intervals: ${spec.intervals
          .map((item) => {
            const label = item.label ? ` (${item.label})` : "";
            return `${item.from} to ${item.to}${label}`;
          })
          .join("; ")}.`
      : "";
    const focus = context.focus ? `Topic: ${context.focus}.` : "";
    return `Horizontal number line from ${spec.min} to ${spec.max}. ${points} ${intervals} ${focus}`.trim();
  }

  if (spec.diagramType === "recursion_tree") {
    return "";
  }

  return "";
}

export function resolveStepDiagramPrompt(step, context = {}) {
  const explicit = String(step?.diagramPrompt || step?.imagePrompt || "").trim();
  if (explicit) {
    return explicit;
  }

  const spec = normalizeDiagramSpec(step?.diagramSpec);
  if (spec && preferAiDiagramForStep(step, context === "quiz" ? "quiz" : "study")) {
    return promptFromDiagramSpec(spec, context);
  }

  return "";
}

export function isMermaidFenceLanguage(language) {
  return String(language || "")
    .trim()
    .toLowerCase() === "mermaid";
}

export function contentHasMermaidFence(content) {
  return /```\s*mermaid[\s\S]*?```/i.test(String(content || ""));
}

export function normalizeDiagramSpec(raw) {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const diagramType = normalizeDiagramType(raw.diagramType || raw.type || "");
  if (!SPEC_DIAGRAM_TYPES.has(diagramType)) {
    return null;
  }

  if (diagramType === "recursion_tree") {
    const root = Number(raw.root);
    const depth = Number(raw.depth);
    if (!Number.isFinite(root) || !Number.isFinite(depth) || depth < 1) {
      return null;
    }

    const labels = Array.isArray(raw.labels)
      ? raw.labels.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 16)
      : [];

    return {
      diagramType,
      root,
      depth: Math.min(Math.max(Math.round(depth), 1), 6),
      labels,
    };
  }

  if (diagramType === "number_line") {
    const min = Number(raw.min);
    const max = Number(raw.max);
    if (!Number.isFinite(min) || !Number.isFinite(max) || min >= max) {
      return null;
    }

    const points = Array.isArray(raw.points)
      ? raw.points.map((item) => Number(item)).filter((item) => Number.isFinite(item))
      : [];

    const intervals = Array.isArray(raw.intervals)
      ? raw.intervals
          .map((item) => ({
            from: Number(item?.from ?? item?.start),
            to: Number(item?.to ?? item?.end),
            label: String(item?.label || "").trim(),
          }))
          .filter((item) => Number.isFinite(item.from) && Number.isFinite(item.to))
          .slice(0, 4)
      : [];

    return {
      diagramType,
      min,
      max,
      points: points.slice(0, 8),
      intervals,
    };
  }

  return null;
}

export function stepNeedsGeneratedImage(step, context = "study") {
  const needsDiagram =
    Boolean(step?.needsDiagram) ||
    Boolean(String(step?.diagramPrompt || step?.imagePrompt || "").trim()) ||
    Boolean(normalizeDiagramSpec(step?.diagramSpec)) ||
    Boolean(String(step?.diagramMermaid || "").trim());

  if (!needsDiagram) {
    return false;
  }
  if (shouldSkipImageGeneration(step, context)) {
    return false;
  }

  const prompt = resolveStepDiagramPrompt(step, context);
  return Boolean(prompt) && !String(step?.imageUrl || "").trim();
}

export function resolveDiagramRenderMode(step, context = "study") {
  if (!step) {
    return "none";
  }

  if (String(step.imageUrl || "").trim()) {
    return "image";
  }

  const spec = normalizeDiagramSpec(step.diagramSpec);
  if (spec && !preferAiDiagramForStep(step, context)) {
    return "spec";
  }

  const diagramType = normalizeDiagramType(step.diagramType || step.diagram?.diagramType || "");
  const mermaidSource = String(step.diagramMermaid || "").trim();

  if (MERMAID_DIAGRAM_TYPES.has(diagramType) && mermaidSource && !preferAiDiagramForStep(step, context)) {
    return "mermaid";
  }

  if (resolveStepDiagramPrompt(step, context) || (spec && preferAiDiagramForStep(step, context))) {
    return "image";
  }

  return "none";
}

export function shouldSkipImageGeneration(step, context = "study") {
  if (preferAiDiagramForStep(step, context)) {
    return false;
  }

  const mode = resolveDiagramRenderMode(step, context);
  if (mode === "spec" || mode === "mermaid") {
    return true;
  }

  if (contentHasMermaidFence(step?.text)) {
    return true;
  }

  return false;
}

export function hasClientRenderedDiagram(step, context = "study") {
  const mode = resolveDiagramRenderMode(step, context);
  return mode === "spec" || mode === "mermaid";
}

export function isDiagramImagePending(step, context = "study") {
  const mode = resolveDiagramRenderMode(step, context);
  return mode === "image" && !String(step?.imageUrl || "").trim() && step?.diagramGenerationFailed !== true;
}
