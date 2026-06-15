/**
 * Study Coach via local Onyx deployment (Docker).
 * Uses POST /chat/send-chat-message with persona + optional project scope.
 *
 * Search scoping: year + subject only (e.g. Year 7 Mathematics → year-7-mathematics-*.md).
 * internal_search_filters carries year_level + subject tags; document_set is ANDed when set.
 * Onyx ORs entries within tags — we send exactly two tags (year + subject), not per-subtopic lists.
 */

import {
  buildCurriculumOnyxFilename,
  buildCurriculumOnyxYearSubjectPrefix,
} from "./curriculum-onyx-filename.js";
import {
  loadLocalCurriculumDocsForYearSubject,
  resolveOnyxLocalCurriculumMaxChars,
  resolveOnyxLocalCurriculumMaxDocs,
} from "./curriculum-doc-retrieve.js";
import { readOnyxChatStream } from "./study-coach-stream.js";
import { isOnyxToolStubObject } from "./study-message-normalize.js";

export {
  buildCurriculumOnyxFilename,
  buildCurriculumOnyxYearSubjectPrefix,
  slugifyOnyxPathSegment,
} from "./curriculum-onyx-filename.js";

export function resolveOnyxApiBaseUrl() {
  const raw = String(process.env.ONYX_API_BASE_URL || "http://localhost:3001/api")
    .trim()
    .replace(/\/$/, "");
  if (!raw) {
    return "http://localhost:3001/api";
  }

  try {
    const url = new URL(raw);
    const path = url.pathname.replace(/\/$/, "") || "";
    if (!path || path === "/") {
      url.pathname = "/api";
      return url.toString().replace(/\/$/, "");
    }
    if (path.endsWith("/api")) {
      return raw;
    }
    return raw;
  } catch {
    return raw.endsWith("/api") ? raw : `${raw}/api`;
  }
}

async function readResponseBodyText(response) {
  if (typeof response?.text === "function") {
    return response.text();
  }
  if (typeof response?.json === "function") {
    const data = await response.json();
    return JSON.stringify(data ?? {});
  }
  return "";
}

async function readOnyxErrorBody(response) {
  try {
    return (await readResponseBodyText(response)).slice(0, 300);
  } catch {
    return "";
  }
}

function readResponseContentType(response) {
  return String(response?.headers?.get?.("content-type") || "").toLowerCase();
}

function formatOnyxHttpError(response, bodyPreview) {
  const contentType = readResponseContentType(response);
  const snippet = String(bodyPreview || "").replace(/\s+/g, " ").trim();
  if (contentType.includes("text/html") || snippet.startsWith("<!DOCTYPE") || snippet.startsWith("<html")) {
    return `Onyx returned HTML instead of JSON (HTTP ${response.status}). Check ONYX_API_BASE_URL ends with /api (e.g. http://localhost:3001/api). Body: ${snippet.slice(0, 160)}`;
  }
  return `Onyx request failed (HTTP ${response.status}${contentType ? `, ${contentType}` : ""}): ${snippet || response.statusText || "empty body"}`;
}

export function resolveOnyxPersonaId() {
  const configured = Number(process.env.ONYX_PERSONA_ID ?? 1);
  return Number.isFinite(configured) ? configured : 1;
}

export function resolveOnyxProjectId() {
  const raw = String(process.env.ONYX_PROJECT_ID || "").trim();
  if (!raw) {
    return null;
  }
  const configured = Number(raw);
  return Number.isFinite(configured) ? configured : null;
}

export function resolveOnyxChatTimeoutMs() {
  const configured = Number(process.env.ONYX_CHAT_TIMEOUT_MS || 300000);
  return Number.isFinite(configured) && configured > 0 ? configured : 300000;
}

/** When true (default), narrow Onyx internal search to year + subject. */
export function resolveOnyxSearchFilterEnabled() {
  const raw = String(process.env.ONYX_SEARCH_FILTER_ENABLED ?? "true").trim().toLowerCase();
  return raw !== "false" && raw !== "0";
}

