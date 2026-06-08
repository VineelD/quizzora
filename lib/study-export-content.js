import { studentFacingBreadcrumb } from "./student-display.js";
import { hasFlashableFormulas } from "./study-formula-flash.js";
import { isDiagramCapableStep, stepsToPlainText } from "./study-message-normalize.js";
import { latexToPlainText } from "./study-message-content.js";

export { latexToPlainText };

export function stripBasicMarkdown(text) {
  const lines = String(text || "").split("\n");
  const stripped = lines.map((line) => {
    const trimmed = line.trim();
    const headerMatch = trimmed.match(/^#{1,6}\s+(.+)$/);
    if (headerMatch) {
      return headerMatch[1].trim();
    }
    return line
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/\*([^*]+)\*/g, "$1")
      .replace(/_([^_]+)_/g, "$1")
      .replace(/`([^`]+)`/g, "$1");
  });

  return stripped.join("\n").trim();
}

export function formatCoachExportLine(value) {
  return latexToPlainText(stripBasicMarkdown(value));
}

export function formatCoachExportBlock(value) {
  return String(value || "")
    .split("\n")
    .map((line) => formatCoachExportLine(line))
    .filter(Boolean)
    .join("\n");
}

export function formatCoachExportText(value) {
  return formatCoachExportLine(value);
}

function hasNonEmptyText(value) {
  return Boolean(String(value || "").trim());
}

export function coachPayloadHasTextContent(payload) {
  if (!payload) {
    return false;
  }

  if (hasNonEmptyText(payload.intro)) {
    return true;
  }

  const keyIdeas = Array.isArray(payload.keyIdeas) ? payload.keyIdeas : [];
  if (keyIdeas.some((idea) => hasNonEmptyText(idea))) {
    return true;
  }

  const portions = Array.isArray(payload.portions) ? payload.portions : [];
  if (portions.some((portion) => hasNonEmptyText(portion?.content))) {
    return true;
  }

  const steps = Array.isArray(payload.steps) ? payload.steps : [];
  if (
    steps.some(
      (step) => hasNonEmptyText(step?.text) || hasNonEmptyText(step?.title) || hasNonEmptyText(step?.engagementHook),
    )
  ) {
    return true;
  }

  return hasNonEmptyText(stepsToPlainText(payload));
}

export function coachPayloadHasExportableContent(payload) {
  if (!payload) {
    return false;
  }

  if (hasFlashableFormulas(payload.formulas)) {
    return true;
  }

  const steps = Array.isArray(payload.steps) ? payload.steps : [];
  if (steps.some(isDiagramCapableStep)) {
    return true;
  }

  return coachPayloadHasTextContent(payload);
}

export function coachPayloadHasPdfBodyContent(payload) {
  if (!payload) {
    return false;
  }

  if (hasFlashableFormulas(payload.formulas)) {
    return true;
  }

  if (coachPayloadHasTextContent(payload)) {
    return true;
  }

  const steps = Array.isArray(payload.steps) ? payload.steps : [];
  return steps.some(isDiagramCapableStep);
}

function stripStepTitlePrefix(title) {
  return String(title || "")
    .trim()
    .replace(/^Step \d+[ —-]\s*/i, "");
}

export function buildCoachPdfSectionTitles(payload) {
  if (!payload) {
    return [];
  }

  const titles = [];

  if (hasFlashableFormulas(payload.formulas)) {
    titles.push("Key formulas");
  }

  const steps = Array.isArray(payload.steps) ? payload.steps : [];
  if (steps.some(isDiagramCapableStep)) {
    titles.push("Concept visual");
  }

  const portions = Array.isArray(payload.portions) ? payload.portions : [];
  let portionIndex = 0;
  for (const portion of portions) {
    const label = String(portion?.label || "").trim();
    const content = formatCoachExportText(portion?.content || "");
    if (!label && !content) {
      continue;
    }
    portionIndex += 1;
    titles.push(label || `Part ${portionIndex}`);
  }

  let stepIndex = 0;
  for (const step of steps) {
    const title = stripStepTitlePrefix(step?.title);
    const text = formatCoachExportText(step?.text || "");
    if (!title && !text) {
      continue;
    }
    stepIndex += 1;
    titles.push(title || `Step ${stepIndex}`);
  }

  if (Array.isArray(payload.keyIdeas) && payload.keyIdeas.some((idea) => hasNonEmptyText(idea))) {
    titles.push("Key ideas");
  }

  return titles;
}

export function buildCoachPdfDocumentMarkers(payload, context = {}) {
  const markers = [];

  const breadcrumb = studentFacingBreadcrumb({
    yearLevel: context.yearLevel,
    subject: context.subject,
    focus: context.focus,
    assignmentTitle: context.title,
  });
  if (breadcrumb) {
    markers.push(breadcrumb);
  }

  if (hasNonEmptyText(payload?.intro)) {
    markers.push(formatCoachExportText(payload.intro));
  }

  markers.push(...buildCoachPdfSectionTitles(payload));

  return markers.filter(Boolean);
}
