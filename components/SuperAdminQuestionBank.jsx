"use client";

import { useCallback, useEffect, useState } from "react";

function formatNumber(value) {
  return Number(value || 0).toLocaleString();
}

function statusLabel(status) {
  const normalized = String(status || "unknown");
  if (normalized === "waiting_for_slot") {
    return "waiting for slot";
  }
  return normalized.replace(/_/g, " ");
}

function statusTone(status) {
  if (status === "waiting_for_slot") {
    return "var(--muted, #667085)";
  }
  if (status === "failed") {
    return "var(--danger, #b42318)";
  }
  return undefined;
}

function formatDuration(hours) {
  if (hours == null || !Number.isFinite(hours)) {
    return "—";
  }
  if (hours < 1) {
    return `${Math.round(hours * 60)} min`;
  }
  if (hours < 48) {
    return `${Math.round(hours * 10) / 10} h`;
  }
  return `${Math.round(hours / 24)} days`;
}

function formatEta(iso) {
  if (!iso) {
    return "—";
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }
  return date.toLocaleString();
}

export default function SuperAdminQuestionBank() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState("");

  const loadStatus = useCallback(async () => {
    const response = await fetch("/api/superadmin/question-bank/status", {
      credentials: "include",
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || "Could not load question bank status.");
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
    const timer = window.setInterval(() => {
      loadStatus().catch((loadError) => {
        setError(loadError.message);
      });
    }, 3000);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [loadStatus]);

  async function startFill() {
    setActing(true);
    setError("");
    try {
      const response = await fetch("/api/superadmin/question-bank/start", {
        method: "POST",
        credentials: "include",
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Could not start question bank fill.");
      }
      setStatus(payload);
    } catch (startError) {
      setError(startError.message);
    } finally {
      setActing(false);
    }
  }

  async function stopFill() {
    setActing(true);
    setError("");
    try {
      const response = await fetch("/api/superadmin/question-bank/stop", {
        method: "POST",
        credentials: "include",
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Could not pause question bank fill.");
      }
      setStatus(payload);
    } catch (stopError) {
      setError(stopError.message);
    } finally {
      setActing(false);
    }
  }

  const totals = status?.totals || {};
  const embeddings = status?.embeddings || {};
  const run = totals.displayRun || totals.activeRun;
  const progress =
    totals.targetTotal > 0
      ? Math.min(100, Math.round((totals.published / totals.targetTotal) * 100))
      : 0;
  const throughput = status?.throughput || {};
  const openAiQuota = status?.openAiQuota || {};
  const tokenBudget = status?.tokenBudget || {};
  const slotsUsed = status?.slotsUsed ?? status?.activeBatchCount ?? 0;
  const slotsMax = status?.effectiveMaxConcurrentBatches ?? status?.maxConcurrentBatches ?? 1;

  return (
    <section className="panel">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start", gap: "1rem" }}>
        <div>
          <p className="eyebrow">Question bank</p>
          <h2>ACARA fill status</h2>
          <p className="hero-copy">
            Six year-level agents fill the local question bank. In-flight OpenAI batches keep polling;
            new questions use the configured fill mode. Counts refresh every 3 seconds.
          </p>
        </div>
        <div className="row">
          <button
            type="button"
            className="button"
            disabled={acting || run?.status === "running"}
            onClick={startFill}
          >
            {run?.status === "paused" ? "Resume all" : "Start all"}
          </button>
          <button
            type="button"
            className="button secondary"
            disabled={acting || run?.status !== "running"}
            onClick={stopFill}
          >
            Stop
          </button>
        </div>
      </div>

      {error ? <p className="muted" style={{ color: "var(--danger, #b42318)" }}>{error}</p> : null}
      {loading && !status ? <p>Loading question bank status…</p> : null}

      {status ? (
        <>
          <div
            className="row"
            style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(9rem, 1fr))", gap: "0.75rem" }}
          >
            {[
              ["Published", totals.published],
              [
                "Embedded",
                embeddings.published
                  ? `${formatNumber(embeddings.embedded)} / ${formatNumber(embeddings.published)}`
                  : "—",
              ],
              ["Target", totals.targetTotal],
              ["Remaining", throughput.remaining ?? totals.targetTotal - totals.published],
              ["Pending", totals.pending],
              ["In batch", totals.submitted],
              ["Rate", throughput.publishedPerHour ? `${formatNumber(throughput.publishedPerHour)}/hr` : "—"],
              ["ETA", formatDuration(throughput.estimatedHours)],
              ["Progress", `${progress}%`],
            ].map(([label, value]) => (
              <article key={label} className="panel" style={{ padding: "0.75rem 1rem", margin: 0 }}>
                <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>
                  {label}
                </p>
                <p style={{ margin: "0.25rem 0 0", fontSize: "1.35rem", fontWeight: 700 }}>
                  {typeof value === "number" ? formatNumber(value) : value}
                </p>
              </article>
            ))}
          </div>

          <p className="muted">
            Fill mode: {status.fillModeLabel || "Sync API"}
            {status.fillMode === "sync" && status.syncConcurrency
              ? ` (${status.syncConcurrency} parallel${status.syncMaxConcurrency ? `, max ${status.syncMaxConcurrency}` : ""})`
              : ""}{" "}
            · Model: {status.model} · Batch size: {status.effectiveBatchChunkSize ?? status.batchChunkSize}
            {status.adaptiveChunkEnabled
              ? status.adaptiveChunkActive
                ? " (adaptive max)"
                : " (adaptive, warming)"
              : ""}{" "}
            · Submit delay: {Math.round((status.submitDelayMs || 0) / 1000)}s · Slots: {slotsUsed}/
            {slotsMax}
            {status.limitErrorBackoff ? " (backoff)" : ""}
            {tokenBudget.tokenBudgetPercent != null
              ? ` · Token budget: ${tokenBudget.tokenBudgetPercent}%`
              : ""}
            {openAiQuota.inProgressCount != null
              ? ` · OpenAI in-flight: ${openAiQuota.inProgressCount}`
              : ""}{" "}
            · Target per subtopic: {status.targetPerCell} · Cells:{" "}
            {formatNumber(totals.curriculumCells)} · Embeddings:{" "}
            {embeddings.model || "—"}
            {embeddings.pending ? ` (${formatNumber(embeddings.pending)} pending)` : ""} · Worker:{" "}
            {status.workerEnabled ? "enabled" : "disabled"}
            {run ? ` · Run #${run.id} (${run.status})` : ""}
          </p>
          {throughput.estimatedCompletionAt ? (
            <p className="muted">
              Estimated completion: {formatEta(throughput.estimatedCompletionAt)} · Observed{" "}
              {formatNumber(throughput.observedPerHour || 0)}/hr · Steady-state ~{" "}
              {formatNumber(throughput.theoreticalPerHour || 0)}/hr at ~{throughput.batchTurnaroundMinutes} min
              per batch × {throughput.theoreticalParallelBatches || slotsMax} parallel
              {status.dynamicConcurrencyBoosted ? " (boosted)" : ""}
            </p>
          ) : null}

          <div
            className="row"
            style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(14rem, 1fr))", gap: "0.75rem" }}
          >
            {(status.agents || []).map((agent) => (
              <article key={agent.id} className="panel" style={{ padding: "0.75rem 1rem", margin: 0 }}>
                <h3>{agent.yearLevel}</h3>
                <p>
                  <strong>Status:</strong>{" "}
                  <span style={statusTone(agent.status) ? { color: statusTone(agent.status) } : undefined}>
                    {statusLabel(agent.status)}
                  </span>
                </p>
                <p>
                  <strong>Batch:</strong> {agent.openaiBatchId || "—"}
                </p>
                <p>
                  <strong>In batch:</strong> {formatNumber(agent.requestsInBatch)} ·{" "}
                  <strong>Ingested:</strong> {formatNumber(agent.requestsIngested)}
                </p>
                {agent.lastError ? (
                  <p className="muted" style={{ color: "var(--danger, #b42318)" }}>
                    {agent.lastError}
                  </p>
                ) : null}
              </article>
            ))}
          </div>

          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Year</th>
                  <th>Subject</th>
                  <th>Subtopics</th>
                  <th>Published</th>
                  <th>Target</th>
                  <th>Fill</th>
                </tr>
              </thead>
              <tbody>
                {(status.breakdown || []).map((row) => {
                  const fill =
                    row.target > 0 ? Math.min(100, Math.round((row.published / row.target) * 100)) : 0;
                  return (
                    <tr key={`${row.yearLevel}-${row.subject}`}>
                      <td>{row.yearLevel}</td>
                      <td>{row.subject}</td>
                      <td>{row.subtopics}</td>
                      <td>{formatNumber(row.published)}</td>
                      <td>{formatNumber(row.target)}</td>
                      <td>{fill}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </section>
  );
}
