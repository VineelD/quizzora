import { NextResponse } from "next/server";
import { EDUCATOR_ROLES, requireApiSession } from "../../../../../../lib/auth.js";
import { getTeacherStudent } from "../../../../../../lib/db.js";
import { sendGuardianProgressLink } from "../../../../../../lib/guardian-access.js";

export const runtime = "nodejs";

export async function POST(_request, { params }) {
  const session = await requireApiSession(EDUCATOR_ROLES, { feature: "guardian" });
  if (session.error) {
    return NextResponse.json({ error: session.error }, { status: session.status });
  }

  const { studentId } = await params;
  const student = getTeacherStudent(session.user.id, Number(studentId));
  if (!student) {
    return NextResponse.json({ error: "Student not found." }, { status: 404 });
  }

  try {
    const result = await sendGuardianProgressLink(Number(studentId));
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
