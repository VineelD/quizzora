"use client";

import { useEffect, useMemo, useState } from "react";

function trendLabel(trend) {
  if (trend === "up") {
    return { symbol: "↑", text: "Improving", className: "mastery-trend mastery-trend-up" };
  }
  if (trend === "down") {
    return { symbol: "↓", text: "Declining", className: "mastery-trend mastery-trend-down" };
  }
  return { symbol: "→", text: "Steady", className: "mastery-trend mastery-trend-flat" };
}

function formatStudyTime(seconds) {
  const total = Number(seconds) || 0;
  if (total < 60) {
    return `${total}s`;
  }
  const minutes = Math.round(total / 60);
  return `${minutes} min`;
}

export default function MasteryTrendsPanel({ classes, students }) {
  const [classId, setClassId] = useState(classes[0]?.class_id ? String(classes[0].class_id) : "");
  const [studentId, setStudentId] = useState("");
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const classStudents = useMemo(() => {
    if (!classId) {
      return students;
    }
    const className = classes.find((item) => String(item.class_id) === classId)?.class_name;
    if (!className) {
      return students;
    }
    return students.filter((student) => student.class_name === className);
  }, [classId, classes, students]);

  useEffect(() => {
    let cancelled = false;

    async function loadReport() {
      setLoading(true);
      setError("");

      const params = new URLSearchParams();
      if (classId) {
        params.set("classId", classId);
      }
      if (studentId) {
        params.set("studentId", studentId);
      }

      try {
        const response = await fetch(`/api/teacher/reports/mastery?${params.toString()}`);
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload.error || "Could not load mastery trends.");
        }
        if (!cancelled) {
          setReport(payload);
        }
      } catch (fetchError) {
        if (!cancelled) {
          setReport(null);
          setError(fetchError.message);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadReport();
    return () => {
      cancelled = true;
    };
  }, [classId, studentId]);

  return (
    <section className="panel" id="mastery-trends">
      <div className="row between">
        <div>
          <p className="eyebrow">Longitudinal reporting</p>
          <h2 className="section-title">Topic mastery trends</h2>
          <p className="muted">
            Average quiz scores grouped by curriculum topic and subtopic across recent assignments.
          </p>
        </div>
        <div className="row mastery-filters">
          <label className="field compact-field">
            <span>Year group</span>
            <select value={classId} onChange={(event) => setClassId(event.target.value)}>
              <option value="">All classes</option>
              {classes.map((item) => (
                <option key={item.class_id} value={item.class_id}>
                  {item.class_name}
                </option>
              ))}
            </select>
          </label>
          <label className="field compact-field">
            <span>Student</span>
            <select value={studentId} onChange={(event) => setStudentId(event.target.value)}>
              <option value="">Whole class</option>
              {classStudents.map((student) => (
                <option key={student.id} value={student.id}>
                  {student.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {loading ? <p className="muted">Loading mastery trends…</p> : null}
      {error ? <p className="message error">{error}</p> : null}

      {!loading && !error ? (
        <>
          <p className="muted small-copy">
            Based on {report?.assignmentCount || 0} recent assignment
            {report?.assignmentCount === 1 ? "" : "s"} with submitted quiz results.
          </p>
          <div className="table-wrap">
            <table className="table table-stacked">
              <thead>
                <tr>
                  <th>Topic</th>
                  <th>Subtopic</th>
                  <th>Avg %</th>
                  <th>Attempts</th>
                  <th>Trend</th>
                  <th>Study Coach</th>
                </tr>
              </thead>
              <tbody>
                {(report?.topics || []).map((topic) => {
                  const trend = trendLabel(topic.trend);
                  return (
                    <tr key={`${topic.subject}-${topic.topic}-${topic.subtopic}`}>
                      <td data-label="Topic">
                        <strong>{topic.topic}</strong>
                        <br />
                        <span className="muted">{topic.subject}</span>
                      </td>
                      <td data-label="Subtopic">{topic.subtopic}</td>
                      <td data-label="Avg %">{topic.avgScore ?? "—"}%</td>
                      <td data-label="Attempts">{topic.attempts}</td>
                      <td data-label="Trend">
                        <span className={trend.className} title={trend.text}>
                          {trend.symbol} {trend.text}
                        </span>
                      </td>
                      <td data-label="Study Coach">
                        {topic.studyMessages > 0 || topic.studySeconds > 0 ? (
                          <>
                            {topic.studyMessages} on-topic msg
                            {topic.studyMessages === 1 ? "" : "s"}
                            {topic.studySeconds > 0 ? (
                              <>
                                <br />
                                <span className="muted">{formatStudyTime(topic.studySeconds)} studied</span>
                              </>
                            ) : null}
                          </>
                        ) : (
                          <span className="muted">No coach activity</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {!report?.topics?.length ? (
                  <tr>
                    <td colSpan="6" data-label="">
                      No submitted quiz results yet for this view. Assign quizzes and wait for submissions to see
                      trends.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </section>
  );
}
