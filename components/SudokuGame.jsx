"use client";

import { useEffect, useMemo, useState } from "react";
import {
  canSubmitSudoku,
  cellHasConflict,
  gridHasConflicts,
  isSudokuComplete,
  matchesSudokuClues,
  normalizeSudokuGrid,
} from "../lib/sudoku.js";

function cloneGrid(grid) {
  return grid.map((row) => [...row]);
}

function formatTime(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export default function SudokuGame({ puzzle, assignmentId, readOnly = false, initialGrid = null }) {
  const [grid, setGrid] = useState(() => cloneGrid(initialGrid || puzzle));
  const [selected, setSelected] = useState(null);
  const [mistakes, setMistakes] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const fixedCells = useMemo(() => {
    const map = new Set();
    for (let row = 0; row < puzzle.length; row += 1) {
      for (let col = 0; col < puzzle[row].length; col += 1) {
        if (puzzle[row][col] !== 0) {
          map.add(`${row}-${col}`);
        }
      }
    }
    return map;
  }, [puzzle]);

  const canSubmit = useMemo(() => canSubmitSudoku(grid, puzzle), [grid, puzzle]);

  useEffect(() => {
    if (readOnly) {
      return undefined;
    }
    const timer = window.setInterval(() => {
      setElapsedSeconds((value) => value + 1);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [readOnly]);

  function selectCell(row, col) {
    if (readOnly || fixedCells.has(`${row}-${col}`)) {
      return;
    }
    setSelected({ row, col });
  }

  function setCellValue(value) {
    if (!selected || readOnly) {
      return;
    }
    const { row, col } = selected;
    if (fixedCells.has(`${row}-${col}`)) {
      return;
    }

    const next = cloneGrid(grid);
    const previous = next[row][col];
    next[row][col] = value;
    setGrid(next);
    setMessage("");

    if (value !== 0 && value !== previous && cellHasConflict(next, row, col)) {
      setMistakes((count) => count + 1);
    }
  }

  function submitHint() {
    const normalized = normalizeSudokuGrid(grid);
    if (!normalized) {
      return "Enter a valid grid before submitting.";
    }
    if (!isSudokuComplete(normalized)) {
      return "Fill every cell before submitting.";
    }
    if (gridHasConflicts(normalized)) {
      return "Remove duplicate numbers in a row, column, or box.";
    }
    if (!matchesSudokuClues(normalized, puzzle)) {
      return "Starting clues cannot be changed.";
    }
    return "Complete the puzzle correctly before submitting.";
  }

  async function submitSudoku(event) {
    event.preventDefault();
    if (!canSubmit) {
      setMessage(submitHint());
      return;
    }

    setLoading(true);
    setMessage("");

    const response = await fetch("/api/student/submissions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        assignmentId,
        sudokuGrid: grid,
        elapsedSeconds,
        mistakes,
      }),
    });
    const payload = await response.json();
    setLoading(false);

    if (!response.ok) {
      setMessage(payload.error || "Could not submit Sudoku.");
      return;
    }

    setMessage("Submitted. Great work!");
    window.location.reload();
  }

  const keypad = [1, 2, 3, 4, 5, 6, 7, 8, 9];

  return (
    <form className="panel sudoku-panel" onSubmit={submitSudoku}>
      <div className="row sudoku-meta">
        <span className="tag">Time: {formatTime(elapsedSeconds)}</span>
        <span className="tag">Mistakes: {mistakes}</span>
      </div>

      <div className="sudoku-board" role="grid" aria-label="Sudoku board">
        {grid.map((row, rowIndex) =>
          row.map((value, colIndex) => {
            const key = `${rowIndex}-${colIndex}`;
            const isFixed = fixedCells.has(key);
            const isSelected = selected?.row === rowIndex && selected?.col === colIndex;
            const isConflict = cellHasConflict(grid, rowIndex, colIndex);
            return (
              <button
                aria-label={`Row ${rowIndex + 1} column ${colIndex + 1}`}
                className={`sudoku-cell${isFixed ? " fixed" : ""}${isSelected ? " selected" : ""}${value === 0 ? " empty" : ""}${isConflict ? " conflict" : ""}`}
                data-col={colIndex}
                data-row={rowIndex}
                disabled={readOnly}
                key={key}
                onClick={() => selectCell(rowIndex, colIndex)}
                type="button"
              >
                {value === 0 ? "" : value}
              </button>
            );
          }),
        )}
      </div>

      {!readOnly ? (
        <>
          <div className="sudoku-keypad">
            {keypad.map((digit) => (
              <button className="button secondary" key={digit} onClick={() => setCellValue(digit)} type="button">
                {digit}
              </button>
            ))}
            <button className="button secondary" onClick={() => setCellValue(0)} type="button">
              Clear
            </button>
          </div>
          <button className="button primary submit-wide" disabled={loading || !canSubmit} type="submit">
            {loading ? "Submitting..." : canSubmit ? "Submit completed puzzle" : "Complete the grid to submit"}
          </button>
          {canSubmit ? <p className="muted">Puzzle complete — you can submit.</p> : null}
        </>
      ) : null}

      {message ? <div className="message">{message}</div> : null}
    </form>
  );
}
