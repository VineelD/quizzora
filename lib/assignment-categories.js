export const SUDOKU_CATEGORY = "Sudoku";
export const SUDOKU_SUBJECT = "Sudoku";

export function getCreatorCategories(yearLevels) {
  return [...yearLevels, SUDOKU_CATEGORY];
}

export function isSudokuCategory(value) {
  return String(value || "").trim() === SUDOKU_CATEGORY;
}

export function isSudokuAssignment(assignment) {
  return assignment?.subject === SUDOKU_SUBJECT;
}
