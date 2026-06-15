"use client";

import { useCallback, useEffect, useRef, useState } from "react";

function formatResponseKind(kind) {
  switch (kind) {
    case "json_tutor":
      return "JSON tutor (expected)";
    case "reasoned_prose":
      return "Reasoned prose (wrapped by parser)";
    case "search_dump":
      return "Search dump (needs fix)";
    case "empty":
      return "Empty";
    default:
      return kind || "—";
  }
}

function formatScore(score) {
  if (score == null || !Number.isFinite(score)) {
    return "—";
  }
  return score.toFixed(3);
}

async function readApiJson(response, fallbackMessage) {
  const contentType = String(response.headers.get("content-type") || "").toLowerCase();
  const rawBody = await response.text();
  if (contentType.includes("text/html") || rawBody.trimStart().startsWith("<")) {
    const snippet = rawBody.replace(/\s+/g, " ").trim().slice(0, 160);
    throw new Error(
      `${fallbackMessage} (HTTP ${response.status}) — server returned HTML instead of JSON${snippet ? `: ${snippet}` : ""}`,
    );
  }

  try {
    return rawBody ? JSON.parse(rawBody) : {};
  } catch {
    const snippet = rawBody.replace(/\s+/g, " ").trim().slice(0, 160);
    throw new Error(
      `${fallbackMessage} (HTTP ${response.status}) — invalid JSON response${snippet ? `: ${snippet}` : ""}`,
    );
  }
}

