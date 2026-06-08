import {
  extractOrphanLatexFormulas,
  sanitizeStudyMathContent,
  stripAsciiDiagramArtifacts,
} from "./study-message-content.js";
import { normalizeDiagramMetadata } from "./study-diagram-meta.js";
import { normalizeDiagramSpec } from "./study-diagram-render.js";

export function normalizeFormulas(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => ({
      label: String(item?.label || item?.name || "").trim(),
      expression: sanitizeStudyMathContent(String(item?.expression || item?.formula || item?.text || "").trim()),
    }))
    .filter((item) => item.label || item.expression)
    .slice(0, 6);
}

export function normalizeKeyIdeas(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 8);
}

export function normalizeBreadcrumbs(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 6);
}

export function normalizeCallouts(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => ({
      label: String(item?.label || item?.name || "").trim(),
      detail: sanitizeStudyMathContent(item?.detail || item?.text || ""),
    }))
    .filter((item) => item.label)
    .slice(0, 4);
}

export function stepsToPlainText(payload) {
  if (!payload) {
    return "";
  }
  const parts = [];
  if (payload.intro?.trim()) {
    parts.push(payload.intro.trim());
  }
  for (const portion of payload.portions || []) {
    const label = portion.label?.trim();
    const content = portion.content?.trim();
    if (label && content) {
      parts.push(`${label}: ${content}`);
    } else if (content) {
      parts.push(content);
    }
  }
  for (const step of payload.steps || []) {
    const title = step.title?.trim();
    const text = step.text?.trim();
    if (title && text) {
      parts.push(`${title}: ${text}`);
    } else if (text) {
      parts.push(text);
    }
  }
  return parts.join("\n\n").trim();
}

export function normalizeCoachPortions(rawPortions, fallbackText = "") {
  if (!Array.isArray(rawPortions) || !rawPortions.length) {
    const text = String(fallbackText || "").trim();
    return text
      ? [
          {
            id: "p1",
            label: "",
            content: sanitizeStudyMathContent(text),
            narrationText: "",
            startOffset: 0,
            endOffset: text.length,
            audioUrl: "",
          },
        ]
      : [];
  }

  let runningOffset = 0;

  return rawPortions
    .map((portion, index) => {
      const rawContent = portion?.content || portion?.text || "";
      const enriched = enrichPortionContent(rawContent);
      const content = enriched.content;
      const narrationText = String(portion?.narrationText || "").trim();
      const label = String(portion?.label || portion?.title || `Part ${index + 1}`).trim();
      const id = String(portion?.id || `p${index + 1}`).trim();

      let startOffset = Number(portion?.startOffset);
      let endOffset = Number(portion?.endOffset);
      if (!Number.isFinite(startOffset)) {
        startOffset = runningOffset;
      }
      if (!Number.isFinite(endOffset)) {
        endOffset = startOffset + content.length;
      }
      runningOffset = Math.max(runningOffset, endOffset);

      return {
        id,
        label,
        content,
        narrationText,
        startOffset,
        endOffset,
        audioUrl: String(portion?.audioUrl || "").trim(),
        _extractedFormulas: enriched.formulas,
      };
    })
    .slice(0, 5);
}

export function stripAsciiDiagramSections(text) {
  return stripAsciiDiagramArtifacts(text);
}

function enrichPortionContent(content, formulas = []) {
  let sanitized = sanitizeStudyMathContent(content);
  sanitized = stripAsciiDiagramArtifacts(sanitized);
  const extracted = extractOrphanLatexFormulas(sanitized, formulas);
  return {
    content: extracted.content,
    formulas: normalizeFormulas(extracted.formulas),
  };
}

function mergeFormulas(...groups) {
  const merged = [];
  const seen = new Set();

  for (const group of groups) {
    for (const item of normalizeFormulas(group)) {
      const key = `${item.label}|${item.expression}`;
      if (!item.expression || seen.has(key)) {
        continue;
      }
      seen.add(key);
      merged.push(item);
    }
  }

  return merged.slice(0, 6);
}

