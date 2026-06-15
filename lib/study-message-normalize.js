import { inferCircuitDiagramSpec, looksLikeCircuitContent } from "./circuit-diagram.js";
import {
  extractOrphanLatexFormulas,
  isAsciiDiagramContent,
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

export function stripCoachJsonWrapping(text) {
  let value = String(text || "").trim();
  const fenced = value.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/i);
  if (fenced) {
    value = fenced[1].trim();
  }
  return value;
}

const LATEX_COMMANDS_WITH_JSON_ESCAPE_PREFIX = [
  "begin",
  "end",
  "frac",
  "text",
  "geq",
  "leq",
  "neq",
  "right",
  "left",
];

function latexCommandContinues(escapeChar, tailLetters) {
  if (!tailLetters) {
    return false;
  }
  const combined = `${escapeChar}${tailLetters}`;
  return LATEX_COMMANDS_WITH_JSON_ESCAPE_PREFIX.some((command) => command.startsWith(combined));
}

/**
 * Fix LaTeX backslashes inside JSON string values (e.g. \\quad, \\frac) so JSON.parse succeeds.
 */
export function repairCoachJsonText(text) {
  const input = String(text || "");
  let out = "";
  let inString = false;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];

    if (!inString) {
      if (ch === '"') {
        inString = true;
      }
      out += ch;
      continue;
    }

    if (ch === '"') {
      inString = false;
      out += ch;
      continue;
    }

    if (ch !== "\\") {
      out += ch;
      continue;
    }

    const next = input[i + 1];
    if (!next) {
      out += "\\\\";
      continue;
    }

    if (next === "u") {
      const hex = input.slice(i + 2, i + 6);
      if (/^[0-9a-fA-F]{4}$/.test(hex)) {
        out += input.slice(i, i + 6);
        i += 5;
        continue;
      }
      out += "\\\\u";
      i += 1;
      continue;
    }

    const tail = input.slice(i + 2).match(/^[a-zA-Z]+/);
    if ("bfnrt".includes(next) && latexCommandContinues(next, tail?.[0] || "")) {
      out += `\\\\${next}${tail[0]}`;
      i += 1 + tail[0].length;
      continue;
    }

    if ('"\\/bfnrt'.includes(next)) {
      out += `\\${next}`;
      i += 1;
      continue;
    }

    out += `\\\\${next}`;
    i += 1;
  }

  return out;
}

function looselyExtractCoachPayload(text) {
  const stripped = stripCoachJsonWrapping(text);
  if (!stripped.startsWith("{")) {
    return null;
  }

  const pickString = (field) => {
    const match = stripped.match(new RegExp(`"${field}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`, "s"));
    if (!match) {
      return "";
    }
    try {
      return JSON.parse(`"${match[1]}"`);
    } catch {
      return match[1].replace(/\\"/g, '"').replace(/\\\\/g, "\\");
    }
  };

  const intro = pickString("intro");
  const topicHeader = pickString("topicHeader");
  const reply = pickString("reply");
  const portions = [];
  const portionPattern =
    /"id"\s*:\s*"([^"]+)"[\s\S]*?"label"\s*:\s*"((?:[^"\\]|\\.)*)"[\s\S]*?"content"\s*:\s*"((?:[^"\\]|\\.)*)"/g;
  let portionMatch = portionPattern.exec(stripped);
  while (portionMatch) {
    let content = portionMatch[3];
    try {
      content = JSON.parse(`"${content}"`);
    } catch {
      content = content.replace(/\\"/g, '"').replace(/\\\\/g, "\\");
    }
    portions.push({
      id: portionMatch[1],
      label: portionMatch[2],
      content,
    });
    portionMatch = portionPattern.exec(stripped);
  }

  if (!intro && !reply && !topicHeader && !portions.length) {
    return null;
  }

  return {
    topicHeader,
    intro: intro || reply,
    portions,
    onTopic: true,
  };
}

export function stripLeadingOnyxToolStub(text) {
  let value = String(text || "").trim();
  if (!value) {
    return "";
  }

  while (value.startsWith("{")) {
    const end = value.indexOf("\n\n");
    const candidate = end > 0 ? value.slice(0, end) : value;
    try {
      const parsed = JSON.parse(candidate);
      if (!isOnyxToolStubObject(parsed)) {
        break;
      }
      value = end > 0 ? value.slice(end + 2).trim() : "";
      if (!value) {
        return "";
      }
    } catch {
      const match = value.match(/^\{[\s\S]*?\}/);
      if (!match) {
        break;
      }
      try {
        const parsed = JSON.parse(match[0]);
        if (!isOnyxToolStubObject(parsed)) {
          break;
        }
        value = value.slice(match[0].length).trim();
        if (!value) {
          return "";
        }
      } catch {
        break;
      }
    }
  }

  return value.trim();
}

