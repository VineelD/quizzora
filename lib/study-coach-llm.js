import { buildStudyCoachOllamaSystemPrompt, buildStudyCoachSystemPrompt } from "./study-coach.js";
import { retrieveStudyCoachRagContext } from "./curriculum-doc-retrieve.js";
import { readOllamaChatCompletionStream } from "./study-coach-stream.js";
import { detectTopicMention } from "./topic-vocab-suggest.js";
import { buildOpenAiFailure, fetchOpenAiWithRetry, resolveOpenAiRetryOptions } from "./openai-errors.js";
import { isOpenAiDisabled } from "./openai-policy.js";
import { callOnyxStudyCoach, resolveOnyxStreamingEnabled } from "./study-coach-onyx.js";
import {
  buildOllamaRequestHeaders,
  isStudyCoachOllamaCloudEnabled,
  resolveOllamaChatEndpoint,
  resolveOllamaCloudChatEndpoint,
  resolveOllamaLocalChatEndpoint,
  resolveOllamaModel,
} from "./ollama-config.js";

export {
  buildOllamaRequestHeaders,
  isStudyCoachOllamaCloudEnabled,
  resolveOllamaChatEndpoint,
  resolveOllamaCloudChatEndpoint,
  resolveOllamaLocalChatEndpoint,
  resolveOllamaModel,
} from "./ollama-config.js";

const DEFAULT_OLLAMA_TIMEOUT_MS = 120000;
const DEFAULT_OLLAMA_NUM_CTX = 4096;
/** Conservative chars-per-token estimate for English + JSON coach replies. */
const OLLAMA_CHARS_PER_TOKEN = 3.5;

export function estimateOllamaTextTokens(text) {
  const length = String(text || "").length;
  return length > 0 ? Math.ceil(length / OLLAMA_CHARS_PER_TOKEN) : 0;
}

export function estimateOllamaMessageTokens(message) {
  return estimateOllamaTextTokens(message?.content) + 4;
}

export function resolveOllamaNumCtx() {
  const configured = Number(process.env.STUDY_COACH_OLLAMA_NUM_CTX);
  return Number.isFinite(configured) && configured >= 1024 ? configured : DEFAULT_OLLAMA_NUM_CTX;
}

export function resolveOllamaInputMargin() {
  const configured = Number(process.env.STUDY_COACH_OLLAMA_INPUT_MARGIN);
  return Number.isFinite(configured) && configured >= 0 ? configured : 128;
}

export function resolveOllamaMaxInputTokens() {
  const configured = Number(process.env.STUDY_COACH_OLLAMA_MAX_INPUT_TOKENS);
  if (Number.isFinite(configured) && configured > 0) {
    return configured;
  }
  const numCtx = resolveOllamaNumCtx();
  const maxOutput = resolveOllamaMaxOutputTokens();
  const margin = resolveOllamaInputMargin();
  // Ollama also reserves chat-template overhead; ~72% of num_ctx is a safe prompt budget.
  const templateSafeBudget = Math.floor(numCtx * 0.72) - margin;
  const reservedBudget = numCtx - maxOutput - margin;
  return Math.max(512, Math.min(templateSafeBudget, reservedBudget));
}

function shrinkRagSection(systemContent, charsToRemove) {
  const marker = "Curriculum reference";
  const start = systemContent.indexOf(marker);
  if (start < 0) {
    return systemContent;
  }
  const endMarker = "\nTeaching rules:";
  const end = systemContent.indexOf(endMarker, start);
  if (end < 0) {
    return systemContent;
  }
  const ragSection = systemContent.slice(start, end);
  const targetLength = Math.max(120, ragSection.length - Math.max(0, charsToRemove));
  if (targetLength >= ragSection.length) {
    return systemContent;
  }
  const shortened = `${ragSection.slice(0, targetLength).trimEnd()}\n[truncated for context limit]`;
  return `${systemContent.slice(0, start)}${shortened}${systemContent.slice(end)}`;
}