export function isDiagramCapableStep(step) {
  if (!step) {
    return false;
  }

  return Boolean(
    String(step.diagramPrompt || "").trim() ||
      String(step.imageUrl || "").trim() ||
      String(step.diagramType || "").trim() ||
      String(step.diagramTitle || step.diagram?.title || "").trim() ||
      String(step.diagramMermaid || "").trim() ||
      step.diagramSpec ||
      step.callouts?.length,
  );
}

export function hasDiagramSteps(steps) {
  return Array.isArray(steps) && steps.some(isDiagramCapableStep);
}

export function mapPortionsToSteps(portions, steps) {
  const safePortions = Array.isArray(portions) ? portions : [];
  const safeSteps = Array.isArray(steps) ? steps : [];

  return safePortions.map((portion, portionIndex) => {
    const explicitId = String(
      portion?.stepId || portion?.diagramStepId || portion?.frameId || "",
    ).trim();

    if (explicitId) {
      const stepIndex = safeSteps.findIndex(
        (step) => String(step?.id || step?.stepId || "").trim() === explicitId,
      );
      if (stepIndex >= 0) {
        return { portionIndex, stepIndex, step: safeSteps[stepIndex] };
      }
    }

    const stepIndex = portionIndex < safeSteps.length ? portionIndex : -1;
    const step = stepIndex >= 0 ? safeSteps[stepIndex] : null;
    return { portionIndex, stepIndex, step };
  });
}

export function getPortionDisplayContent(portion, mappedStep = null) {
  const content = stripAsciiDiagramArtifacts(String(portion?.content || "").trim());
  if (!content) {
    return "";
  }

  if (mappedStep && isDiagramCapableStep(mappedStep)) {
    return content;
  }

  return content;
}

export function enrichPayloadWithPortionStepMapping(payload, { forExport = false } = {}) {
  if (!payload) {
    return payload;
  }

  const portions = Array.isArray(payload.portions) ? payload.portions : [];
  const steps = Array.isArray(payload.steps) ? payload.steps : [];
  const portionStepMap = mapPortionsToSteps(portions, steps);

  if (!portions.length || forExport) {
    return { ...payload, portionStepMap };
  }

  return {
    ...payload,
    portionStepMap,
    portions: portions.map((portion, index) => ({
      ...portion,
      content: getPortionDisplayContent(portion, portionStepMap[index]?.step),
    })),
  };
}

function isCoachPayloadShape(parsed) {
  if (!parsed || typeof parsed !== "object") {
    return false;
  }

  return Boolean(
    String(parsed.intro || "").trim() ||
      String(parsed.topicHeader || "").trim() ||
      (Array.isArray(parsed.formulas) && parsed.formulas.length) ||
      (Array.isArray(parsed.portions) && parsed.portions.length) ||
      (Array.isArray(parsed.steps) && parsed.steps.length) ||
      (Array.isArray(parsed.keyIdeas) && parsed.keyIdeas.length) ||
      (Array.isArray(parsed.breadcrumbs) && parsed.breadcrumbs.length),
  );
}

function finalizeCoachPortions(rawPortions) {
  return rawPortions
    .filter((portion) => portion.content)
    .map(({ _extractedFormulas, ...portion }) => portion);
}

function buildParsedCoachPayload(parsed, { forExport = false } = {}) {
  const baseFormulas = normalizeFormulas(parsed.formulas || []);
  const rawPortions = normalizeCoachPortions(parsed.portions || []);
  const portionFormulas = rawPortions.flatMap((portion) => portion._extractedFormulas || []);
  const portions = finalizeCoachPortions(rawPortions);
  const steps = normalizeCoachSteps(parsed.steps || [], String(parsed.intro || "").trim());
  return enrichPayloadWithPortionStepMapping(
    {
      intro: sanitizeStudyMathContent(parsed.intro || ""),
      introNarrationText: String(parsed.introNarrationText || "").trim(),
      topicHeader: String(parsed.topicHeader || "").trim(),
      breadcrumbs: normalizeBreadcrumbs(parsed.breadcrumbs),
      keyIdeas: normalizeKeyIdeas(parsed.keyIdeas),
      formulas: mergeFormulas(baseFormulas, portionFormulas),
      portions,
      steps,
      followUps: Array.isArray(parsed.followUps)
        ? parsed.followUps.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 3)
        : [],
      onTopic: parsed.onTopic !== false,
      visualSequence: parsed.visualSequence ?? hasVisualSequence(steps),
      introAudioUrl: String(parsed.introAudioUrl || "").trim(),
    },
    { forExport },
  );
}

