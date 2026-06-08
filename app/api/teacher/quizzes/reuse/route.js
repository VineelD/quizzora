import { NextResponse } from "next/server";
import { EDUCATOR_ROLES, requireApiSession } from "../../../../../lib/auth.js";
import { assignExistingQuiz } from "../../../../../lib/db.js";
import { normalizeYearLevel } from "../../../../../lib/year-levels.js";

export const runtime = "nodejs";

export async function POST(request) {
  const session = await requireApiSession(EDUCATOR_ROLES, { feature: "quizReuse" });
  if (session.error) {
    return NextResponse.json({ error: session.error }, { status: session.status });
  }

  const body = await request.json();
  try {
    const result = assignExistingQuiz({
      teacherId: session.user.id,
      quizId: Number(body.quizId),
      yearLevel: normalizeYearLevel(body.yearLevel),
      dueAt: body.dueAt || null,
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: error.statusCode || 400 });
  }
}