export function fitOllamaChatMessages(messages, { maxInputTokens = resolveOllamaMaxInputTokens() } = {}) {
  if (!Array.isArray(messages) || messages.length < 2) {
    return messages;
  }

  const fitted = messages.map((message) => ({
    role: message.role,
    content: String(message.content || ""),
  }));
  const systemMessage = fitted[0];
  const userMessage = fitted.at(-1);
  let history = fitted.slice(1, -1);

  const measure = () =>
    estimateOllamaMessageTokens(systemMessage) +
    estimateOllamaMessageTokens(userMessage) +
    history.reduce((sum, entry) => sum + estimateOllamaMessageTokens(entry), 0);

  let totalTokens = measure();
  if (totalTokens <= maxInputTokens) {
    return fitted;
  }

  while (history.length > 0 && totalTokens > maxInputTokens) {
    totalTokens -= estimateOllamaMessageTokens(history.shift());
  }

  if (totalTokens > maxInputTokens) {
    const charsToRemove = Math.ceil((totalTokens - maxInputTokens) * OLLAMA_CHARS_PER_TOKEN);
    const shortenedSystem = shrinkRagSection(systemMessage.content, charsToRemove);
    if (shortenedSystem !== systemMessage.content) {
      totalTokens -= estimateOllamaTextTokens(systemMessage.content) - estimateOllamaTextTokens(shortenedSystem);
      systemMessage.content = shortenedSystem;
    }
  }

  while (totalTokens > maxInputTokens && history.length > 0) {
    const entry = history[0];
    const entryTokens = estimateOllamaMessageTokens(entry);
    const charsToRemove = Math.ceil((totalTokens - maxInputTokens) * OLLAMA_CHARS_PER_TOKEN);
    const targetLength = Math.max(80, entry.content.length - charsToRemove);
    if (targetLength < entry.content.length) {
      entry.content = `${entry.content.slice(0, targetLength).trimEnd()}…`;
      totalTokens = measure();
    } else {
      totalTokens -= entryTokens;
      history.shift();
    }
  }

  return [systemMessage, ...history, userMessage];
}

export function resolveStudyCoachProvider() {
  const raw = String(process.env.STUDY_COACH_PROVIDER || "").trim().toLowerCase();
  if (raw === "onyx") {
    return "onyx";
  }
  if (raw === "ollama" || raw === "local") {
    return raw;
  }
  if (raw === "hybrid") {
    return "hybrid";
  }
  if (raw === "openai") {
    return isOpenAiDisabled() ? "onyx" : "openai";
  }
  if (isOpenAiDisabled()) {
    return "onyx";
  }
  return "openai";
}

export function resolveOllamaEndpoint({ useCloud = isStudyCoachOllamaCloudEnabled() } = {}) {
  return resolveOllamaChatEndpoint({ useCloud });
}

export function usesOpenAiResponseSession(provider = resolveStudyCoachProvider()) {
  return provider === "openai" || provider === "hybrid";
}

export function usesOnyxChatSession(provider = resolveStudyCoachProvider()) {
  return provider === "onyx";
}

export function resolveOllamaKeepAlive() {
  return String(
    process.env.STUDY_COACH_OLLAMA_KEEP_ALIVE || process.env.OLLAMA_KEEP_ALIVE || "30m",
  ).trim();
}

export function resolveOllamaMaxHistory() {
  const configured = Number(process.env.STUDY_COACH_OLLAMA_MAX_HISTORY);
  return Number.isFinite(configured) && configured >= 0 ? configured : 4;
}

export function resolveOllamaMaxOutputTokens() {
  const configured = Number(
    process.env.STUDY_COACH_OLLAMA_MAX_OUTPUT_TOKENS || process.env.STUDY_COACH_MAX_OUTPUT_TOKENS || 256,
  );
  return Number.isFinite(configured) && configured > 0 ? configured : 256;
}

export function resolveOllamaStreamingEnabled() {
  const raw = String(process.env.STUDY_COACH_OLLAMA_STREAM || "true").trim().toLowerCase();
  return raw !== "false" && raw !== "0";
}

export function resolveOllamaSkipDiagrams() {
  const raw = String(process.env.STUDY_COACH_OLLAMA_SKIP_DIAGRAMS || "true").trim().toLowerCase();
  return raw !== "false" && raw !== "0";
}

export function isStudyCoachStreamingAvailable(provider = resolveStudyCoachProvider()) {
  if (provider === "onyx") {
    return resolveOnyxStreamingEnabled();
  }
  return (provider === "ollama" || provider === "local" || provider === "hybrid") && resolveOllamaStreamingEnabled();
}

function resolveOnyxStudentTopic(context, message) {
  return detectTopicMention(message, {
    yearLevel: context.yearLevel,
    subject: context.subject,
    focus: context.focus,
    selectedTopicKeys: context.selectedTopicKeys,
    selectedSubtopics: context.selectedSubtopics,
    learningIntentions: context.learningIntentions,
    curriculumSummary: context.curriculumSummary,
  });
}

export function shouldSkipDiagramsForCoachSource(source) {
  if (source === "onyx") {
    return true;
  }
  if (!resolveOllamaSkipDiagrams()) {
    return false;
  }
  return (
    source === "ollama" ||
    source === "local" ||
    source === "hybrid" ||
    source === "ollama_cloud" ||
    source === "onyx"
  );
}

