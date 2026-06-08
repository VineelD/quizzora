"use client";

import { useState } from "react";
import { coachPayloadHasExportableContent } from "../lib/study-export-content.js";
import { parseStoredMessagePayload } from "../lib/study-message-payload.client.js";

export default function StudySaveToFilesButton({
  assignmentId,
  messageId: messageIdProp,
  entry,
  onSaved,
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const payload = parseStoredMessagePayload(entry);
  const messageId = Number(messageIdProp ?? entry?.id);
  if (!coachPayloadHasExportableContent(payload) || !Number.isFinite(messageId)) {
    return null;
  }

  async function saveToFiles() {
    if (saving || saved) {
      return;
    }

    setSaving(true);
    setError("");

    const response = await fetch("/api/student/study/files", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        assignmentId,
        messageId,
      }),
    });

    const result = await response.json();
    setSaving(false);

    if (!response.ok) {
      setError(result.error || "Could not save file.");
      return;
    }

    setSaved(true);
    onSaved?.(result);
  }

  return (
    <div className="study-save-files">
      <button
        className="button secondary study-save-files-button"
        disabled={saving || saved}
        onClick={saveToFiles}
        type="button"
      >
        {saved ? "Saved to files" : saving ? "Saving PDF..." : "Save to files"}
      </button>
      {saved ? (
        <p aria-live="polite" className="message success study-save-files-success">
          Saved to Files
        </p>
      ) : null}
      {error ? <p className="study-save-files-error">{error}</p> : null}
    </div>
  );
}
