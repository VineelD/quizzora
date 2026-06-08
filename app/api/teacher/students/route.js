import { NextResponse } from "next/server";
import { EDUCATOR_ROLES, requireApiSession } from "../../../../lib/auth.js";
import { createStudentForTeacher, getTeacherStudents } from "../../../../lib/db.js";
import { sendStudentWelcomeEmail } from "../../../../lib/student-mail.js";

export const runtime = "nodejs";

export async function GET() {
  const session = await requireApiSession(EDUCATOR_ROLES);
  if (session.error) {
    return NextResponse.json({ error: session.error }, { status: session.status });
  }

  return NextResponse.json({ students: getTeacherStudents(session.user.id) });
}

export async function POST(request) {
  const session = await requireApiSession(EDUCATOR_ROLES, { feature: "addStudent" });
  if (session.error) {
    return NextResponse.json({ error: session.error }, { status: session.status });
  }

  const body = await request.json();
  try {
    const password = String(body.password || "");
    const student = createStudentForTeacher({
      teacherId: session.user.id,
      name: String(body.name || ""),
      username: String(body.username || ""),
      email: String(body.email || ""),
      password,
      yearLevel: String(body.yearLevel || "Year 7"),
      guardianEmail: String(body.guardianEmail || ""),
      learningNeeds: String(body.learningNeeds || ""),
      actorId: session.user.id,
      actorRole: session.user.role,
    });

    let emailSent = false;
    if (body.sendInvite !== false && student.email) {
      try {
        await sendStudentWelcomeEmail({ student, password });
        emailSent = true;
      } catch {
        emailSent = false;
      }
    }

    return NextResponse.json({ student, emailSent });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: error.statusCode || 400 });
  }
}