export function extractCoachJsonObject(text) {
  const stripped = stripCoachJsonWrapping(text);
  if (!stripped) {
    return null;
  }

  let parsed = tryParseCoachJsonValue(stripped);
  if (!parsed) {
    const match = stripped.match(/\{[\s\S]*\}/);
    if (match) {
      parsed = tryParseCoachJsonValue(match[0]);
    }
  }

  if (!parsed) {
    parsed = looselyExtractCoachPayload(stripped);
  }

  return parsed && typeof parsed === "object" ? parsed : null;
}

export function normalizeCoachPayloadCandidate(parsed) {
  if (!parsed || typeof parsed !== "object") {
    return parsed;
  }

  const normalized = { ...parsed };
  if (!String(normalized.intro || "").trim() && String(normalized.reply || "").trim()) {
    normalized.intro = String(normalized.reply).trim();
  }

  let portions = Array.isArray(normalized.portions) ? normalized.portions : [];
  if (!portions.length && typeof normalized.content === "string" && normalized.content.trim()) {
    portions = [{ id: "p1", label: "", content: normalized.content.trim() }];
  }
  normalized.portions = portions;
  return normalized;
}

export function isLikelyRawCoachJson(value) {
  const text = String(value || "").trim();
  return text.startsWith("{") && text.endsWith("}");
}

const ONYX_TOOL_PARAMETER_KEYS = new Set(["memory", "q", "query", "queries"]);

function hasCoachPayloadFields(parsed) {
  return Boolean(
    String(parsed?.intro || "").trim() ||
      String(parsed?.reply || "").trim() ||
      String(parsed?.topicHeader || "").trim() ||
      (Array.isArray(parsed?.formulas) && parsed.formulas.length) ||
      (Array.isArray(parsed?.portions) && parsed.portions.length) ||
      (Array.isArray(parsed?.steps) && parsed.steps.length) ||
      (Array.isArray(parsed?.keyIdeas) && parsed.keyIdeas.length) ||
      (Array.isArray(parsed?.breadcrumbs) && parsed.breadcrumbs.length) ||
      (typeof parsed?.content === "string" && parsed.content.trim()),
  );
}

/** Onyx/small models sometimes echo pseudo tool-call JSON instead of tutor payloads. */
export function isOnyxToolStubObject(parsed) {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return false;
  }
  if (hasCoachPayloadFields(parsed)) {
    return false;
  }

  if (parsed.tool_name || parsed.tool_arguments || parsed.queries) {
    return true;
  }

  const params = parsed.parameters ?? parsed.arguments;
  if (!params || typeof params !== "object" || Array.isArray(params)) {
    return false;
  }

  const paramKeys = Object.keys(params);
  if (paramKeys.some((key) => ONYX_TOOL_PARAMETER_KEYS.has(key))) {
    return true;
  }

  if (parsed.name === "internal_search") {
    return true;
  }

  const name = String(parsed.name || "").trim();
  if (name && /^[a-z0-9]+(?:-[a-z0-9]+)+$/.test(name) && paramKeys.length > 0) {
    return true;
  }

  return false;
}

export function isOnyxToolStubText(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed.startsWith("{")) {
    return false;
  }

  const parsed = extractCoachJsonObject(trimmed);
  if (!parsed || !isOnyxToolStubObject(parsed)) {
    return false;
  }

  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return false;
  }

  const after = trimmed.slice(jsonMatch.index + jsonMatch[0].length).trim();
  return after.length <= 20;
}

export function isCoachPayloadShape(parsed) {
  if (!parsed || typeof parsed !== "object") {
    return false;
  }
  if (isOnyxToolStubObject(parsed)) {
    return false;
  }

  const candidate = normalizeCoachPayloadCandidate(parsed);

  return Boolean(
    String(candidate.intro || "").trim() ||
      String(candidate.reply || "").trim() ||
      String(candidate.topicHeader || "").trim() ||
      (Array.isArray(candidate.formulas) && candidate.formulas.length) ||
      (Array.isArray(candidate.portions) && candidate.portions.length) ||
      (Array.isArray(candidate.steps) && candidate.steps.length) ||
      (Array.isArray(candidate.keyIdeas) && candidate.keyIdeas.length) ||
      (Array.isArray(candidate.breadcrumbs) && candidate.breadcrumbs.length) ||
      (typeof candidate.content === "string" && candidate.content.trim()),
  );
}

