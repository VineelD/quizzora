"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { detectActiveUserSwitch, resetUserScopedClientState } from "../lib/client-user-scope.js";
import { formatMicVocabHint, parseFocusLabel } from "../lib/curriculum-topics.js";
import { SPOKEN_MATH_PLACEHOLDER } from "../lib/spoken-math.js";
import { buildTopicVocabulary, normalizeSpokenTranscript } from "../lib/spoken-topic-vocab.js";
import { getComposeVocabularySuggestions } from "../lib/topic-vocab-suggest.js";
import { studySpeechInputEnabled } from "../lib/study-speech-input-config.js";
import StudyCoachMarkdown from "./StudyCoachMarkdown.jsx";
import StudyCoachMessage from "./StudyCoachMessage.jsx";
import { useSituationalNarration } from "./useSituationalNarration.js";
import { refineTranscriptViaApi, useStudySpeechInput } from "./useStudySpeechInput.js";
import { studyClientNarrationEnabled } from "../lib/study-narration-config.js";

const STUDY_SEND_TIMEOUT_MS = 90000;

const STARTER_PROMPTS = [
  "Show me how the main concepts apply in practice",
  "Show me a concept visual for this topic",
  "Quiz me with a quick check-for-understanding",
  "Give me a worked example on a similar problem",
  "What vocabulary should I know before the quiz?",
  "Let's apply this concept — where do we start?",
];

