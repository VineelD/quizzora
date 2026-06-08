import { NextResponse } from "next/server";
import { EDUCATOR_ROLES, requireApiSession } from "../../../../lib/auth.js";
import { insertSudokuAssignment } from "../../../../lib/db.js";
import { normalizeSudokuDifficulty } from "../../../../lib/sudoku.js";
import { normalizeYearLevel } from "../../../../lib/year-levels.js";

export const runtime = "nodejs";

export async function POST(request) {
  const session = await requireApiSession(EDUCATOR_ROLES, { feature: "sudoku" });
  if (session.error) {
    return NextResponse.json({ error: session.error }, { status: session.status });
  }
  const teacher = session.user;
  const body = await request.json();
  const yearLevel = normalizeYearLevel(body.yearLevel);
  const difficulty = normalizeSudokuDifficulty(body.difficulty);

  const saved = insertSudokuAssignment({
    teacherId: teacher.id,
    yearLevel,
    difficulty,
    dueAt: body.dueAt || null,
  });

  return NextResponse.json({
    ...saved,
    yearLevel,
    difficulty,
    source: "Generated puzzle",
  });
}