export function coachPayloadHasRenderableBody(payload) {
  if (!payload) {
    return false;
  }

  const portions = Array.isArray(payload.portions) ? payload.portions : [];
  const steps = Array.isArray(payload.steps) ? payload.steps : [];

  if (portions.some((portion) => String(portion?.content || "").trim())) {
    return true;
  }

  if (steps.some((step) => String(step?.text || "").trim() || isDiagramCapableStep(step))) {
    return true;
  }

  return Boolean(
    String(payload.intro || "").trim() ||
      String(payload.topicHeader || "").trim() ||
      (Array.isArray(payload.keyIdeas) && payload.keyIdeas.some((idea) => String(idea || "").trim())) ||
      (Array.isArray(payload.formulas) &&
        payload.formulas.some((item) => String(item?.expression || item?.label || "").trim())),
  );
}

function finalizeCoachPortions(rawPortions) {
  return rawPortions
    .filter((portion) => portion.content)
    .map(({ _extractedFormulas, ...portion }) => portion);
}

function buildParsedCoachPayload(parsed, { forExport = false } = {}) {
  const normalized = normalizeCoachPayloadCandidate(parsed);
  const baseFormulas = normalizeFormulas(normalized.formulas || []);
  const rawPortions = normalizeCoachPortions(normalized.portions || []);
  const portionFormulas = rawPortions.flatMap((portion) => portion._extractedFormulas || []);
  const portions = finalizeCoachPortions(rawPortions);
  const steps = normalizeCoachSteps(normalized.steps || [], String(normalized.intro || "").trim());
  return enrichPayloadWithPortionStepMapping(
    {
      intro: sanitizeStudyMathContent(normalized.intro || ""),
      introNarrationText: String(normalized.introNarrationText || "").trim(),
      topicHeader: String(normalized.topicHeader || "").trim(),
      breadcrumbs: normalizeBreadcrumbs(normalized.breadcrumbs),
      keyIdeas: normalizeKeyIdeas(normalized.keyIdeas),
      formulas: mergeFormulas(baseFormulas, portionFormulas),
      portions,
      steps,
      followUps: Array.isArray(normalized.followUps)
        ? normalized.followUps.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 3)
        : [],
      onTopic: normalized.onTopic !== false,
      visualSequence: normalized.visualSequence ?? hasVisualSequence(steps),
      introAudioUrl: String(normalized.introAudioUrl || "").trim(),
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
      let diagramSpec = normalizeDiagramSpec(step?.diagramSpec);
      if (!diagramSpec && looksLikeCircuitContent(rawText)) {
        diagramSpec = inferCircuitDiagramSpec(rawText);
      }
      const diagramMermaid = String(step?.diagramMermaid || "").trim();
      let text = sanitizeStudyMathContent(stripAsciiDiagramSections(rawText));
      if (diagramSpec?.diagramType === "circuit" && (!text.trim() || isAsciiDiagramContent(text))) {
        const labels = diagramSpec.components.map((item) => `${item.id} ${item.value} ${item.unit}`).join(", ");
        text = diagramSpec.voltage
          ? `Circuit: ${labels} — ${diagramSpec.voltage} ${diagramSpec.voltageUnit || "V"} supply (${diagramSpec.layout}).`
          : `Circuit: ${labels} (${diagramSpec.layout}).`;
      }

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
        diagramType: diagramSpec?.diagramType === "circuit" ? "circuit" : diagram.diagramType,
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

export function tryParseCoachJsonValue(value) {
  const text = String(value || "");
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    // fall through
  }

  const repaired = repairCoachJsonText(text);
  if (repaired !== text) {
    try {
      return JSON.parse(repaired);
    } catch {
      // fall through
    }
  }

  return null;
}

function tryParseJsonValue(value) {
  return tryParseCoachJsonValue(value);
}

function unwrapCoachPayloadCandidate(value) {
  if (value == null) {
    return null;
  }

  let parsed =
    typeof value === "string" ? extractCoachJsonObject(value) : value;
  if (typeof parsed === "string") {
    parsed = extractCoachJsonObject(parsed);
  }

  return isCoachPayloadShape(parsed) ? normalizeCoachPayloadCandidate(parsed) : null;
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
    if (!rawContent || isLikelyRawCoachJson(rawContent)) {
      content =
        plain ||
        String(payload.intro || "").trim() ||
        String(payload.topicHeader || "").trim() ||
        "";
    } else if (plain) {
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
