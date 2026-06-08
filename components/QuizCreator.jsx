"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { getCreatorCategories, isSudokuCategory } from "../lib/assignment-categories.js";
import { buildSubtopicOptions, formatFocusLabel } from "../lib/curriculum-topics.js";
import { getMaxQuestionsPerQuizForPlan } from "../lib/plans.js";
import { YEAR_LEVELS } from "../lib/year-levels.js";

function getInitialTopicKey(curriculumTree, yearLevel, subject) {
  return curriculumTree[yearLevel]?.[subject]?.[0]?.key || "";
}

function getInitialSubtopic(curriculumTree, yearLevel, subject, topicKey) {
  const row = curriculumTree[yearLevel]?.[subject]?.find((item) => item.key === topicKey);
  return row?.subtopics?.[0] || "";
}

export default function QuizCreator({ subjects, curriculumTree, subscription }) {
  const canGenerateAi = subscription?.canGenerateAi !== false;
  const canUseSudoku = subscription?.canUseSudoku !== false;
  const router = useRouter();
  const yearLevels = Object.keys(curriculumTree);
  const categories = getCreatorCategories(yearLevels);
  const [category, setCategory] = useState(categories[0]);
  const isSudoku = isSudokuCategory(category);
  const [assignYearLevel, setAssignYearLevel] = useState(YEAR_LEVELS[0]);
  const yearLevel = isSudoku ? assignYearLevel : category;

  const maxQuestionsPerQuiz = getMaxQuestionsPerQuizForPlan(subscription?.limits);
  const aiLimit = subscription?.limits?.maxAiQuizzesPerMonth;
  const aiRemaining = subscription?.aiRemaining;
  const aiUsed = subscription?.usage?.aiQuizzesThisMonth;

  const availableSubjects = useMemo(() => {
    const fromTree = Object.keys(curriculumTree[yearLevel] || {});
    return fromTree.length ? fromTree : subjects;
  }, [curriculumTree, yearLevel, subjects]);

  const [subject, setSubject] = useState(() => {
    const initialYear = categories[0];
    const initialSubjects = Object.keys(curriculumTree[initialYear] || {});
    return (initialSubjects.length ? initialSubjects : subjects)[0];
  });

  const topicOptions = useMemo(
    () => curriculumTree[yearLevel]?.[subject] || [],
    [curriculumTree, yearLevel, subject],
  );

  const [selectedTopicKeys, setSelectedTopicKeys] = useState(() => {
    const key = getInitialTopicKey(curriculumTree, yearLevels[0], subjects[0]);
    return key ? [key] : [];
  });

  const subtopicOptions = useMemo(
    () => buildSubtopicOptions(topicOptions, selectedTopicKeys),
    [topicOptions, selectedTopicKeys],
  );

  const [selectedSubtopicLabels, setSelectedSubtopicLabels] = useState(() => {
    const topicKey = getInitialTopicKey(curriculumTree, yearLevels[0], subjects[0]);
    const subtopic = getInitialSubtopic(curriculumTree, yearLevels[0], subjects[0], topicKey);
    if (!topicKey || !subtopic) {
      return [];
    }
    const row = curriculumTree[yearLevels[0]]?.[subjects[0]]?.find((item) => item.key === topicKey);
    return row ? [formatFocusLabel(row, subtopic)] : [];
  });

  const [questionCount, setQuestionCount] = useState(5);
  const [difficulty, setDifficulty] = useState("mixed");
  const [sudokuDifficulty, setSudokuDifficulty] = useState("Medium");
  const [questionStyle, setQuestionStyle] = useState("worded");
  const [dueAt, setDueAt] = useState("");
  const [message, setMessage] = useState({ text: "", tone: "info" });
  const [loading, setLoading] = useState(false);
  const [reviewJob, setReviewJob] = useState(null);

  const effectiveQuestionCount = Math.min(
    Math.max(Number(questionCount) || 5, 1),
    maxQuestionsPerQuiz,
  );
  const questionCountClamped = effectiveQuestionCount !== Number(questionCount);

  const focusPreview = useMemo(() => {
    if (!selectedSubtopicLabels.length) {
      return "General review";
    }
    if (selectedSubtopicLabels.length === 1) {
      return selectedSubtopicLabels[0];
    }
    const preview = selectedSubtopicLabels.slice(0, 2).join("; ");
    return selectedSubtopicLabels.length > 2
      ? `${preview} (+${selectedSubtopicLabels.length - 2} more)`
      : preview;
  }, [selectedSubtopicLabels]);

  function resetTopicSelection(nextYearLevel, nextSubject) {
    const nextTopicKey = getInitialTopicKey(curriculumTree, nextYearLevel, nextSubject);
    const nextSubtopic = getInitialSubtopic(curriculumTree, nextYearLevel, nextSubject, nextTopicKey);
    const row = curriculumTree[nextYearLevel]?.[nextSubject]?.find((item) => item.key === nextTopicKey);
    setSelectedTopicKeys(nextTopicKey ? [nextTopicKey] : []);
    setSelectedSubtopicLabels(row && nextSubtopic ? [formatFocusLabel(row, nextSubtopic)] : []);
  }

  function updateCategory(nextCategory) {
    setCategory(nextCategory);
    if (!isSudokuCategory(nextCategory)) {
      resetTopicSelection(nextCategory, subject);
    }
  }

  function updateSubject(nextSubject) {
    setSubject(nextSubject);
    resetTopicSelection(yearLevel, nextSubject);
  }

  function toggleTopic(topicKey) {
    setSelectedTopicKeys((current) =>
      current.includes(topicKey)
        ? current.filter((item) => item !== topicKey)
        : [...current, topicKey],
    );
  }

  function selectAllTopics() {
    setSelectedTopicKeys(topicOptions.map((item) => item.key));
  }

  function toggleSubtopic(label) {
    setSelectedSubtopicLabels((current) => {
      const next = current.includes(label) ? current.filter((item) => item !== label) : [...current, label];
      return next.length ? next : [label];
    });
  }

  function selectAllSubtopics() {
    setSelectedSubtopicLabels(subtopicOptions.map((item) => item.label));
  }

  useEffect(() => {
    setSelectedSubtopicLabels((current) => {
      const allowed = new Set(subtopicOptions.map((item) => item.label));
      const filtered = current.filter((label) => allowed.has(label));
      if (filtered.length) {
        return filtered;
      }
      return subtopicOptions[0]?.label ? [subtopicOptions[0].label] : [];
    });
  }, [subtopicOptions]);

  async function readApiResponse(response) {
    const text = await response.text();
    if (!text) {
      return { payload: {}, parseError: null };
    }

    try {
      return { payload: JSON.parse(text), parseError: null };
    } catch {
      const preview = text.replace(/\s+/g, " ").trim().slice(0, 160);
      if (response.status === 502 || response.status === 504) {
        return {
          payload: {},
          parseError: "The server timed out. Try again in a moment.",
        };
      }
      return {
        payload: {},
        parseError: preview
          ? `Server error (${response.status}): ${preview}`
          : `Server error (${response.status}). Could not create assignment.`,
      };
    }
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function statusLabel(job) {
    if (job.progressMessage) {
      return job.progressMessage;
    }
    if (job.status === "queued") {
      return "Queued…";
    }
    if (job.status === "processing") {
      return "Generating quiz…";
    }
    return "Working…";
  }

  async function pollQuizJob(jobId) {
    const maxAttempts = 120;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      await sleep(attempt === 0 ? 1500 : 2500);

      const response = await fetch(`/api/teacher/quizzes/jobs/${jobId}`);
      const { payload, parseError } = await readApiResponse(response);

      if (parseError) {
        throw new Error(parseError);
      }
      if (!response.ok) {
        throw new Error(payload.error || "Could not check quiz generation status.");
      }

      setMessage({ text: statusLabel(payload), tone: "info" });

      if (payload.status === "completed") {
        return payload;
      }
      if (payload.status === "review_required") {
        return payload;
      }
      if (payload.status === "failed") {
        throw new Error(payload.error || "Quiz generation failed.");
      }
    }

    throw new Error("Quiz generation is taking longer than expected. Check your library shortly.");
  }

  async function createAssignment(event) {
    event.preventDefault();

    if (isSudoku && !canUseSudoku) {
      setMessage({ text: "Sudoku is not available on your school's current plan.", tone: "error" });
      return;
    }
    if (!isSudoku && !canGenerateAi) {
      setMessage({
        text: "AI quiz limit reached or subscription inactive. Reuse a quiz from your library or ask your admin to upgrade.",
        tone: "error",
      });
      return;
    }
    if (!isSudoku && !selectedSubtopicLabels.length) {
      setMessage({ text: "Select at least one subtopic.", tone: "error" });
      return;
    }

    setLoading(true);
    setReviewJob(null);
    setMessage({
      text: isSudoku ? "Assigning Sudoku..." : "Starting quiz generation...",
      tone: "info",
    });

    try {
      const response = await fetch(isSudoku ? "/api/teacher/sudoku" : "/api/teacher/quizzes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          isSudoku
            ? { yearLevel, difficulty: sudokuDifficulty, dueAt: dueAt || null }
            : {
                yearLevel,
                subject,
                selectedTopics: selectedTopicKeys,
                selectedSubtopics: selectedSubtopicLabels,
                focus: focusPreview,
                questionCount: effectiveQuestionCount,
                difficulty,
                questionStyle,
                dueAt: dueAt || null,
              },
        ),
      });
      const { payload, parseError } = await readApiResponse(response);

      if (parseError) {
        setMessage({ text: parseError, tone: "error" });
        return;
      }

      if (!response.ok) {
        setMessage({ text: payload.error || "Could not create assignment.", tone: "error" });
        return;
      }

      if (isSudoku) {
        setMessage({
          text: `Sudoku (${payload.difficulty}) assigned to ${yearLevel}.`,
          tone: "success",
        });
        router.refresh();
        return;
      }

      if (response.status === 202 && payload.jobId) {
        setMessage({ text: "Queued…", tone: "info" });
        const completed = await pollQuizJob(payload.jobId);
        const clampNote = payload.questionCountClamped
          ? ` (${payload.questionCount} questions — plan cap applied)`
          : "";

        if (completed.status === "review_required") {
          setReviewJob(completed);
          setMessage({
            text: `Quiz generated${clampNote}. Review clarity warnings below before assigning to ${yearLevel}.`,
            tone: "info",
          });
          return;
        }

        const reviewNote = completed.needsReview
          ? " Some questions need teacher review — check the quiz report."
          : "";
        const diagramNote = completed.diagramReport?.needsAttention
          ? " Some diagrams were skipped or unavailable — see the quiz report."
          : "";
        setMessage({
          text: `Quiz assigned to ${yearLevel}. Source: ${completed.source || "OpenAI"}${clampNote}${reviewNote}${diagramNote}`,
          tone: completed.needsReview ? "info" : "success",
        });
        router.refresh();
        return;
      }

      setMessage({
        text: `Quiz assigned to ${yearLevel}. Source: ${payload.source}`,
        tone: "success",
      });
      router.refresh();
    } catch (error) {
      setMessage({ text: error.message || "Network error while creating assignment.", tone: "error" });
    } finally {
      setLoading(false);
    }
  }

  async function assignReviewedQuiz() {
    if (!reviewJob?.jobId) {
      return;
    }

    setLoading(true);
    setMessage({ text: "Assigning quiz…", tone: "info" });

    try {
      const response = await fetch(`/api/teacher/quizzes/jobs/${reviewJob.jobId}/assign`, {
        method: "POST",
      });
      const { payload, parseError } = await readApiResponse(response);

      if (parseError) {
        setMessage({ text: parseError, tone: "error" });
        return;
      }
      if (!response.ok) {
        setMessage({ text: payload.error || "Could not assign quiz.", tone: "error" });
        return;
      }

      setReviewJob(null);
      setMessage({
        text: `Quiz assigned to ${yearLevel}. Source: ${payload.source || "OpenAI"}`,
        tone: "success",
      });
      router.refresh();
    } catch (error) {
      setMessage({ text: error.message || "Network error while assigning quiz.", tone: "error" });
    } finally {
      setLoading(false);
    }
  }

  function dismissReview() {
    setReviewJob(null);
    setMessage({ text: "Quiz preview dismissed — generate again to assign.", tone: "info" });
  }

  return (
    <form className="panel" onSubmit={createAssignment}>
      <div>
        <p className="eyebrow">Assessment builder</p>
        <h2 className="section-title">Generate an assignment</h2>
        {!isSudoku && selectedTopicKeys.length ? (
          <p className="curriculum-alignment-badge" role="status">
            Aligned to {yearLevel} {subject} · {selectedTopicKeys.length} topic
            {selectedTopicKeys.length === 1 ? "" : "s"} · {selectedSubtopicLabels.length} subtopic
            {selectedSubtopicLabels.length === 1 ? "" : "s"}
          </p>
        ) : null}
        <p className="muted">
          {isSudoku
            ? "Assign a classic 9×9 Sudoku puzzle to a year group. Students complete it in their portal."
            : "OpenAI generates curriculum-aligned quiz content. Select one or more topics and subtopics to spread questions across your syllabus. Visual subjects include diagrams where they help — simple math uses structured specs; up to a few AI illustrations per quiz are generated when needed (cached when possible)."}
        </p>
        {!isSudoku && aiLimit > 0 ? (
          <p className="muted quiz-billing-hint" role="status">
            Your plan allows {aiLimit} AI quiz{aiLimit === 1 ? "" : "es"} this month —{" "}
            {aiRemaining ?? Math.max(0, aiLimit - (aiUsed || 0))} remaining. Up to {maxQuestionsPerQuiz}{" "}
            questions per quiz.
          </p>
        ) : null}
        {!isSudoku && (!aiLimit || aiLimit <= 0) ? (
          <p className="muted quiz-billing-hint" role="status">
            Unlimited AI quizzes on your plan. Up to {maxQuestionsPerQuiz} questions per quiz.
          </p>
        ) : null}
      </div>

      <div className="form-grid">
        <label>
          Category
          <select value={category} onChange={(event) => updateCategory(event.target.value)}>
            {categories.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>

        {isSudoku ? (
          <>
            <label>
              Assign to year group
              <select value={assignYearLevel} onChange={(event) => setAssignYearLevel(event.target.value)}>
                {YEAR_LEVELS.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Sudoku difficulty
              <select value={sudokuDifficulty} onChange={(event) => setSudokuDifficulty(event.target.value)}>
                <option value="Easy">Easy</option>
                <option value="Medium">Medium</option>
                <option value="Hard">Hard</option>
              </select>
            </label>
          </>
        ) : (
          <>
            <label>
              Subject
              <select value={subject} onChange={(event) => updateSubject(event.target.value)}>
                {availableSubjects.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>

            <fieldset className="checkbox-group">
              <legend className="checkbox-group-legend">
                Topics
                <button className="button-link" onClick={selectAllTopics} type="button">
                  Select all
                </button>
              </legend>
              <div className="checkbox-scroll">
                {topicOptions.map((item) => (
                  <label className="checkbox-row" key={item.key}>
                    <input
                      checked={selectedTopicKeys.includes(item.key)}
                      onChange={() => toggleTopic(item.key)}
                      type="checkbox"
                    />
                    {item.key}
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset className="checkbox-group" disabled={!selectedTopicKeys.length}>
              <legend className="checkbox-group-legend">
                Subtopics
                {selectedTopicKeys.length ? (
                  <button className="button-link" onClick={selectAllSubtopics} type="button">
                    Select all
                  </button>
                ) : null}
              </legend>
              {!selectedTopicKeys.length ? (
                <p className="muted">Select at least one topic to choose subtopics.</p>
              ) : (
                <div className="checkbox-scroll">
                  {subtopicOptions.map((item) => (
                    <label className="checkbox-row" key={item.label}>
                      <input
                        checked={selectedSubtopicLabels.includes(item.label)}
                        onChange={() => toggleSubtopic(item.label)}
                        type="checkbox"
                      />
                      {item.label}
                    </label>
                  ))}
                </div>
              )}
            </fieldset>

            <label>
              Questions (1–{maxQuestionsPerQuiz})
              <input
                max={maxQuestionsPerQuiz}
                min="1"
                type="number"
                value={questionCount}
                onChange={(event) => setQuestionCount(event.target.value)}
              />
              {questionCountClamped ? (
                <span className="muted">Clamped to {effectiveQuestionCount} for your plan.</span>
              ) : null}
            </label>

            <label>
              Difficulty
              <select value={difficulty} onChange={(event) => setDifficulty(event.target.value)}>
                <option value="mixed">Mixed</option>
                <option value="core">Core</option>
                <option value="extension">Extension</option>
              </select>
            </label>

            <label>
              Question type
              <select value={questionStyle} onChange={(event) => setQuestionStyle(event.target.value)}>
                <option value="multiple-choice">Multiple choice</option>
                <option value="worded">Worded problems</option>
                <option value="mixed">Mixed</option>
              </select>
            </label>
          </>
        )}

        <label>
          Due date (optional)
          <input type="datetime-local" value={dueAt} onChange={(event) => setDueAt(event.target.value)} />
        </label>

        <button
          className="button primary"
          disabled={loading || (isSudoku ? !canUseSudoku : !canGenerateAi)}
          type="submit"
        >
          {loading ? "Creating..." : isSudoku ? "Assign Sudoku" : "Create and assign"}
        </button>
      </div>

      {message.text ? <div className={`message ${message.tone === "error" ? "error" : ""}`}>{message.text}</div> : null}

      {reviewJob?.clarityReport?.needsReview ? (
        <div className="quiz-clarity-review panel nested" role="alert">
          <p className="eyebrow">Clarity review</p>
          <h3 className="section-title">Review before assigning</h3>
          <p className="muted">{reviewJob.clarityReport.summary}</p>
          {reviewJob.diagramReport?.needsAttention ? (
            <p className="muted">{reviewJob.diagramReport.summary}</p>
          ) : null}
          <ul className="quiz-clarity-issues">
            {(reviewJob.clarityReport.questions || [])
              .filter((row) => row.needsReview)
              .map((row) => (
                <li key={row.index}>
                  <strong>Question {row.index + 1}</strong>
                  {row.issues?.length ? (
                    <ul>
                      {row.issues.map((issue) => (
                        <li key={issue}>{issue}</li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              ))}
          </ul>
          <div className="row">
            <button className="button primary" disabled={loading} onClick={assignReviewedQuiz} type="button">
              Assign anyway
            </button>
            <button className="button secondary" disabled={loading} onClick={dismissReview} type="button">
              Dismiss preview
            </button>
          </div>
        </div>
      ) : null}
    </form>
  );
}
