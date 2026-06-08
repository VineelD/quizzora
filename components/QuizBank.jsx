"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { YEAR_LEVELS } from "../lib/year-levels.js";

export default function QuizBank({ quizzes, yearLevels = YEAR_LEVELS }) {
  const router = useRouter();
  const [selectedQuizId, setSelectedQuizId] = useState(quizzes[0]?.id ? String(quizzes[0].id) : "");
  const [yearLevel, setYearLevel] = useState(yearLevels[0] || "Year 7");
  const [dueAt, setDueAt] = useState("");
  const [message, setMessage] = useState({ text: "", tone: "info" });
  const [loading, setLoading] = useState(false);

  if (!quizzes.length) {
    return null;
  }

  async function assignAgain(event) {
    event.preventDefault();
    if (!selectedQuizId) {
      return;
    }

    setLoading(true);
    setMessage({ text: "Assigning saved quiz...", tone: "info" });

    const response = await fetch("/api/teacher/quizzes/reuse", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        quizId: Number(selectedQuizId),
        yearLevel,
        dueAt: dueAt || null,
      }),
    });
    const payload = await response.json().catch(() => ({}));
    setLoading(false);

    if (!response.ok) {
      setMessage({
        text: payload.error || `Could not assign quiz (${response.status}).`,
        tone: "error",
      });
      return;
    }

    setMessage({ text: "Quiz assigned from your library.", tone: "success" });
    router.refresh();
  }

  return (
    <form className="panel" onSubmit={assignAgain}>
      <div>
        <p className="eyebrow">Question bank</p>
        <h2>Reuse a saved quiz</h2>
        <p className="muted">Assign a previous quiz to another year group without calling OpenAI again.</p>
      </div>

      <div className="form-grid">
        <label>
          Saved quiz
          <select value={selectedQuizId} onChange={(event) => setSelectedQuizId(event.target.value)} required>
            {quizzes.map((quiz) => (
              <option key={quiz.id} value={quiz.id}>
                {quiz.title} ({quiz.subject}, {quiz.year_level})
              </option>
            ))}
          </select>
        </label>

        <label>
          Assign to year group
          <select value={yearLevel} onChange={(event) => setYearLevel(event.target.value)}>
            {yearLevels.map((level) => (
              <option key={level} value={level}>
                {level}
              </option>
            ))}
          </select>
        </label>

        <label>
          Due date (optional)
          <input type="datetime-local" value={dueAt} onChange={(event) => setDueAt(event.target.value)} />
        </label>

        <button className="button secondary" disabled={loading} type="submit">
          {loading ? "Assigning..." : "Assign from library"}
        </button>
      </div>

      {message.text ? <div className={`message ${message.tone === "error" ? "error" : ""}`}>{message.text}</div> : null}
    </form>
  );
}
