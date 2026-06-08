import { NextResponse } from "next/server";
import { requireApiSession } from "../../../../../lib/auth.js";
import { deleteStudentForParent, updateStudentForParent } from "../../../../../lib/db.js";

export const runtime = "nodejs";

export async function PATCH(request, { params }) {
  const session = await requireApiSession("parent");
  if (session.error) {
    return NextResponse.json({ error: session.error }, { status: session.status });
  }

  const { studentId } = await params;
  const body = await request.json();

  try {
    const student = updateStudentForParent({
      parentId: session.user.id,
      studentId: Number(studentId),
      yearLevel: body.yearLevel,
      name: String(body.name || ""),
      username: String(body.username || ""),
      email: String(body.email || ""),
      password: String(body.password || ""),
      learningNeeds: body.learningNeeds,
    });
    return NextResponse.json({ student });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}

export async function DELETE(_request, { params }) {
  const session = await requireApiSession("parent");
  if (session.error) {
    return NextResponse.json({ error: session.error }, { status: session.status });
  }

  const { studentId } = await params;
  try {
    const result = deleteStudentForParent({
      parentId: session.user.id,
      studentId: Number(studentId),
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
