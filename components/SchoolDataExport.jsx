"use client";

import { useState } from "react";

export default function SchoolDataExport() {
  const [message, setMessage] = useState("");

  async function download(type) {
    setMessage("");
    const response = await fetch(`/api/admin/export?type=${type}`);
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      setMessage(payload.error || "Export failed.");
      return;
    }

    const blob = await response.blob();
    const disposition = response.headers.get("Content-Disposition") || "";
    const match = disposition.match(/filename="([^"]+)"/);
    const filename = match?.[1] || `school-${type}.csv`;

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
    setMessage(`${filename} downloaded.`);
  }

  return (
    <section className="panel" id="school-data">
      <p className="eyebrow">School data</p>
      <h2>Export CSV</h2>
      <p className="muted">
        Download a full student roster or all assignment marks for your school. Useful for reporting, audits, and
        migration.
      </p>
      <div className="row">
        <button className="button secondary" onClick={() => download("students")} type="button">
          Export student roster
        </button>
        <button className="button secondary" onClick={() => download("marks")} type="button">
          Export all marks
        </button>
      </div>
      {message ? <div className="message">{message}</div> : null}
    </section>
  );
}
