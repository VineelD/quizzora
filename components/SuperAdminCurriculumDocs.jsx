"use client";

import { useCallback, useEffect, useState } from "react";

function formatNumber(value) {
  return Number(value || 0).toLocaleString();
}

export default function SuperAdminCurriculumDocs() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadStatus = useCallback(async () => {
    const response = await fetch("/api/superadmin/curriculum-docs/status", {
      credentials: "include",
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || "Could not load curriculum doc status.");
    }
    setStatus(payload);
    setError("");
  }, []);

  useEffect(() => {
    let active = true;

    async function bootstrap() {
      try {
        await loadStatus();
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
    const timer = setInterval(() => {
      loadStatus().catch(() => {});
    }, 30000);

    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [loadStatus]);

  return (
    <section className="panel">
      <p className="eyebrow">Study Coach RAG</p>
      <h2>Curriculum reference vectors</h2>
      <p className="hero-copy">
        Locally stored Australian curriculum study material per subtopic (not quiz questions). Generate with{" "}
        <code>scripts/generate-curriculum-docs.mjs</code>, embed with{" "}
        <code>scripts/embed-curriculum-docs.mjs</code>.
      </p>

      {loading ? <p>Loading status…</p> : null}
      {error ? <p className="form-error">{error}</p> : null}

      {status ? (
        <div className="stack gap-sm">
          <p>
            <strong>{status.summary}</strong>
          </p>
          <ul className="meta-list">
            <li>RAG enabled: {status.ragEnabled ? "yes" : "no"}</li>
            <li>Doc model: {status.docModel}</li>
            <li>Embed model: {status.embedModel}</li>
            <li>Generated subtopics: {formatNumber(status.generatedSubtopics)} / {formatNumber(status.totalSubtopics)}</li>
            <li>Embedded subtopics: {formatNumber(status.embeddedSubtopics)}</li>
            <li>Total chunks: {formatNumber(status.totalChunks)}</li>
            <li>Embedded chunks: {formatNumber(status.embeddedChunks)}</li>
            <li>Failed: {formatNumber(status.failedSubtopics)}</li>
          </ul>
        </div>
      ) : null}
    </section>
  );
}