export function buildStudyCoachChatMessages({
  context,
  history,
  message,
  ragContext = "",
  useOllamaPrompt = false,
}) {
  const studentTopic = detectTopicMention(message, {
    yearLevel: context.yearLevel,
    subject: context.subject,
    focus: context.focus,
    selectedTopicKeys: context.selectedTopicKeys,
    selectedSubtopics: context.selectedSubtopics,
    learningIntentions: context.learningIntentions,
    curriculumSummary: context.curriculumSummary,
  });

  const buildPrompt = useOllamaPrompt ? buildStudyCoachOllamaSystemPrompt : buildStudyCoachSystemPrompt;

  return [
    { role: "system", content: buildPrompt(context, { studentTopic, ragContext }) },
    ...history
      .map((entry) => ({
        role: entry.role === "assistant" ? "assistant" : "user",
        content: String(entry.content || "").trim(),
      }))
      .filter((entry) => entry.content),
    { role: "user", content: String(message || "").trim() },
  ];
}

function extractChatCompletionText(payload) {
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content === "string" && content.trim()) {
    return content.trim();
  }
  throw new Error("Study Coach returned an empty response.");
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

function buildOllamaChatBody({ messages, stream = false, useCloud = false }) {
  const maxTokens = resolveOllamaMaxOutputTokens();
  const body = {
    model: resolveOllamaModel({ useCloud }),
    messages,
    temperature: 0.65,
    max_tokens: maxTokens,
    response_format: { type: "json_object" },
    stream,
  };

  if (!useCloud) {
    body.keep_alive = resolveOllamaKeepAlive();
    body.options = {
      num_predict: maxTokens,
      num_ctx: resolveOllamaNumCtx(),
    };
  }

  return body;
}

async function fetchOllamaChatCompletion(body, { fetchImpl = fetch, useCloud = false } = {}) {
  const endpoint = resolveOllamaEndpoint({ useCloud });
  const timeoutMs = Number(process.env.STUDY_COACH_OLLAMA_TIMEOUT_MS || DEFAULT_OLLAMA_TIMEOUT_MS);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(endpoint, {
      method: "POST",
      headers: buildOllamaRequestHeaders({ useCloud }),
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Ollama request failed (${response.status}): ${errorText.slice(0, 200)}`);
    }

    return response.json();
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error("Ollama request timed out.");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function streamOllamaStudyCoachOnce(
  { context, history, message },
  { fetchImpl = fetch, ragContext: preloadedRagContext, forceRag = false, onToken, useCloud = false } = {},
) {
  let ragContext = preloadedRagContext;
  if (ragContext === undefined) {
    ({ promptSection: ragContext } = await retrieveStudyCoachRagContext(
      { context, message },
      { fetchImpl, forceRag, forOllama: true },
    ));
  }

  const trimmedHistory = Array.isArray(history) ? history.slice(-resolveOllamaMaxHistory()) : [];
  const messages = fitOllamaChatMessages(
    buildStudyCoachChatMessages({
      context,
      history: trimmedHistory,
      message,
      ragContext,
      useOllamaPrompt: true,
    }),
  );
  const body = buildOllamaChatBody({ messages, stream: true, useCloud });

  const endpoint = resolveOllamaEndpoint({ useCloud });
  const timeoutMs = Number(process.env.STUDY_COACH_OLLAMA_TIMEOUT_MS || DEFAULT_OLLAMA_TIMEOUT_MS);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let rawReply = "";
  try {
    const response = await fetchImpl(endpoint, {
      method: "POST",
      headers: buildOllamaRequestHeaders({ useCloud }),
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Ollama request failed (${response.status}): ${errorText.slice(0, 200)}`);
    }

    for await (const delta of readOllamaChatCompletionStream(response)) {
      rawReply += delta;
      onToken?.(delta, rawReply);
    }
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error("Ollama request timed out.");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }

  if (!rawReply.trim()) {
    throw new Error("Study Coach returned an empty response.");
  }

  return {
    rawReply: rawReply.trim(),
    responseId: null,
    ollamaTarget: useCloud ? "cloud" : "local",
  };
}

export async function streamOllamaStudyCoach(params, options = {}) {
  const { useCloud } = options;
  if (useCloud === true) {
    return streamOllamaStudyCoachOnce(params, { ...options, useCloud: true });
  }
  if (useCloud === false) {
    return streamOllamaStudyCoachOnce(params, { ...options, useCloud: false });
  }

  if (isStudyCoachOllamaCloudEnabled()) {
    try {
      return await streamOllamaStudyCoachOnce(params, { ...options, useCloud: true });
    } catch {
      return streamOllamaStudyCoachOnce(params, { ...options, useCloud: false });
    }
  }

  return streamOllamaStudyCoachOnce(params, { ...options, useCloud: false });
}

