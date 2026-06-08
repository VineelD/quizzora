"use client";

import { useCallback, useEffect, useState } from "react";

function formatSavedAt(value) {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function StudentStudyFiles({ assignmentId, refreshToken = 0 }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [files, setFiles] = useState([]);

  const loadFiles = useCallback(async () => {
    setLoading(true);
    setError("");

    const response = await fetch(`/api/student/study/files?assignmentId=${assignmentId}`, {
      credentials: "include",
    });
    const payload = await response.json();
    setLoading(false);

    if (!response.ok) {
      setError(payload.error || "Could not load study files.");
      return;
    }

    setFiles(payload.files || []);
  }, [assignmentId]);

  useEffect(() => {
    loadFiles();
  }, [loadFiles, refreshToken]);

  if (loading) {
    return (
      <section className="panel study-files-panel">
        <p className="muted">Loading study files...</p>
      </section>
    );
  }

  return (
    <section className="panel study-files-panel">
      <div className="study-files-header">
        <div>
          <p className="eyebrow">Study files</p>
          <h2 className="section-title">Saved formulas and concept visuals</h2>
        </div>
        <button className="button secondary" onClick={loadFiles} type="button">
          Refresh
        </button>
      </div>

      <p className="study-coach-note">
        PDFs are generated on our servers from your Study Coach replies — no extra AI calls. Save a concept visual or
        formula flash card from the Learn tab with <strong>Save to files</strong>.
      </p>

      {error ? <div className="message error">{error}</div> : null}

      {!files.length ? (
        <p className="muted study-files-empty">
          No saved files yet. Ask Study Coach for a concept visual or key formulas, then tap <strong>Save to files</strong> on
          that reply.
        </p>
      ) : (
        <ul className="study-files-list">
          {files.map((file) => (
            <li className="study-files-item" key={file.id}>
              <div>
                <p className="study-files-title">{file.title}</p>
                <p className="muted study-files-meta">{formatSavedAt(file.createdAt)}</p>
              </div>
              <a className="button primary study-files-download" href={file.downloadUrl}>
                Download PDF
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