export default function SuperAdminStudyCoachTest() {
  const [focusLabels, setFocusLabels] = useState([]);
  const [focusLabel, setFocusLabel] = useState("");
  const [message, setMessage] = useState("");
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [meta, setMeta] = useState(null);
  const [ragChunks, setRagChunks] = useState([]);
  const chatEndRef = useRef(null);

  const loadOptions = useCallback(async () => {
    const response = await fetch("/api/superadmin/study-coach-test", {
      credentials: "include",
    });
    const payload = await readApiJson(response, "Could not load Study Coach test options.");
    if (!response.ok) {
      throw new Error(payload.error || "Could not load Study Coach test options.");
    }

    const labels = Array.isArray(payload.focusLabels) ? payload.focusLabels : [];
    setFocusLabels(labels);
    setMeta({
      ragGloballyEnabled: payload.ragGloballyEnabled,
      provider: payload.provider,
    });
    setFocusLabel((current) => current || labels[0]?.focusLabel || "");
    setError("");
  }, []);

  useEffect(() => {
    let active = true;

    async function bootstrap() {
      try {
        await loadOptions();
      } catch (loadError) {
        if (active) {
          setError(loadError.message);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    bootstrap();
    return () => {
      active = false;
    };
  }, [loadOptions]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [history, sending]);

  async function sendMessage(event) {
    event.preventDefault();
    const trimmed = message.trim();
    if (!trimmed || !focusLabel || sending) {
      return;
    }

    setSending(true);
    setError("");
    const nextHistory = [...history, { role: "user", content: trimmed }];
    setHistory(nextHistory);
    setMessage("");

    try {
      const response = await fetch("/api/superadmin/study-coach-test", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: trimmed,
          focusLabel,
          history: history.slice(-12),
        }),
      });
      const payload = await readApiJson(response, "Study Coach test request failed.");
      if (!response.ok) {
        throw new Error(payload.error || "Study Coach test request failed.");
      }

      setHistory((current) => [...current, { role: "assistant", content: payload.reply || "" }]);
      setRagChunks(Array.isArray(payload.ragChunks) ? payload.ragChunks : []);
      setMeta((current) => ({
        ...(current || {}),
        source: payload.source,
        provider: payload.provider,
        onTopic: payload.onTopic,
        flagged: payload.flagged,
        responseKind: payload.responseKind,
        onyx: payload.onyx,
      }));
    } catch (sendError) {
      setError(sendError.message);
      setHistory(nextHistory.slice(0, -1));
      setMessage(trimmed);
    } finally {
      setSending(false);
    }
  }

  function clearChat() {
    setHistory([]);
    setRagChunks([]);
    setError("");
  }

  return (
    <section className="panel">
      <p className="eyebrow">Temporary test tool</p>
      <h2>Study Coach RAG test</h2>
      <p className="hero-copy">
        Send Study Coach messages with curriculum vector retrieval forced on for this endpoint. Use this to
        validate embed quality before enabling RAG for students.
      </p>

      {loading ? <p>Loading options…</p> : null}
      {error ? <p className="form-error">{error}</p> : null}

      {meta ? (
        <ul className="meta-list">
          <li>Provider: {meta.provider || "—"}</li>
          <li>Global RAG flag: {meta.ragGloballyEnabled ? "on" : "off"} (forced on here)</li>
          {meta.source ? <li>Last source: {meta.source}</li> : null}
          {meta.onTopic != null ? <li>Last on-topic: {meta.onTopic ? "yes" : "no"}</li> : null}
          {meta.responseKind ? (
            <li>Last response kind: {formatResponseKind(meta.responseKind)}</li>
          ) : null}
          {meta.onyx ? (
            <li>
              Onyx: {meta.onyx.toolCallCount ?? 0} tool call(s), {meta.onyx.searchDocCount ?? 0} search doc(s)
            </li>
          ) : null}
        </ul>
      ) : null}

      <form className="stack gap-sm" onSubmit={sendMessage}>
        <label className="field">
          <span>Subtopic focus</span>
          <select
            value={focusLabel}
            onChange={(event) => setFocusLabel(event.target.value)}
            disabled={sending || focusLabels.length === 0}
          >
            {focusLabels.length === 0 ? <option value="">No embedded subtopics</option> : null}
            {focusLabels.map((entry) => (
              <option key={entry.focusLabel} value={entry.focusLabel}>
                {entry.yearLevel} · {entry.subject} · {entry.subtopic || entry.focusLabel}
              </option>
            ))}
          </select>
        </label>

        <div
          className="stack gap-sm"
          style={{
            maxHeight: "320px",
            overflowY: "auto",
            border: "1px solid var(--border, #d0d5dd)",
            borderRadius: "8px",
            padding: "12px",
            background: "var(--surface, #fff)",
          }}
        >
          {history.length === 0 ? (
            <p style={{ color: "var(--muted, #667085)", margin: 0 }}>
              Ask a question about the selected subtopic to test retrieval and coaching.
            </p>
          ) : null}
          {history.map((entry, index) => (
            <div
              key={`${entry.role}-${index}`}
              style={{
                alignSelf: entry.role === "user" ? "flex-end" : "flex-start",
                maxWidth: "85%",
                padding: "8px 12px",
                borderRadius: "8px",
                background: entry.role === "user" ? "var(--accent-soft, #eef4ff)" : "var(--surface-alt, #f9fafb)",
              }}
            >
              <p className="eyebrow" style={{ margin: "0 0 4px" }}>
                {entry.role === "user" ? "You" : "Study Coach"}
              </p>
              <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{entry.content}</p>
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>

        <label className="field">
          <span>Message</span>
          <textarea
            rows={3}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="e.g. Explain how friction affects motion."
            disabled={sending || !focusLabel}
          />
        </label>

        <div className="row gap-sm">
          <button type="submit" className="button" disabled={sending || !focusLabel || !message.trim()}>
            {sending ? "Sending…" : "Send test message"}
          </button>
          <button type="button" className="button secondary" onClick={clearChat} disabled={sending}>
            Clear chat
          </button>
        </div>
      </form>

      {ragChunks.length > 0 ? (
        <div className="stack gap-sm" style={{ marginTop: "16px" }}>
          <h3>Retrieved chunks</h3>
          <p className="hero-copy">Top curriculum excerpts injected into the system prompt for the last reply.</p>
          <ul className="meta-list">
            {ragChunks.map((chunk) => (
              <li key={chunk.id}>
                <strong>
                  {chunk.subtopic || chunk.focusLabel} (score {formatScore(chunk.score)}, chunk {chunk.chunkIndex})
                </strong>
                <p style={{ margin: "4px 0 0", whiteSpace: "pre-wrap" }}>{chunk.excerpt}</p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