function formatDuration(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

export default function StudentStudyCoach({
  assignmentId,
  learningIntentions = [],
  onUnlocked,
  onStudyFileSaved,
  quizSubmitted = false,
}) {
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [messages, setMessages] = useState([]);
  const [progress, setProgress] = useState(null);
  const [context, setContext] = useState(null);
  const [followUps, setFollowUps] = useState(STARTER_PROMPTS.slice(0, 4));
  const [conversationSaved, setConversationSaved] = useState(false);
  const [streamingEnabled, setStreamingEnabled] = useState(false);
  const [mathInputMode, setMathInputMode] = useState(false);
  const [speechCorrection, setSpeechCorrection] = useState(null);
  const [assignmentVocabExpanded, setAssignmentVocabExpanded] = useState(false);
  const [mlVocabTerms, setMlVocabTerms] = useState([]);
  const [mlVocabLoading, setMlVocabLoading] = useState(false);
  const mlVocabRequestRef = useRef("");
  const transcriptRef = useRef(null);
  const composeRef = useRef(null);
  const messageInputRef = useRef(null);
  const lastSentMessageRef = useRef("");
  const speechBaseRef = useRef("");
  const speechFinalRef = useRef("");
  const speechCorrectionTimerRef = useRef(null);
  const speechRefineTimerRef = useRef(null);
  const speechRefineAbortRef = useRef(null);
  const speechRefineRequestRef = useRef("");
  const speechRefineResultRef = useRef("");
  const speechInputFeatureEnabled = studySpeechInputEnabled();

  const topicVocab = useMemo(
    () =>
      buildTopicVocabulary({
        focus: context?.focus,
        subject: context?.subject,
        yearLevel: context?.yearLevel,
        curriculumSummary: context?.curriculumSummary,
        learningIntentions: learningIntentions.length ? learningIntentions : context?.learningIntentions || [],
        selectedTopicKeys: context?.selectedTopicKeys,
        selectedSubtopics: context?.selectedSubtopics,
      }),
    [context, learningIntentions],
  );

  const micVocabHint = useMemo(
    () =>
      formatMicVocabHint({
        subject: context?.subject,
        selectedSubtopics: context?.selectedSubtopics,
        selectedTopicKeys: context?.selectedTopicKeys,
        focus: context?.focus,
      }),
    [context],
  );

  const assignmentContext = useMemo(
    () => ({
      yearLevel: context?.yearLevel,
      subject: context?.subject,
      focus: context?.focus,
      selectedTopicKeys: context?.selectedTopicKeys,
      selectedSubtopics: context?.selectedSubtopics,
      learningIntentions: learningIntentions.length ? learningIntentions : context?.learningIntentions || [],
      curriculumSummary: context?.curriculumSummary,
    }),
    [context, learningIntentions],
  );

  const composeVocabSuggestions = useMemo(
    () => getComposeVocabularySuggestions(message, assignmentContext),
    [assignmentContext, message],
  );

  useEffect(() => {
    if (composeVocabSuggestions.mode !== "topic") {
      setMlVocabTerms([]);
      setMlVocabLoading(false);
      mlVocabRequestRef.current = "";
      return;
    }

    const topicKey = composeVocabSuggestions.mention?.topicKey || composeVocabSuggestions.label;
    const requestKey = `${assignmentId}:${topicKey}:${composeVocabSuggestions.label}`;
    if (mlVocabRequestRef.current === requestKey) {
      return;
    }
    mlVocabRequestRef.current = requestKey;

    const controller = new AbortController();
    setMlVocabLoading(true);

    const params = new URLSearchParams({
      assignmentId: String(assignmentId),
      topic: composeVocabSuggestions.label,
      text: message.trim() || composeVocabSuggestions.label,
    });

    fetch(`/api/student/study/vocab-suggest?${params.toString()}`, {
      credentials: "include",
      signal: controller.signal,
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (!payload || mlVocabRequestRef.current !== requestKey) {
          return;
        }
        setMlVocabTerms(Array.isArray(payload.terms) ? payload.terms : []);
      })
      .catch((error) => {
        if (error?.name !== "AbortError") {
          setMlVocabTerms([]);
        }
      })
      .finally(() => {
        if (mlVocabRequestRef.current === requestKey) {
          setMlVocabLoading(false);
        }
      });

    return () => controller.abort();
  }, [
    assignmentId,
    composeVocabSuggestions.label,
    composeVocabSuggestions.mode,
    composeVocabSuggestions.mention?.topicKey,
    message,
  ]);

  const mergedVocabTerms = useMemo(() => {
    if (composeVocabSuggestions.mode !== "topic" || !mlVocabTerms.length) {
      return composeVocabSuggestions.terms;
    }
    const seen = new Set();
    const merged = [];
    for (const term of [...composeVocabSuggestions.terms, ...mlVocabTerms]) {
      const key = String(term || "")
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      if (!key || seen.has(key)) {
        continue;
      }
      seen.add(key);
      merged.push(term);
    }
    return merged.slice(0, 20);
  }, [composeVocabSuggestions.mode, composeVocabSuggestions.terms, mlVocabTerms]);

  const visibleVocabTerms = useMemo(() => {
    if (composeVocabSuggestions.mode === "topic") {
      return mergedVocabTerms;
    }
    if (assignmentVocabExpanded) {
      return composeVocabSuggestions.terms;
    }
    return composeVocabSuggestions.terms.slice(0, composeVocabSuggestions.previewCount || 6);
  }, [assignmentVocabExpanded, composeVocabSuggestions, mergedVocabTerms]);

  useEffect(() => {
    if (composeVocabSuggestions.mode === "topic") {
      setAssignmentVocabExpanded(false);
    }
  }, [composeVocabSuggestions.mode, composeVocabSuggestions.label]);

  const handleSpeechCorrection = useCallback((correction) => {
    if (!correction?.heard || !correction?.corrected) {
      return;
    }
    setSpeechCorrection(correction);
    if (speechCorrectionTimerRef.current) {
      window.clearTimeout(speechCorrectionTimerRef.current);
    }
    speechCorrectionTimerRef.current = window.setTimeout(() => setSpeechCorrection(null), 4000);
  }, []);

  const handleSpeechTranscript = useCallback(({ final, interim }) => {
    if (final) {
      speechFinalRef.current = [speechFinalRef.current, final].filter(Boolean).join(" ").trim();
    }
    const parts = [speechBaseRef.current, speechFinalRef.current, interim || ""].filter(Boolean);
    setMessage(parts.join(" ").trim());
  }, []);

  const {
    error: speechError,
    listening,
    stopListening,
    supported: speechSupported,
    toggleListening,
  } = useStudySpeechInput({
    disabled: sending || !speechInputFeatureEnabled,
    mathMode: mathInputMode,
    onCorrection: handleSpeechCorrection,
    onTranscript: handleSpeechTranscript,
    topicVocab,
  });
  const coachMessageCount = messages.filter((entry) => entry.role === "assistant").length;
  const situationalNarration = useSituationalNarration({
    assignmentId,
    clientNarrationEnabled: studyClientNarrationEnabled(),
    coachMessageCount,
    scrollContainerRef: transcriptRef,
  });

  async function loadSession() {
    setLoading(true);
    setError("");

    const meResponse = await fetch("/api/me", { credentials: "include" });
    let mePayload = { user: null };
    if (meResponse.ok) {
      mePayload = await meResponse.json();
    }
    if (detectActiveUserSwitch(mePayload.user?.id ?? null)) {
      resetUserScopedClientState();
      setMessages([]);
      setProgress(null);
      setContext(null);
      setFollowUps(STARTER_PROMPTS.slice(0, 4));
      setConversationSaved(false);
    }

    const response = await fetch(`/api/student/study?assignmentId=${assignmentId}`, { credentials: "include" });
    const payload = await response.json();
    setLoading(false);

    if (!response.ok) {
      setError(payload.error || "Could not load Study Coach.");
      return;
    }

    setMessages(payload.messages || []);
    setProgress(payload.progress || null);
    setContext(payload.context || null);
    setConversationSaved(Boolean(payload.openAiResponseId) || (payload.messages || []).length > 1);
    setStreamingEnabled(Boolean(payload.streamingEnabled));
    if (payload.progress?.unlocked) {
      onUnlocked?.();
    }
  }

  useEffect(() => {
    loadSession();
  }, [assignmentId]);

  useEffect(
    () => () => {
      if (speechCorrectionTimerRef.current) {
        window.clearTimeout(speechCorrectionTimerRef.current);
      }
      if (speechRefineTimerRef.current) {
        window.clearTimeout(speechRefineTimerRef.current);
      }
      speechRefineAbortRef.current?.abort();
    },
    [],
  );

  useEffect(() => {
    if (!mathInputMode || !listening) {
      return undefined;
    }

    const trimmed = message.trim();
    if (!trimmed || trimmed === speechRefineResultRef.current) {
      return undefined;
    }

    if (speechRefineTimerRef.current) {
      window.clearTimeout(speechRefineTimerRef.current);
    }

    speechRefineTimerRef.current = window.setTimeout(async () => {
      if (!trimmed || trimmed === speechRefineRequestRef.current) {
        return;
      }

      speechRefineRequestRef.current = trimmed;
      speechRefineAbortRef.current?.abort();
      const controller = new AbortController();
      speechRefineAbortRef.current = controller;

      try {
        const payload = await refineTranscriptViaApi({
          text: trimmed,
          mathMode: true,
          assignmentId,
          topicVocab,
          signal: controller.signal,
        });

        if (controller.signal.aborted) {
          return;
        }

        speechRefineResultRef.current = payload.text || trimmed;
        if (payload.text && payload.text !== trimmed) {
          setMessage(payload.text);
        }

        const latest = payload.corrections?.[payload.corrections.length - 1];
        if (latest?.from && latest?.to) {
          handleSpeechCorrection({ heard: latest.from, corrected: latest.to });
        }
      } catch {
        const fallback = normalizeSpokenTranscript(trimmed, { mathMode: true, topicVocab });
        speechRefineResultRef.current = fallback.text;
        if (fallback.text !== trimmed) {
          setMessage(fallback.text);
        }
        const latest = fallback.corrections?.[fallback.corrections.length - 1];
        if (latest?.heard && latest?.corrected) {
          handleSpeechCorrection(latest);
        }
      }
    }, 500);

    return () => {
      if (speechRefineTimerRef.current) {
        window.clearTimeout(speechRefineTimerRef.current);
      }
    };
  }, [assignmentId, handleSpeechCorrection, listening, mathInputMode, message, topicVocab]);

  useEffect(() => {
    if (transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
    }
  }, [messages, sending]);

  async function consumeStudyStream(response, onPreview) {
    if (!response.ok) {
      let payload = {};
      try {
        payload = await response.json();
      } catch {
        // ignore
      }
      throw new Error(payload.error || "Could not send message.");
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error("Study Coach returned an unexpected response. Please try again.");
    }

    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split("\n\n");
      buffer = events.pop() || "";

      for (const event of events) {
        const line = event.split("\n").find((entry) => entry.startsWith("data:"));
        if (!line) {
          continue;
        }

        let payload;
        try {
          payload = JSON.parse(line.slice(5).trim());
        } catch {
          continue;
        }

        if (payload.type === "token" && payload.preview) {
          onPreview(payload.preview);
        } else if (payload.type === "done") {
          return payload;
        } else if (payload.type === "error") {
          throw new Error(payload.error || "Could not send message.");
        }
      }
    }

    throw new Error("Study Coach stream ended unexpectedly.");
  }

  async function sendMessage(text) {
    const trimmed = String(text || message).trim();
    if (!trimmed || sending) {
      return;
    }

    stopListening();
    setSending(true);
    setError("");
    setMessage("");
    lastSentMessageRef.current = trimmed;

    const optimisticId = `pending-${Date.now()}`;
    const streamingId = `streaming-${Date.now()}`;
    setMessages((current) => [
      ...current,
      { id: optimisticId, role: "student", content: trimmed, onTopic: null, flagged: false },
    ]);

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), STUDY_SEND_TIMEOUT_MS);

    try {
      if (streamingEnabled) {
        setMessages((current) => [
          ...current,
          { id: streamingId, role: "assistant", content: "", streaming: true, onTopic: null, flagged: false },
        ]);

        const response = await fetch("/api/student/study/stream", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ assignmentId, message: trimmed }),
          signal: controller.signal,
        });

        const payload = await consumeStudyStream(response, (preview) => {
          setMessages((current) =>
            current.map((entry) =>
              entry.id === streamingId ? { ...entry, content: preview || entry.content } : entry,
            ),
          );
        });

        setMessages(payload.messages || []);
        setProgress(payload.progress || null);
        setConversationSaved(Boolean(payload.openAiResponseId) || (payload.messages || []).length > 1);
        if (payload.followUps?.length) {
          setFollowUps(payload.followUps);
        }
        if (payload.progress?.unlocked) {
          onUnlocked?.();
        }
        return;
      }

      const response = await fetch("/api/student/study", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignmentId, message: trimmed }),
        signal: controller.signal,
      });

      let payload = {};
      try {
        payload = await response.json();
      } catch {
        throw new Error("Study Coach returned an unexpected response. Please try again.");
      }

      if (!response.ok) {
        setMessages((current) => current.filter((entry) => entry.id !== optimisticId));
        setError(payload.error || "Could not send message.");
        return;
      }

      setMessages(payload.messages || []);
      setProgress(payload.progress || null);
      setConversationSaved(Boolean(payload.openAiResponseId) || (payload.messages || []).length > 1);
      if (payload.followUps?.length) {
        setFollowUps(payload.followUps);
      }
      if (payload.progress?.unlocked) {
        onUnlocked?.();
      }
    } catch (sendError) {
      setMessages((current) =>
        current.filter((entry) => entry.id !== optimisticId && entry.id !== streamingId),
      );
      if (sendError?.name === "AbortError") {
        setError("Study Coach is taking longer than usual. Try a shorter prompt or tap one of the suggested buttons.");
      } else {
        setError(sendError?.message || "Could not send message.");
      }
    } finally {
      window.clearTimeout(timeout);
      setSending(false);
    }
  }

  if (loading) {
    return (
      <section className="panel study-coach-panel">
        <p className="muted">Loading Study Coach...</p>
      </section>
    );
  }

  const promptOptions = followUps.length ? followUps : STARTER_PROMPTS.slice(0, 4);
  const latestAssistantId = [...messages].reverse().find((entry) => entry.role === "assistant")?.id;
  const showUnlockMeter = progress && !quizSubmitted;
  const focusPath = parseFocusLabel(context?.focus || "");
  const micDisabled = sending || !speechSupported;
  const micTooltip = !speechSupported
    ? "Voice input is not supported in this browser. Try Chrome or Edge, or type your message."
    : listening
      ? "Stop listening"
      : micVocabHint;

  function insertVocabTerm(term) {
    const textarea = messageInputRef.current;
    const cleanTerm = String(term || "").trim();
    if (!cleanTerm) {
      return;
    }

    if (!textarea) {
      setMessage((current) => {
        const trimmed = current.trim();
        return trimmed ? `${trimmed} ${cleanTerm}` : cleanTerm;
      });
      return;
    }

    const start = textarea.selectionStart ?? message.length;
    const end = textarea.selectionEnd ?? message.length;
    const before = message.slice(0, start);
    const after = message.slice(end);
    const needsLeadingSpace = before.length > 0 && !/\s$/.test(before);
    const needsTrailingSpace = after.length > 0 && !/^\s/.test(after);
    const insertion = `${needsLeadingSpace ? " " : ""}${cleanTerm}${needsTrailingSpace ? " " : ""}`;
    const nextValue = `${before}${insertion}${after}`;

    setMessage(nextValue);
    requestAnimationFrame(() => {
      textarea.focus();
      const cursor = before.length + insertion.length;
      textarea.setSelectionRange(cursor, cursor);
    });
  }

  function handleMicToggle() {
    if (listening) {
      stopListening();
      if (mathInputMode || topicVocab.length) {
        setMessage((current) => normalizeSpokenTranscript(current, { mathMode: mathInputMode, topicVocab }).text);
      }
      return;
    }

    speechBaseRef.current = message.trim();
    speechFinalRef.current = "";
    speechRefineRequestRef.current = "";
    speechRefineResultRef.current = "";
    toggleListening();
  }

  return (
    <section className="panel study-coach-panel">
      <div className="study-coach-layout">
        <aside className="study-coach-sidebar">
          <div className="study-coach-header">
            <div>
              <p className="eyebrow">Study Coach</p>
              <h2 className="section-title">{quizSubmitted ? "Continue applying these concepts" : "Concept-based study before the quiz"}</h2>
            </div>
            {conversationSaved ? (
              <span className="tag study-saved-tag" title="Your chat is saved on this device account and resumes where you left off.">
                Saved
              </span>
            ) : null}
          </div>

          <p className="study-trust-strip" role="note">
            Tied to your assignment · Australian curriculum · Stays on topic
          </p>

          {context ? (
            <nav aria-label="Assignment topic" className="study-topic-trail">
              <span className="study-topic-trail-item">{context.yearLevel}</span>
              <span className="study-topic-trail-sep" aria-hidden="true">›</span>
              <span className="study-topic-trail-item">{context.subject}</span>
              {focusPath.stream ? (
                <>
                  <span className="study-topic-trail-sep" aria-hidden="true">›</span>
                  <span className="study-topic-trail-item">{focusPath.stream}</span>
                </>
              ) : null}
              {focusPath.topic ? (
                <>
                  <span className="study-topic-trail-sep" aria-hidden="true">›</span>
                  <span className="study-topic-trail-item">{focusPath.topic}</span>
                </>
              ) : null}
              {focusPath.subtopic ? (
                <>
                  <span className="study-topic-trail-sep" aria-hidden="true">›</span>
                  <span className="study-topic-trail-item study-topic-trail-focus">{focusPath.subtopic}</span>
                </>
              ) : null}
            </nav>
          ) : null}

          <p className="study-coach-note">
            {quizSubmitted ? (
              <>
                Your quiz is submitted. Keep chatting about <strong>{context?.focus}</strong> — your session resumes
                where you left off.
              </>
            ) : (
              <>
                Chat about <strong>{context?.focus}</strong>. Stay on-topic for about{" "}
                {progress ? Math.ceil(progress.minQualifiedStudySeconds / 60) : 30} minutes to unlock the quiz.
              </>
            )}
          </p>

          {learningIntentions.length ? (
            <div className="study-sidebar-block">
              <p className="study-starters-label">Learning intentions</p>
              <ul className="study-intentions">
                {learningIntentions.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {showUnlockMeter ? (
            <div className="study-unlock-meter" aria-live="polite">
              <div className="row" style={{ justifyContent: "space-between" }}>
                <strong>{progress.unlocked ? "Quiz unlocked" : "Topic-focused study time"}</strong>
                <span className="muted">
                  {formatDuration(progress.qualifiedStudySeconds)} / {formatDuration(progress.minQualifiedStudySeconds)}
                </span>
              </div>
              <div
                className="study-progress-bar"
                role="progressbar"
                aria-valuenow={progress.percentComplete}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <span className="study-progress-fill" style={{ width: `${progress.percentComplete}%` }} />
              </div>
              {!progress.unlocked ? (
                <p className="muted study-unlock-hint">
                  Only on-topic study chat counts toward unlock time. Stay focused on {context?.focus}.
                </p>
              ) : (
                <p className="muted study-unlock-hint">You can now open the Quiz tab and submit your answers.</p>
              )}
            </div>
          ) : null}

          <div className="study-starters study-sidebar-block">
            <p className="study-starters-label">Try asking</p>
            <div className="study-starters-list">
              {promptOptions.map((prompt) => (
                <button
                  className="button secondary"
                  key={prompt}
                  onClick={() => sendMessage(prompt)}
                  type="button"
                  disabled={sending}
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        </aside>

        <div className="study-coach-main">
          <div className="study-transcript" ref={transcriptRef}>
        {messages.map((entry) => (
          <article
            className={`study-message study-message-${entry.role}${entry.flagged ? " study-message-flagged" : ""}${entry.onTopic === false ? " study-message-off-topic" : ""}`}
            key={entry.id}
          >
            <p className="study-message-label">
              {entry.role === "assistant"
                ? "Study Coach"
                : entry.role === "student"
                  ? "You"
                  : "Guide"}
            </p>
            {entry.role === "student" && entry.onTopic === false ? (
              <p className="study-scope-note">I focus on this assignment&apos;s topics — try asking about {context?.focus || "your lesson"}.</p>
            ) : null}
            {entry.role === "assistant" ? (
              entry.streaming ? (
                <StudyCoachMarkdown className="study-markdown study-stream-preview">
                  {entry.content || "…"}
                </StudyCoachMarkdown>
              ) : (
                <StudyCoachMessage
                  assignmentId={assignmentId}
                  entry={entry}
                  focus={context?.focus}
                  interactive={entry.id === latestAssistantId}
                  onStudyFileSaved={onStudyFileSaved}
                  situationalNarration={entry.id === latestAssistantId ? situationalNarration : null}
                  subject={context?.subject || "Science"}
                  yearLevel={context?.yearLevel || ""}
                />
              )
            ) : (
              <StudyCoachMarkdown className="study-markdown study-user-message">{entry.content}</StudyCoachMarkdown>
            )}
          </article>
        ))}
        {sending && !messages.some((entry) => entry.streaming) ? (
          <div className="study-typing" aria-live="polite">
            <span className="study-typing-dot" />
            <span className="study-typing-dot" />
            <span className="study-typing-dot" />
            <span className="muted">
              Study Coach is preparing your explanation
              {/\b(diagram|visual|flash|concept)\b/i.test(lastSentMessageRef.current) ? " and concept visual" : ""}...
            </span>
          </div>
        ) : null}
          </div>

          <form
            className="study-compose"
            ref={composeRef}
            onSubmit={(event) => {
              event.preventDefault();
              sendMessage(message);
            }}
          >
            <div className="field">
              <label htmlFor="study-message">Continue the conversation</label>
              <textarea
                id="study-message"
                onChange={(event) => setMessage(event.target.value)}
                placeholder={
                  mathInputMode
                    ? SPOKEN_MATH_PLACEHOLDER
                    : "Ask for an application example, a concept visual, or try a mini challenge..."
                }
                ref={messageInputRef}
                rows={3}
                value={message}
              />
            </div>
            {visibleVocabTerms.length || mlVocabLoading ? (
              <div className="study-vocab-suggestions" aria-live="polite">
                <div className="study-vocab-suggestions-header">
                  <p className="study-vocab-suggestions-label">
                    {composeVocabSuggestions.mode === "topic"
                      ? `Suggestions for ${composeVocabSuggestions.label}`
                      : composeVocabSuggestions.label}
                    {mlVocabLoading ? (
                      <span className="muted study-vocab-ml-loading"> · Finding related terms…</span>
                    ) : null}
                  </p>
                  {composeVocabSuggestions.mode === "assignment" &&
                  composeVocabSuggestions.terms.length > visibleVocabTerms.length ? (
                    <button
                      type="button"
                      className="study-vocab-toggle"
                      onClick={() => setAssignmentVocabExpanded((current) => !current)}
                      aria-expanded={assignmentVocabExpanded}
                    >
                      {assignmentVocabExpanded ? "Show less" : `Show ${composeVocabSuggestions.terms.length - visibleVocabTerms.length} more`}
                    </button>
                  ) : null}
                </div>
                <div className="study-vocab-chip-row" role="list">
                  {visibleVocabTerms.map((term) => (
                    <button
                      key={term}
                      type="button"
                      className="study-vocab-chip"
                      onClick={() => insertVocabTerm(term)}
                      disabled={sending}
                      role="listitem"
                      title={`Insert "${term}"`}
                    >
                      {term}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            {error ? <div className="message error">{error}</div> : null}
            {speechError ? <div className="message error">{speechError}</div> : null}
            {speechInputFeatureEnabled && topicVocab.length ? (
              <p className="muted study-speech-vocab-hint">{micVocabHint}</p>
            ) : null}
            <div className="study-compose-actions">
              {speechInputFeatureEnabled ? (
                <>
                  <button
                    type="button"
                    className={`button secondary study-math-input-toggle${mathInputMode ? " is-active" : ""}`}
                    onClick={() => setMathInputMode((current) => !current)}
                    disabled={sending}
                    aria-label="Math input mode"
                    aria-pressed={mathInputMode}
                    title={
                      mathInputMode
                        ? `Math input on — spoken formulas are converted to readable math. ${micVocabHint}.`
                        : `Turn on Math input to convert spoken formulas (e.g. sine squared theta). ${micVocabHint}.`
                    }
                  >
                    {mathInputMode ? "Math on" : "Math input"}
                  </button>
                  <button
                    type="button"
                    className={`button secondary study-mic-button${listening ? " is-listening" : ""}`}
                    onClick={handleMicToggle}
                    disabled={micDisabled}
                    aria-label="Speak your question"
                    aria-pressed={listening}
                    title={micTooltip}
                  >
                    {listening ? "Listening…" : "Mic"}
                  </button>
                </>
              ) : null}
              <button className="button primary study-send-button" disabled={sending || !message.trim()} type="submit">
                {sending ? "Sending..." : "Send"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </section>
  );
}