/** Legacy env alias — year+subject scoping is always used when filters are enabled. */
export function resolveOnyxSearchFilterMode() {
  const raw = String(process.env.ONYX_SEARCH_FILTER_MODE || "year_subject").trim().toLowerCase();
  if (raw === "off") {
    return "off";
  }
  return "year_subject";
}

/** Optional document_set name filter (matches Onyx document set for cc_pair 34). */
export function resolveOnyxDocumentSetName() {
  return String(process.env.ONYX_DOCUMENT_SET || "").trim() || null;
}

export function resolveOnyxStreamingEnabled() {
  const raw = String(process.env.ONYX_STREAM || "false").trim().toLowerCase();
  return raw === "true" || raw === "1";
}

/**
 * Skip Onyx internal_search and inject local curriculum instead.
 * auto (default) — skip when year+subject filters apply and local docs exist
 * true — always skip when local docs exist
 * false — always use Onyx RAG
 */
export function resolveOnyxSkipSearchMode() {
  const raw = String(process.env.STUDY_COACH_ONYX_SKIP_SEARCH ?? "auto").trim().toLowerCase();
  if (raw === "false" || raw === "0" || raw === "off") {
    return "off";
  }
  if (raw === "true" || raw === "1" || raw === "on") {
    return "on";
  }
  return "auto";
}

export function shouldOnyxSkipSearch({ context, localCurriculumAvailable = false } = {}) {
  if (!localCurriculumAvailable) {
    return false;
  }

  const mode = resolveOnyxSkipSearchMode();
  if (mode === "off") {
    return false;
  }
  if (mode === "on") {
    return true;
  }

  const searchFilters = buildOnyxInternalSearchFilters(context);
  return Boolean(searchFilters?.tags?.length);
}

export function buildOnyxYearSubjectScope(context) {
  const yearLevel = String(context?.yearLevel || "").trim();
  const subject = String(context?.subject || "").trim();
  return {
    yearLevel,
    subject,
    focus: String(context?.focus || "").trim(),
    filenamePrefix: buildCurriculumOnyxYearSubjectPrefix({ yearLevel, subject }),
  };
}

/** @deprecated Use buildOnyxYearSubjectScope — kept for scripts/tests. */
export function buildOnyxCurriculumScope(context) {
  return buildOnyxYearSubjectScope(context);
}

export function loadOnyxLocalCurriculumTexts(context) {
  const scope = buildOnyxYearSubjectScope(context);
  if (!scope.yearLevel || !scope.subject) {
    return [];
  }

  const maxChars = resolveOnyxLocalCurriculumMaxChars();
  const maxDocs = resolveOnyxLocalCurriculumMaxDocs();
  const perDocMax = Math.max(500, Math.floor(maxChars / maxDocs));
  const docs = loadLocalCurriculumDocsForYearSubject({
    yearLevel: scope.yearLevel,
    subject: scope.subject,
    maxDocs,
    maxCharsPerDoc: perDocMax,
  });

  return docs.map((doc) => ({
    scope: {
      yearLevel: doc.yearLevel,
      subject: doc.subject,
      focusLabel: doc.focusLabel,
      subtopic: doc.subtopic,
      curriculumFilename: buildCurriculumOnyxFilename({
        yearLevel: doc.yearLevel,
        subject: doc.subject,
        subtopic: doc.subtopic,
      }),
    },
    text: doc.text,
  }));
}

export function loadOnyxLocalCurriculumText(context) {
  const sections = loadOnyxLocalCurriculumTexts(context);
  if (!sections.length) {
    return "";
  }
  if (sections.length === 1) {
    return sections[0].text;
  }

  return sections
    .map(({ scope, text }) => {
      const heading = scope.focusLabel || scope.subtopic || "Subtopic";
      const fileLine = scope.curriculumFilename ? ` (File: ${scope.curriculumFilename})` : "";
      return `### ${heading}${fileLine}\n\n${text}`;
    })
    .join("\n\n---\n\n");
}

function pushTag(tags, tagKey, tagValue) {
  const value = String(tagValue || "").trim();
  if (!value) {
    return;
  }
  tags.push({ tag_key: tagKey, tag_value: value });
}