export function normalizeCoachSteps(rawSteps, fallbackText = "") {
  if (!Array.isArray(rawSteps) || !rawSteps.length) {
    const text = String(fallbackText || "").trim();
    return text
      ? [
          {
            title: "",
            text: sanitizeStudyMathContent(text),
            diagramPrompt: "",
            imageUrl: "",
            imageAlt: "",
            callouts: [],
            engagementHook: "",
            diagramFrame: 1,
            audioUrl: "",
            narrationText: "",
          },
        ]
      : [];
  }

  const totalFrames = rawSteps.filter((step) => String(step?.diagramPrompt || step?.imagePrompt || "").trim()).length;

  return rawSteps
    .map((step, index) => {
      const diagramPrompt = String(step?.diagramPrompt || step?.imagePrompt || "").trim();
      let frameNumber = Number(step?.diagramFrame || step?.frame || 0);
      if (!frameNumber && diagramPrompt) {
        frameNumber = index + 1;
      }

      const diagram = normalizeDiagramMetadata({
        title: step?.diagramTitle || step?.diagram?.title,
        caption: step?.diagramCaption || step?.diagram?.caption,
        labels: step?.diagramLabels || step?.diagram?.labels,
        whatItShows: step?.diagramSummary || step?.diagram?.whatItShows,
        diagramType: step?.diagramType || step?.diagram?.diagramType,
        altText: step?.imageAlt || step?.diagram?.altText,
      });

      const rawText = step?.text || step?.body || "";
      const diagramSpec = normalizeDiagramSpec(step?.diagramSpec);
      const diagramMermaid = String(step?.diagramMermaid || "").trim();
      const stripDiagramAscii = Boolean(
        diagramPrompt ||
          diagramMermaid ||
          diagramSpec ||
          diagram.diagramType ||
          diagram.title ||
          String(step?.imageUrl || "").trim(),
      );
      const text = sanitizeStudyMathContent(
        stripDiagramAscii ? stripAsciiDiagramSections(rawText) : rawText,
      );

      return {
        id: String(step?.id || step?.stepId || `s${index + 1}`).trim(),
        title: String(step?.title || step?.heading || `Step ${index + 1}`).trim(),
        text,
        diagramPrompt,
        diagramMermaid,
        diagramSpec,
        imageUrl: String(step?.imageUrl || "").trim(),
        imageAlt: diagram.altText || diagramPrompt || "Study diagram",
        diagramTitle: diagram.title,
        diagramCaption: diagram.caption,
        diagramLabels: diagram.labels,
        diagramSummary: diagram.whatItShows,
        diagramType: diagram.diagramType,
        diagram,
        diagramGenerationFailed: step?.diagramGenerationFailed === true,
        callouts: normalizeCallouts(step?.callouts),
        engagementHook: String(step?.engagementHook || step?.question || "").trim(),
        diagramFrame: diagramPrompt ? frameNumber || index + 1 : 0,
        totalFrames: totalFrames || undefined,
        audioUrl: String(step?.audioUrl || "").trim(),
        narrationText: String(step?.narrationText || "").trim(),
      };
    })
    .filter((step) => step.text || isDiagramCapableStep(step))
    .slice(0, 6);
}

export function hasVisualSequence(steps) {
  return Array.isArray(steps) && steps.filter((step) => step.diagramPrompt?.trim()).length >= 2;
}

