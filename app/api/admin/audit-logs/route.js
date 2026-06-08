import { NextResponse } from "next/server";
import { countAuditLogsForSchool, listAuditLogsForSchool } from "../../../../lib/audit.js";
import { requireApiSession } from "../../../../lib/auth.js";

export const runtime = "nodejs";

export async function GET(request) {
  const session = await requireApiSession("admin");
  if (session.error) {
    return NextResponse.json({ error: session.error }, { status: session.status });
  }

  const admin = session.user;
  if (!admin.school_id) {
    return NextResponse.json({ error: "School not configured for this admin." }, { status: 400 });
  }

  const params = new URL(request.url).searchParams;
  const limit = Number(params.get("limit") || 100);
  const offset = Number(params.get("offset") || 0);

  const logs = listAuditLogsForSchool(admin.school_id, { limit, offset });
  const total = countAuditLogsForSchool(admin.school_id);

  return NextResponse.json({ logs, total, limit, offset });
}