/** Build Onyx tag filters — year_level + subject only. */
export function buildOnyxSearchTags(context) {
  if (!resolveOnyxSearchFilterEnabled() || resolveOnyxSearchFilterMode() === "off") {
    return [];
  }

  const { yearLevel, subject } = buildOnyxYearSubjectScope(context);
  if (!yearLevel || !subject) {
    return [];
  }

  const tags = [];
  pushTag(tags, "year_level", yearLevel);
  pushTag(tags, "subject", subject);
  return tags;
}

export function buildOnyxInternalSearchFilters(context, options = {}) {
  void options;
  if (!resolveOnyxSearchFilterEnabled()) {
    return null;
  }

  const tags = buildOnyxSearchTags(context);
  const documentSet = resolveOnyxDocumentSetName();
  if (!tags.length && !documentSet) {
    return null;
  }

  const filters = {};
  if (tags.length) {
    filters.tags = tags;
  }
  if (documentSet) {
    filters.document_set = [documentSet];
  }
  return filters;
}

function buildOnyxAdditionalContext({
  context,
  searchScoped = false,
  skipSearch = false,
  localCurriculumText = null,
}) {
  const scope = buildOnyxYearSubjectScope(context);

  const parts = [
    `Year level: ${scope.yearLevel || "unknown"}`,
    `Subject: ${scope.subject || "unknown"}`,
  ];

  if (scope.focus) {
    parts.push(`Assignment focus: ${scope.focus}`);
  }

  if (scope.filenamePrefix) {
    parts.push(
      `Search only ${scope.yearLevel} ${scope.subject} curriculum files (${scope.filenamePrefix}*.md).`,
    );
  }

  if (skipSearch && localCurriculumText) {
    parts.push(
      `Curriculum references (pre-loaded for ${scope.yearLevel} ${scope.subject} — use as background only; explain in your own words, do not paste or quote large blocks):`,
    );
    parts.push(localCurriculumText);
    parts.push(
      "Do not call internal_search or emit tool-call JSON. Return ONLY the tutor JSON format from your system prompt (topicHeader, intro, portions). Double every LaTeX backslash inside JSON strings (\\\\frac, \\\\quad, \\\\text).",
    );
  } else if (searchScoped) {
    parts.push(
      `Search is scoped to ${scope.yearLevel} ${scope.subject} curriculum. Retrieve relevant excerpts for background, then explain the answer in your own words — do not paste or quote large blocks from the documents.`,
    );
    parts.push(
      "After searching, return ONLY the tutor JSON format from your system prompt (topicHeader, intro, portions). Do not emit tool-call JSON (name/parameters) in your reply. Double every LaTeX backslash inside JSON strings.",
    );
  } else if (context.curriculumSummary) {
    parts.push(`Curriculum summary: ${context.curriculumSummary}`);
  }

  if (Array.isArray(context.learningIntentions) && context.learningIntentions.length) {
    parts.push(`Learning intentions: ${context.learningIntentions.slice(0, 3).join("; ")}`);
  }

  return parts.join("\n");
}

export function buildOnyxChatRequestBody({
  context,
  message,
  chatSessionId = null,
  studentTopic = null,
  stream = resolveOnyxStreamingEnabled(),
  localCurriculumText = null,
} = {}) {
  void studentTopic;
  const curriculumText = String(localCurriculumText || "").trim();
  const skipSearch = shouldOnyxSkipSearch({
    context,
    localCurriculumAvailable: Boolean(curriculumText),
  });
  const searchFilters = skipSearch ? null : buildOnyxInternalSearchFilters(context);
  const searchScoped = Boolean(searchFilters?.tags?.length);

  const body = {
    message: String(message || "").trim(),
    stream,
    include_citations: false,
    deep_research: false,
    origin: "api",
    file_descriptors: [],
    additional_context: buildOnyxAdditionalContext({
      context,
      searchScoped,
      skipSearch,
      localCurriculumText: curriculumText,
    }),
  };

  if (skipSearch) {
    body.allowed_tool_ids = [];
  } else {
    // Persona 1 = internal_search only; force one search pass then synthesize an answer.
    body.forced_tool_id = 1;
    body.allowed_tool_ids = [1];
    if (searchFilters) {
      body.internal_search_filters = searchFilters;
    }
  }

  if (chatSessionId) {
    body.chat_session_id = chatSessionId;
  } else {
    const sessionInfo = { persona_id: resolveOnyxPersonaId() };
    const projectId = resolveOnyxProjectId();
    if (projectId != null) {
      sessionInfo.project_id = projectId;
    }
    body.chat_session_info = sessionInfo;
  }

  return body;
}

