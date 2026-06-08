import { NextResponse } from "next/server";
import { EDUCATOR_ROLES, requireApiSession } from "../../../../../../lib/auth.js";
import { exportAssignmentMarksCsv } from "../../../../../../lib/db.js";

export const runtime = "nodejs";

export async function GET(_request, { params }) {
  const session = await requireApiSession(EDUCATOR_ROLES, { feature: "csvExport" });
  if (session.error) {
    return NextResponse.json({ error: session.error }, { status: session.status });
  }

  const { assignmentId } = await params;
  try {
    const csv = exportAssignmentMarksCsv(session.user.id, Number(assignmentId));
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="assignment-${assignmentId}-marks.csv"`,
      },
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }
}
