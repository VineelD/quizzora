import { NextResponse } from "next/server";
import { requireApiSession } from "../../../../lib/auth.js";
import { createTeacherForAdmin } from "../../../../lib/db.js";

export const runtime = "nodejs";

export async function POST(request) {
  const session = await requireApiSession("admin", { feature: "addTeacher" });
  if (session.error) {
    return NextResponse.json({ error: session.error }, { status: session.status });
  }

  const body = await request.json();
  try {
    const teacher = createTeacherForAdmin({
      adminId: session.user.id,
      name: String(body.name || ""),
      email: String(body.email || ""),
      password: String(body.password || ""),
    });
    return NextResponse.json({ teacher });
  } catch (error) {
    const message = String(error.message || "Could not create teacher.");
    if (message.includes("UNIQUE constraint failed")) {
      return NextResponse.json(
        {
          error:
            "That email or username is already registered. If they belong to another school, restart the app after the latest update and try again.",
        },
        { status: 400 },
      );
    }
    return NextResponse.json({ error: message }, { status: error.statusCode || 400 });
  }
}
