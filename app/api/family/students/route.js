import { NextResponse } from "next/server";
import { requireApiSession } from "../../../../lib/auth.js";
import { createStudentForParent, listFamilyStudents } from "../../../../lib/db.js";

export const runtime = "nodejs";

export async function GET() {
  const session = await requireApiSession("parent");
  if (session.error) {
    return NextResponse.json({ error: session.error }, { status: session.status });
  }

  return NextResponse.json({
    students: listFamilyStudents(session.user.family_id),
  });
}

export async function POST(request) {
  const session = await requireApiSession("parent", { feature: "addStudent" });
  if (session.error) {
    return NextResponse.json({ error: session.error }, { status: session.status });
  }

  const body = await request.json();
  try {
    const student = createStudentForParent({
      parentId: session.user.id,
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
