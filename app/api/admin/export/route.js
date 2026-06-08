import { NextResponse } from "next/server";
import { requireApiSession } from "../../../../lib/auth.js";
import { exportSchoolMarksCsv, exportSchoolStudentsCsv } from "../../../../lib/db.js";
import { logAudit } from "../../../../lib/audit.js";

export const runtime = "nodejs";

export async function GET(request) {
  const session = await requireApiSession("admin", { feature: "csvExport" });
  if (session.error) {
    return NextResponse.json({ error: session.error }, { status: session.status });
  }

  const type = new URL(request.url).searchParams.get("type");
  if (type !== "students" && type !== "marks") {
    return NextResponse.json({ error: "Invalid export type. Use students or marks." }, { status: 400 });
  }

  const schoolId = session.user.school_id;
  if (!schoolId) {
    return NextResponse.json({ error: "No school linked to this admin account." }, { status: 400 });
  }

  const csv = type === "students" ? exportSchoolStudentsCsv(schoolId) : exportSchoolMarksCsv(schoolId);
  const filename = type === "students" ? `school-${schoolId}-students.csv` : `school-${schoolId}-marks.csv`;

  logAudit({
    actorId: session.user.id,
    actorRole: "admin",
    action: "school.exported",
    entityType: "school",
    entityId: schoolId,
    summary: `Exported school ${type} CSV`,
    metadata: { type },
  });

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
