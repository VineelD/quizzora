import { NextResponse } from "next/server";
import { requireApiSession } from "../../../../../lib/auth.js";
import { deleteTeacherForAdmin } from "../../../../../lib/db.js";

export const runtime = "nodejs";

export async function DELETE(_request, { params }) {
  const session = await requireApiSession("admin");
  if (session.error) {
    return NextResponse.json({ error: session.error }, { status: session.status });
  }

  const { teacherId } = await params;
  try {
    const result = deleteTeacherForAdmin({
      adminId: session.user.id,
      teacherId: Number(teacherId),
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
