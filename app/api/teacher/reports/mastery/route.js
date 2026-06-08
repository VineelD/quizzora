import { NextResponse } from "next/server";
import { EDUCATOR_ROLES, requireApiSession } from "../../../../../lib/auth.js";
import { getTopicMasteryReport } from "../../../../../lib/teacher-reporting.js";

export const runtime = "nodejs";

function parseOptionalInt(value) {
  if (value == null || value === "") {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function GET(request) {
  const session = await requireApiSession(EDUCATOR_ROLES, { skipBilling: true });
  if (session.error) {
    return NextResponse.json({ error: session.error }, { status: session.status });
  }

  const { searchParams } = new URL(request.url);
  const classId = parseOptionalInt(searchParams.get("classId"));
  const studentId = parseOptionalInt(searchParams.get("studentId"));
  const limit = parseOptionalInt(searchParams.get("limit"));
  const fromDate = searchParams.get("from") || null;
  const toDate = searchParams.get("to") || null;

  const report = getTopicMasteryReport({
    teacherId: session.user.id,
    classId,
    studentId,
    limit: limit ?? undefined,
    fromDate,
    toDate,
  });

  if (!report) {
    return NextResponse.json({ error: "Class or student not found." }, { status: 404 });
  }

  return NextResponse.json(report);
}