function normalizeOnyxComparisonText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function collectOnyxSearchSnippets(data) {
  const snippets = [];

  for (const doc of data?.top_documents || []) {
    const text = String(doc?.content || doc?.blurb || "").trim();
    if (text) {
      snippets.push(text);
    }
  }

  for (const call of data?.tool_calls || []) {
    for (const doc of call?.search_docs || []) {
      const text = String(doc?.content || doc?.blurb || "").trim();
      if (text) {
        snippets.push(text);
      }
    }

    const toolResult = String(call?.tool_result || "").trim();
    if (toolResult.startsWith("{") || toolResult.startsWith("[")) {
      try {
        const parsed = JSON.parse(toolResult);
        const results = parsed?.results || parsed?.search_docs || parsed?.documents || [];
        for (const entry of results) {
          const text = String(entry?.content || entry?.blurb || entry?.chunk || "").trim();
          if (text) {
            snippets.push(text);
          }
        }
      } catch {
        if (toolResult.length > 120) {
          snippets.push(toolResult);
        }
      }
    } else if (toolResult.length > 120) {
      snippets.push(toolResult);
    }
  }

  return snippets;
}

function looksLikeOnyxSearchDump(answer, data) {
  const text = String(answer || "").trim();
  if (!text) {
    return false;
  }

  const normalizedAnswer = normalizeOnyxComparisonText(text);
  if (!normalizedAnswer) {
    return false;
  }

  if (/^#+\s/.test(text) || text.includes("#ONYX_METADATA")) {
    return true;
  }

  if (/learning guide/i.test(text) && /###\s+introduction/i.test(text)) {
    return true;
  }

  if (text.startsWith("{") && text.includes('"results"') && text.includes('"document"')) {
    return true;
  }

  for (const snippet of collectOnyxSearchSnippets(data)) {
    const normalizedSnippet = normalizeOnyxComparisonText(snippet);
    if (normalizedSnippet.length < 120) {
      continue;
    }
    const prefix = normalizedSnippet.slice(0, Math.min(180, normalizedSnippet.length));
    if (prefix && normalizedAnswer.startsWith(prefix.slice(0, Math.min(120, prefix.length)))) {
      return true;
    }
    if (normalizedAnswer.length >= 240 && normalizedSnippet.includes(normalizedAnswer.slice(0, 180))) {
      return true;
    }
  }

  return false;
}

export function classifyOnyxReply(rawReply, data = null) {
  const text = stripOnyxToolArtifacts(String(rawReply || "").trim());
  if (!text) {
    return "empty";
  }

  if (looksLikeOnyxSearchDump(text, data)) {
    return "search_dump";
  }

  const trimmed = text.trimStart();
  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed.match(/\{[\s\S]*\}/)?.[0] || trimmed);
      if (parsed && (parsed.portions || parsed.intro || parsed.steps || parsed.topicHeader)) {
        return "json_tutor";
      }
    } catch {
      // fall through
    }
  }

  if (text.includes('"portions"') || text.includes('"intro"')) {
    return "json_tutor";
  }

  return "reasoned_prose";
}

function stripOnyxToolArtifacts(answer) {
  let text = String(answer || "").trim();
  if (!text) {
    return "";
  }

  // Drop leading pseudo tool-call JSON blobs that small models sometimes echo into the final answer.
  while (text.startsWith("{")) {
    const end = text.indexOf("\n\n");
    const candidate = end > 0 ? text.slice(0, end) : text;
    try {
      const parsed = JSON.parse(candidate);
      if (!isOnyxToolStubObject(parsed)) {
        break;
      }
      text = end > 0 ? text.slice(end + 2).trim() : "";
      if (!text) {
        return "";
      }
    } catch {
      break;
    }
  }

  return text.trim();
}

