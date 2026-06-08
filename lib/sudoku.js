const SIZE = 9;
const BOX = 3;

const SAMPLE_SOLUTION = [
  [5, 3, 4, 6, 7, 8, 9, 1, 2],
  [6, 7, 2, 1, 9, 5, 3, 4, 8],
  [1, 9, 8, 3, 4, 2, 5, 6, 7],
  [8, 5, 9, 7, 6, 1, 4, 2, 3],
  [4, 2, 6, 8, 5, 3, 7, 9, 1],
  [7, 1, 3, 9, 2, 4, 8, 5, 6],
  [9, 6, 1, 5, 3, 7, 2, 8, 4],
  [2, 8, 7, 4, 1, 9, 6, 3, 5],
  [3, 4, 5, 2, 8, 6, 1, 7, 9],
];

const GIVENS_BY_DIFFICULTY = {
  Easy: 42,
  Medium: 34,
  Hard: 28,
};

export function normalizeSudokuDifficulty(value) {
  const clean = String(value || "Medium").trim();
  return Object.prototype.hasOwnProperty.call(GIVENS_BY_DIFFICULTY, clean) ? clean : "Medium";
}

function cloneGrid(grid) {
  return grid.map((row) => [...row]);
}

function shuffle(values) {
  const copy = [...values];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

function permuteRows(grid) {
  const next = cloneGrid(grid);
  for (let band = 0; band < SIZE; band += BOX) {
    const order = shuffle([0, 1, 2]).map((offset) => band + offset);
    const rows = order.map((rowIndex) => next[rowIndex]);
    next.splice(band, BOX, ...rows);
  }
  return next;
}

function transpose(grid) {
  return Array.from({ length: SIZE }, (_, row) => grid.map((line) => line[row]));
}

function transformSolution(grid) {
  const digitMap = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  const mapped = grid.map((row) => row.map((value) => digitMap[value - 1]));
  return permuteRows(transpose(permuteRows(mapped)));
}

function createPuzzleFromSolution(solution, givens) {
  const puzzle = cloneGrid(solution);
  const cells = shuffle(
    Array.from({ length: SIZE * SIZE }, (_, index) => ({
      row: Math.floor(index / SIZE),
      col: index % SIZE,
    })),
  );

  let remaining = SIZE * SIZE - givens;
  for (const cell of cells) {
    if (remaining <= 0) {
      break;
    }
    if (puzzle[cell.row][cell.col] === 0) {
      continue;
    }
    puzzle[cell.row][cell.col] = 0;
    remaining -= 1;
  }

  return puzzle;
}

export function generateSudokuPuzzle(difficulty = "Medium") {
  const normalized = normalizeSudokuDifficulty(difficulty);
  const solution = transformSolution(SAMPLE_SOLUTION);
  const puzzle = createPuzzleFromSolution(solution, GIVENS_BY_DIFFICULTY[normalized]);
  return {
    type: "sudoku",
    difficulty: normalized,
    puzzle,
    solution,
  };
}

function rowHasConflict(grid, row, value) {
  return grid[row].some((cell) => cell === value);
}

function colHasConflict(grid, col, value) {
  return grid.some((row) => row[col] === value);
}

function boxHasConflict(grid, row, col, value) {
  const startRow = Math.floor(row / BOX) * BOX;
  const startCol = Math.floor(col / BOX) * BOX;
  for (let r = startRow; r < startRow + BOX; r += 1) {
    for (let c = startCol; c < startCol + BOX; c += 1) {
      if (grid[r][c] === value) {
        return true;
      }
    }
  }
  return false;
}

export function isValidSudokuGrid(grid) {
  if (!Array.isArray(grid) || grid.length !== SIZE) {
    return false;
  }

  for (const row of grid) {
    if (!Array.isArray(row) || row.length !== SIZE) {
      return false;
    }
    for (const value of row) {
      if (!Number.isInteger(value) || value < 0 || value > 9) {
        return false;
      }
    }
  }

  for (let row = 0; row < SIZE; row += 1) {
    for (let col = 0; col < SIZE; col += 1) {
      const value = grid[row][col];
      if (value === 0) {
        continue;
      }
      grid[row][col] = 0;
      const valid =
        !rowHasConflict(grid, row, value) &&
        !colHasConflict(grid, col, value) &&
        !boxHasConflict(grid, row, col, value);
      grid[row][col] = value;
      if (!valid) {
        return false;
      }
    }
  }

  return true;
}

export function isSudokuComplete(grid) {
  return (
    Array.isArray(grid) &&
    grid.length === SIZE &&
    grid.every((row) => Array.isArray(row) && row.length === SIZE && row.every((value) => value >= 1 && value <= 9))
  );
}

export function gridsMatch(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
    return false;
  }
  return left.every((row, rowIndex) =>
    Array.isArray(row) &&
    Array.isArray(right[rowIndex]) &&
    row.length === right[rowIndex].length &&
    row.every((value, colIndex) => value === right[rowIndex][colIndex]),
  );
}

export function isSudokuSolved(grid, solution) {
  return isSudokuComplete(grid) && isValidSudokuGrid(cloneGrid(grid)) && gridsMatch(grid, solution);
}

export function normalizeSudokuGrid(grid) {
  if (!Array.isArray(grid) || grid.length !== SIZE) {
    return null;
  }

  const normalized = [];
  for (let row = 0; row < SIZE; row += 1) {
    if (!Array.isArray(grid[row]) || grid[row].length !== SIZE) {
      return null;
    }
    normalized.push(
      grid[row].map((cell) => {
        const value = Number(cell);
        return Number.isInteger(value) && value >= 0 && value <= 9 ? value : 0;
      }),
    );
  }

  return normalized;
}

export function matchesSudokuClues(grid, clues) {
  if (!Array.isArray(clues) || clues.length !== SIZE) {
    return false;
  }

  for (let row = 0; row < SIZE; row += 1) {
    if (!Array.isArray(clues[row]) || clues[row].length !== SIZE) {
      return false;
    }
    for (let col = 0; col < SIZE; col += 1) {
      const clue = clues[row][col];
      if (clue !== 0 && grid[row][col] !== clue) {
        return false;
      }
    }
  }

  return true;
}

export function gridHasConflicts(grid) {
  for (let row = 0; row < SIZE; row += 1) {
    for (let col = 0; col < SIZE; col += 1) {
      if (cellHasConflict(grid, row, col)) {
        return true;
      }
    }
  }
  return false;
}

export function canSubmitSudoku(grid, clues) {
  const normalized = normalizeSudokuGrid(grid);
  if (!normalized) {
    return false;
  }

  return (
    isSudokuComplete(normalized) &&
    isValidSudokuGrid(cloneGrid(normalized)) &&
    matchesSudokuClues(normalized, clues)
  );
}

export function countValueInBox(grid, row, col, value) {
  const startRow = Math.floor(row / BOX) * BOX;
  const startCol = Math.floor(col / BOX) * BOX;
  let count = 0;
  for (let r = startRow; r < startRow + BOX; r += 1) {
    for (let c = startCol; c < startCol + BOX; c += 1) {
      if (grid[r][c] === value) {
        count += 1;
      }
    }
  }
  return count;
}

export function cellHasConflict(grid, row, col) {
  const value = grid[row]?.[col];
  if (!value) {
    return false;
  }
  return (
    grid[row].filter((cell) => cell === value).length > 1 ||
    grid.map((line) => line[col]).filter((cell) => cell === value).length > 1 ||
    countValueInBox(grid, row, col, value) > 1
  );
}