export function buildCoachPayload({
  intro = "",
  introNarrationText = "",
  topicHeader = "",
  breadcrumbs = [],
  keyIdeas = [],
  formulas = [],
  portions = [],
  steps = [],
  followUps = [],
  onTopic = true,
  introAudioUrl = "",
}) {
  const normalizedPortionsRaw = normalizeCoachPortions(portions);
  const normalizedSteps = normalizeCoachSteps(steps, intro);
  const portionFormulas = normalizedPortionsRaw.flatMap((portion) => portion._extractedFormulas || []);
  const normalizedPortions = finalizeCoachPortions(normalizedPortionsRaw);
  const cleanedIntro =
    (normalizedPortions.length > 1 || normalizedSteps.length > 1) && intro?.trim()
      ? sanitizeStudyMathContent(intro)
      : normalizedPortions.length === 1 && normalizedSteps.length === 0
        ? ""
        : normalizedSteps.length === 1 && !normalizedPortions.length
          ? ""
          : sanitizeStudyMathContent(intro || "");

  return enrichPayloadWithPortionStepMapping({
    intro: cleanedIntro,
    introNarrationText: String(introNarrationText || "").trim(),
    topicHeader: String(topicHeader || "").trim(),
    breadcrumbs: normalizeBreadcrumbs(breadcrumbs),
    keyIdeas: normalizeKeyIdeas(keyIdeas),
    formulas: mergeFormulas(formulas, portionFormulas),
    portions: normalizedPortions,
    steps: normalizedSteps.length
      ? normalizedSteps
      : !normalizedPortions.length && intro
        ? [
            {
              title: "",
              text: sanitizeStudyMathContent(intro),
              diagramPrompt: "",
              imageUrl: "",
              imageAlt: "",
              callouts: [],
              engagementHook: "",
              diagramFrame: 0,
              audioUrl: "",
              narrationText: "",
            },
          ]
        : [],
    followUps: Array.isArray(followUps) ? followUps.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 3) : [],
    onTopic: onTopic !== false,
    visualSequence: hasVisualSequence(normalizedSteps),
    introAudioUrl: String(introAudioUrl || "").trim(),
  });
}

function tryParseJsonValue(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function unwrapCoachPayloadCandidate(value) {
  if (value == null) {
    return null;
  }

  let parsed = typeof value === "string" ? tryParseJsonValue(value.trim()) : value;
  if (typeof parsed === "string") {
    parsed = tryParseJsonValue(parsed.trim());
  }

  return isCoachPayloadShape(parsed) ? parsed : null;
}

function looksLikeJsonObject(value) {
  const text = String(value || "").trim();
  return text.startsWith("{") && text.endsWith("}");
}

export function normalizeStudyMessage(entry) {
  if (!entry || typeof entry !== "object") {
    return entry;
  }

  const payload = parseStoredMessagePayload(entry);
  const rawContent = String(entry.content || "").trim();
  let content = rawContent;

  if (payload) {
    const plain = stepsToPlainText(payload);
    if (plain && (!rawContent || looksLikeJsonObject(rawContent))) {
      content = plain;
    }
  }

  return {
    ...entry,
    content,
    payload: payload || undefined,
  };
}

export function parseStoredMessagePayload(entry, { forExport = false } = {}) {
  if (!entry) {
    return null;
  }

  if (entry.payload && isCoachPayloadShape(entry.payload)) {
    return buildParsedCoachPayload(entry.payload, { forExport });
  }

  const payloadFromJson = unwrapCoachPayloadCandidate(entry.payloadJson);
  if (payloadFromJson) {
    return buildParsedCoachPayload(payloadFromJson, { forExport });
  }

  const content = String(entry.content || "").trim();
  if (!content) {
    return null;
  }

  const payloadFromContent = unwrapCoachPayloadCandidate(content);
  if (payloadFromContent) {
    return buildParsedCoachPayload(payloadFromContent, { forExport });
  }

  return {
    intro: "",
    introNarrationText: "",
    steps: [
      {
        title: "",
        text: sanitizeStudyMathContent(content),
        diagramPrompt: "",
        imageUrl: "",
        imageAlt: "",
        callouts: [],
        engagementHook: "",
        diagramFrame: 0,
        audioUrl: "",
        narrationText: "",
      },
    ],
    followUps: [],
    onTopic: true,
    visualSequence: false,
    introAudioUrl: "",
  };
}
