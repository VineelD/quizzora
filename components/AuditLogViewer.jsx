"use client";

import { useState } from "react";

function formatTimestamp(value) {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatAction(action) {
  return String(action || "")
    .replace(/\./g, " · ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatMetadata(metadata) {
  if (!metadata || typeof metadata !== "object") {
    return "";
  }
  return Object.entries(metadata)
    .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
    .join(" · ");
}

export default function AuditLogViewer({ initialLogs, total, pageSize = 50 }) {
  const [logs, setLogs] = useState(initialLogs);
  const [loading, setLoading] = useState(false);
  const [offset, setOffset] = useState(initialLogs.length);
  const [hasMore, setHasMore] = useState(initialLogs.length < total);

  async function loadMore() {
    setLoading(true);
    const response = await fetch(`/api/admin/audit-logs?limit=${pageSize}&offset=${offset}`);
    const payload = await response.json();
    setLoading(false);

    if (!response.ok) {
      return;
    }

    const next = [...logs, ...payload.logs];
    setLogs(next);
    setOffset(next.length);
    setHasMore(next.length < payload.total);
  }

  return (
    <section className="panel audit-log-panel">
      <div className="row between">
        <div>
          <p className="eyebrow">Compliance</p>
          <h2>Audit trail</h2>
          <p className="muted">
            Who created or changed students, assigned work, and opened reports. Showing {logs.length} of {total}{" "}
            events.
          </p>
        </div>
        {hasMore ? (
          <button className="button secondary" disabled={loading} onClick={loadMore} type="button">
            {loading ? "Loading..." : "Load more"}
          </button>
        ) : null}
      </div>

      <div className="table-wrap">
        <table className="table table-stacked audit-table">
          <thead>
            <tr>
              <th>When</th>
              <th>Who</th>
              <th>Action</th>
              <th>Summary</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((entry) => (
              <tr key={entry.id}>
                <td data-label="When">
                  <time dateTime={entry.createdAt}>{formatTimestamp(entry.createdAt)}</time>
                </td>
                <td data-label="Who">
                  <strong>{entry.actorName}</strong>
                  {entry.actorUsername ? (
                    <>
                      <br />
                      <span className="muted">@{entry.actorUsername}</span>
                    </>
                  ) : null}
                  {entry.actorRole ? (
                    <>
                      <br />
                      <span className="tag">{entry.actorRole}</span>
                    </>
                  ) : null}
                </td>
                <td data-label="Action">
                  <span className="tag audit-action-tag">{formatAction(entry.action)}</span>
                  {entry.entityType ? (
                    <>
                      <br />
                      <span className="muted">
                        {entry.entityType}
                        {entry.entityId ? ` #${entry.entityId}` : ""}
                      </span>
                    </>
                  ) : null}
                </td>
                <td data-label="Summary">{entry.summary || "-"}</td>
                <td data-label="Details">
                  <span className="muted audit-metadata">{formatMetadata(entry.metadata) || "-"}</span>
                </td>
              </tr>
            ))}
            {logs.length === 0 ? (
              <tr>
                <td colSpan="5" data-label="">
                  No audit events yet. Activity appears when teachers and admins use the platform.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
