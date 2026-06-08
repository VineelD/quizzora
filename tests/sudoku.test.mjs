import assert from "node:assert/strict";
import test from "node:test";
import {
  canSubmitSudoku,
  cellHasConflict,
  generateSudokuPuzzle,
  gridsMatch,
  isSudokuComplete,
  isSudokuSolved,
  isValidSudokuGrid,
  normalizeSudokuDifficulty,
  normalizeSudokuGrid,
} from "../lib/sudoku.js";

test("normalizeSudokuDifficulty falls back to Medium", () => {
  assert.equal(normalizeSudokuDifficulty("Hard"), "Hard");
  assert.equal(normalizeSudokuDifficulty("unknown"), "Medium");
});

test("generateSudokuPuzzle returns a playable puzzle with matching solution", () => {
  const puzzle = generateSudokuPuzzle("Easy");
  assert.equal(puzzle.type, "sudoku");
  assert.equal(puzzle.difficulty, "Easy");
  assert.equal(puzzle.puzzle.length, 9);
  assert.equal(puzzle.solution.length, 9);
  assert.ok(puzzle.puzzle.some((row) => row.some((value) => value === 0)));
  assert.ok(isSudokuComplete(puzzle.solution));
  assert.ok(isValidSudokuGrid(structuredClone(puzzle.solution)));
});

test("canSubmitSudoku accepts any valid completion that matches clues", () => {
  const generated = generateSudokuPuzzle("Easy");
  assert.ok(canSubmitSudoku(generated.solution, generated.puzzle));

  const incomplete = structuredClone(generated.puzzle);
  assert.equal(canSubmitSudoku(incomplete, generated.puzzle), false);

  const normalized = normalizeSudokuGrid(
    generated.solution.map((row) => row.map((value) => String(value))),
  );
  assert.ok(canSubmitSudoku(normalized, generated.puzzle));
});

test("isSudokuSolved validates a completed grid against the solution", () => {
  const puzzle = generateSudokuPuzzle("Medium");
  assert.ok(isSudokuSolved(puzzle.solution, puzzle.solution));
  const wrong = structuredClone(puzzle.solution);
  wrong[0][0] = wrong[0][0] === 1 ? 2 : 1;
  assert.equal(isSudokuSolved(wrong, puzzle.solution), false);
});

test("cellHasConflict only flags duplicate values in row, column, or box", () => {
  const grid = Array.from({ length: 9 }, () => Array(9).fill(0));
  grid[0][0] = 4;
  grid[0][3] = 4;
  assert.equal(cellHasConflict(grid, 0, 0), true);

  grid[0][3] = 0;
  assert.equal(cellHasConflict(grid, 0, 0), false);

  grid[0][0] = 4;
  grid[3][0] = 4;
  assert.equal(cellHasConflict(grid, 0, 0), true);

  grid[3][0] = 0;
  grid[1][1] = 4;
  assert.equal(cellHasConflict(grid, 0, 0), true);
});

test("gridsMatch compares two grids", () => {
  const left = [
    [1, 2, 3],
    [4, 5, 6],
  ];
  const right = [
    [1, 2, 3],
    [4, 5, 6],
  ];
  assert.ok(gridsMatch(left, right));
  assert.equal(gridsMatch(left, [[1, 2, 3]]), false);
});
