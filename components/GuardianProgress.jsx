"use client";

import { useEffect, useState } from "react";
import { formatDueLabel, isPastDue } from "../lib/dates.js";

export default function GuardianProgress({ token }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(Boolean(token));

  useEffect(() => {
    if (!token) {
      setError("Open the link from your email to view progress.");
      setLoading(false);
      return;
    }

    let cancelled = false;
    async function load() {
      setLoading(true);
      const response = await fetch(`/api/guardian/progress?token=${encodeURIComponent(token)}`);
      const payload = await response.json();
      if (cancelled) {
        return;
      }
      setLoading(false);
      if (!response.ok) {
        setError(payload.error || "Could not load progress.");
        return;
      }
      setData(payload);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (loading) {
    return <p className="muted panel">Loading progress...</p>;
  }

  if (error) {
    return <div className="message error panel">{error}</div>;
  }

  return (
    <section className="panel">
      <h2>{data.student.name}</h2>
      <div className="table-wrap">
        <table className="table table-stacked">
          <thead>
            <tr>
              <th>Assignment</th>
              <th>Due</th>
              <th>Status</th>
              <th>Score</th>
            </tr>
          </thead>
          <tbody>
            {data.assignments.map((item) => (
              <tr key={item.assignment_id}>
                <td data-label="Assignment">
                  <strong>{item.title}</strong>
                  <br />
                  <span className="muted">{item.subject}</span>
                </td>
                <td data-label="Due">
                  {formatDueLabel(item.due_at)}
                  {item.due_at && isPastDue(item.due_at) && !item.submitted_at ? (
                    <span className="tag warning-tag">Past due</span>
                  ) : null}
                </td>
                <td data-label="Status">{item.status}</td>
                <td data-label="Score">{item.percent === null ? "-" : `${item.percent}%`}</td>
              </tr>
            ))}
            {data.assignments.length === 0 ? (
              <tr>
                <td colSpan="4" data-label="">
                  No assignments yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