async function callOllamaStudyCoachOnce(
  { context, history, message },
  { fetchImpl = fetch, ragContext: preloadedRagContext, forceRag = false, useCloud = false } = {},
) {
  let ragContext = preloadedRagContext;
  if (ragContext === undefined) {
    ({ promptSection: ragContext } = await retrieveStudyCoachRagContext(
      { context, message },
      { fetchImpl, forceRag, forOllama: true },
    ));
  }

  const trimmedHistory = Array.isArray(history)
    ? history.slice(-resolveOllamaMaxHistory())
    : [];

  const messages = fitOllamaChatMessages(
    buildStudyCoachChatMessages({
      context,
      history: trimmedHistory,
      message,
      ragContext,
      useOllamaPrompt: true,
    }),
  );
  const body = buildOllamaChatBody({ messages, stream: false, useCloud });

  const payload = await fetchOllamaChatCompletion(body, { fetchImpl, useCloud });
  return {
    rawReply: extractChatCompletionText(payload),
    responseId: null,
    ollamaTarget: useCloud ? "cloud" : "local",
  };
}

export async function callOllamaStudyCoach(params, options = {}) {
  const { useCloud } = options;
  if (useCloud === true) {
    return callOllamaStudyCoachOnce(params, { ...options, useCloud: true });
  }
  if (useCloud === false) {
    return callOllamaStudyCoachOnce(params, { ...options, useCloud: false });
  }

  if (isStudyCoachOllamaCloudEnabled()) {
    try {
      return await callOllamaStudyCoachOnce(params, { ...options, useCloud: true });
    } catch {
      return callOllamaStudyCoachOnce(params, { ...options, useCloud: false });
    }
  }

  return callOllamaStudyCoachOnce(params, { ...options, useCloud: false });
}

function resolveOllamaCoachSource(provider, ollamaTarget) {
  if (ollamaTarget === "cloud") {
    return "ollama_cloud";
  }
  if (provider === "local") {
    return "local";
  }
  return "ollama";
}

export { resolveOllamaCoachSource };

export async function callOpenAiStudyCoach(
  { context, history, message, previousResponseId = null },
  { ragContext: preloadedRagContext, forceRag = false } = {},
) {
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

  let ragContext = preloadedRagContext;
  if (ragContext === undefined) {
    ({ promptSection: ragContext } = await retrieveStudyCoachRagContext({ context, message }, { forceRag }));
  }

  const body = {
    model: process.env.STUDY_COACH_MODEL || process.env.OPENAI_MODEL || "gpt-4o-mini",
    temperature: 0.65,
    max_output_tokens: Number(process.env.STUDY_COACH_MAX_OUTPUT_TOKENS || 750),
  };

  if (previousResponseId) {
    body.previous_response_id = previousResponseId;
    body.input = String(message).trim();
  } else {
    body.instructions = buildStudyCoachSystemPrompt(context, { studentTopic, ragContext });
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

export async function streamOnyxStudyCoach(
  { context, message, previousResponseId = null },
  { fetchImpl = fetch, onToken } = {},
) {
  const studentTopic = resolveOnyxStudentTopic(context, message);
  const result = await callOnyxStudyCoach(
    { context, message, previousResponseId, studentTopic },
    { fetchImpl, onToken },
  );
  return { ...result, source: "onyx" };
}

export async function callStudyCoachLlm(
  { context, history, message, previousResponseId = null },
  { fetchImpl = fetch, ragContext, forceRag = false, onToken } = {},
) {
  const provider = resolveStudyCoachProvider();
  const llmOptions = { fetchImpl, ragContext, forceRag };

  if (provider === "onyx") {
    const studentTopic = resolveOnyxStudentTopic(context, message);
    const result = await callOnyxStudyCoach(
      { context, message, previousResponseId, studentTopic },
      { fetchImpl, onToken },
    );
    return { ...result, source: "onyx" };
  }

  if (provider === "ollama" || provider === "local") {
    const result = await callOllamaStudyCoach({ context, history, message }, llmOptions);
    return { ...result, source: resolveOllamaCoachSource(provider, result.ollamaTarget) };
  }

  if (provider === "openai") {
    const result = await callOpenAiStudyCoach({ context, history, message, previousResponseId }, llmOptions);
    if (!result) {
      return null;
    }
    return { ...result, source: "openai" };
  }

  try {
    const result = await callOllamaStudyCoach({ context, history, message }, llmOptions);
    return { ...result, source: resolveOllamaCoachSource("ollama", result.ollamaTarget) };
  } catch (error) {
    if (isOpenAiDisabled()) {
      throw error;
    }
    const result = await callOpenAiStudyCoach({ context, history, message, previousResponseId }, llmOptions);
    if (!result) {
      throw error;
    }
    return { ...result, source: "hybrid_openai" };
  }
}
