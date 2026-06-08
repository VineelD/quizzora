import { NextResponse } from "next/server";
import { requireApiSession } from "../../../../lib/auth.js";
import { updateSchoolForAdmin } from "../../../../lib/db.js";

export const runtime = "nodejs";

export async function PATCH(request) {
  const session = await requireApiSession("admin");
  if (session.error) {
    return NextResponse.json({ error: session.error }, { status: session.status });
  }

  const body = await request.json();
  try {
    const school = updateSchoolForAdmin({
      adminId: session.user.id,
      name: body.name,
      allowLateSubmissions: body.allowLateSubmissions,
    });
    return NextResponse.json({ school });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
