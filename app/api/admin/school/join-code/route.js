import { NextResponse } from "next/server";
import { requireApiSession } from "../../../../../lib/auth.js";
import { logAudit } from "../../../../../lib/audit.js";
import { regenerateSchoolJoinCode } from "../../../../../lib/schools.js";

export const runtime = "nodejs";

export async function POST() {
  const session = await requireApiSession("admin");
  if (session.error) {
    return NextResponse.json({ error: session.error }, { status: session.status });
  }

  const admin = session.user;
  if (!admin.school_id) {
    return NextResponse.json({ error: "School not configured." }, { status: 400 });
  }

  try {
    const school = regenerateSchoolJoinCode(admin.school_id);
    logAudit({
      actorId: admin.id,
      actorRole: "admin",
      action: "school.join_code_regenerated",
      entityType: "school",
      entityId: school.id,
      summary: "Regenerated teacher join code",
    });
    return NextResponse.json({ school });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
