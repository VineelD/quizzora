import { NextResponse } from "next/server";
import { requireApiSession } from "../../../../lib/auth.js";
import { submitAssignment } from "../../../../lib/db.js";

export const runtime = "nodejs";

export async function POST(request) {
  const session = await requireApiSession("student");
  if (session.error) {
    return NextResponse.json({ error: session.error }, { status: session.status });
  }
  const student = session.user;
  const body = await request.json();

  try {
    const result = submitAssignment({
      studentId: student.id,
      assignmentId: Number(body.assignmentId),
      answers: body.answers || {},
      timeSpentMs: body.timeSpentMs,
      overallElapsedMs: body.overallElapsedMs,
      timedOutQuestions: body.timedOutQuestions,
      sudokuGrid: body.sudokuGrid,
      elapsedSeconds: body.elapsedSeconds,
      mistakes: body.mistakes,
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