export function extractOnyxAssistantAnswer(data) {
  const answer = stripOnyxToolArtifacts(String(data?.answer_citationless || data?.answer || "").trim());
  if (!answer) {
    return "";
  }
  if (looksLikeOnyxSearchDump(answer, data)) {
    return "";
  }
  return answer;
}

function buildOnyxParseMetadata(data, rawReply) {
  const searchDocCount =
    (Array.isArray(data?.top_documents) ? data.top_documents.length : 0) +
    (Array.isArray(data?.tool_calls)
      ? data.tool_calls.reduce((count, call) => count + (call?.search_docs?.length || 0), 0)
      : 0);

  return {
    responseKind: classifyOnyxReply(rawReply, data),
    searchDocCount,
    toolCallCount: Array.isArray(data?.tool_calls) ? data.tool_calls.length : 0,
  };
}

async function parseOnyxChatResponse(response, { stream = false, onToken } = {}) {
  if (!stream) {
    const contentType = readResponseContentType(response);
    const rawBody = await readResponseBodyText(response);
    if (contentType.includes("text/html") || rawBody.trimStart().startsWith("<")) {
      throw new Error(formatOnyxHttpError(response, rawBody));
    }

    let data;
    try {
      data = JSON.parse(rawBody);
    } catch {
      throw new Error(formatOnyxHttpError(response, rawBody));
    }

    if (data.error_msg) {
      throw new Error(String(data.error_msg));
    }

    const rawReply = extractOnyxAssistantAnswer(data);
    if (!rawReply) {
      const hadSearchHits = collectOnyxSearchSnippets(data).length > 0;
      if (hadSearchHits) {
        throw new Error(
          "Onyx retrieved curriculum excerpts but did not produce a tutor answer. Check persona instructions and model capacity.",
        );
      }
      throw new Error("Onyx returned an empty response.");
    }

    return {
      rawReply,
      responseId: data.chat_session_id ? String(data.chat_session_id) : null,
      onyx: buildOnyxParseMetadata(data, rawReply),
    };
  }

  let rawReply = "";
  let responseId = null;

  for await (const packet of readOnyxChatStream(response)) {
    if (packet.responseId) {
      responseId = packet.responseId;
    }
    if (packet.delta) {
      rawReply += packet.delta;
      onToken?.(packet.delta, rawReply);
    }
    if (packet.error) {
      throw new Error(packet.error);
    }
  }

  const trimmed = rawReply.trim();
  if (!trimmed) {
    throw new Error("Onyx returned an empty response.");
  }

  if (looksLikeOnyxSearchDump(trimmed, null)) {
    throw new Error("Onyx streamed search excerpts instead of a tutor answer.");
  }

  const cleaned = stripOnyxToolArtifacts(trimmed);
  if (!cleaned) {
    throw new Error("Onyx returned an empty response.");
  }

  return {
    rawReply: cleaned,
    responseId,
    onyx: buildOnyxParseMetadata(null, cleaned),
  };
}

export async function callOnyxStudyCoach(
  { context, message, previousResponseId = null, studentTopic = null },
  { fetchImpl = fetch, onToken } = {},
) {
  void studentTopic;
  const apiKey = process.env.ONYX_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("ONYX_API_KEY is not configured.");
  }

  const stream = resolveOnyxStreamingEnabled();
  const localCurriculumText = loadOnyxLocalCurriculumText(context);
  const body = buildOnyxChatRequestBody({
    context,
    message,
    chatSessionId: previousResponseId,
    stream,
    localCurriculumText,
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), resolveOnyxChatTimeoutMs());

  try {
    const response = await fetchImpl(`${resolveOnyxApiBaseUrl()}/chat/send-chat-message`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Accept: stream ? "text/event-stream" : "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const contentType = readResponseContentType(response);
    if (!response.ok) {
      throw new Error(formatOnyxHttpError(response, await readOnyxErrorBody(response)));
    }
    if (contentType.includes("text/html")) {
      throw new Error(formatOnyxHttpError(response, await readOnyxErrorBody(response)));
    }

    return parseOnyxChatResponse(response, { stream, onToken });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error("Onyx request timed out.");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
