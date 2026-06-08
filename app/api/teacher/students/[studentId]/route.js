import { NextResponse } from "next/server";
import { EDUCATOR_ROLES, requireApiSession } from "../../../../../lib/auth.js";
import {
  deleteStudentForTeacher,
  getTeacherStudent,
  updateStudentForTeacher,
} from "../../../../../lib/db.js";

export const runtime = "nodejs";

function parseStudentId(params) {
  const studentId = Number(params.studentId);
  if (!Number.isInteger(studentId) || studentId <= 0) {
    return null;
  }
  return studentId;
}

export async function GET(_request, { params }) {
  const session = await requireApiSession(EDUCATOR_ROLES);
  if (session.error) {
    return NextResponse.json({ error: session.error }, { status: session.status });
  }

  const studentId = parseStudentId(await params);
  if (!studentId) {
    return NextResponse.json({ error: "Invalid student id." }, { status: 400 });
  }

  const student = getTeacherStudent(session.user.id, studentId);
  if (!student) {
    return NextResponse.json({ error: "Student not found." }, { status: 404 });
  }

  return NextResponse.json({ student });
}

export async function PATCH(request, { params }) {
  const session = await requireApiSession(EDUCATOR_ROLES);
  if (session.error) {
    return NextResponse.json({ error: session.error }, { status: session.status });
  }

  const studentId = parseStudentId(await params);
  if (!studentId) {
    return NextResponse.json({ error: "Invalid student id." }, { status: 400 });
  }

  const body = await request.json();
  try {
    const student = updateStudentForTeacher({
      teacherId: session.user.id,
      studentId,
      name: String(body.name || ""),
      username: String(body.username || ""),
      email: String(body.email || ""),
      password: String(body.password || ""),
      yearLevel: String(body.yearLevel || "Year 7"),
      guardianEmail: String(body.guardianEmail || ""),
      learningNeeds: String(body.learningNeeds || ""),
    });
    return NextResponse.json({ student });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: error.statusCode || 400 });
  }
}

export async function DELETE(_request, { params }) {
  const session = await requireApiSession(EDUCATOR_ROLES);
  if (session.error) {
    return NextResponse.json({ error: session.error }, { status: session.status });
  }

  const studentId = parseStudentId(await params);
  if (!studentId) {
    return NextResponse.json({ error: "Invalid student id." }, { status: 400 });
  }

  try {
    const result = deleteStudentForTeacher({
      teacherId: session.user.id,
      studentId,
    });
    return NextResponse.json(result);
  } catch (error) {
    const status = /not found/i.test(error.message) ? 404 : 400;
    return NextResponse.json({ error: error.message }, { status });
  }
}
