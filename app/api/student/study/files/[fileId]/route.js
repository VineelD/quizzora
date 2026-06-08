import { NextResponse } from "next/server";
import { requireApiSession } from "../../../../../../lib/auth.js";
import { getStudyCoachFileForStudent, readStudyCoachFileBuffer } from "../../../../../../lib/study-files.js";

export const runtime = "nodejs";

export async function GET(_request, { params }) {
  const session = await requireApiSession("student");
  if (session.error) {
    return NextResponse.json({ error: session.error }, { status: session.status });
  }

  const fileId = Number((await params).fileId);
  if (!fileId) {
    return NextResponse.json({ error: "Invalid file id." }, { status: 400 });
  }

  const file = getStudyCoachFileForStudent(session.user.id, fileId);
  if (!file) {
    return NextResponse.json({ error: "File not found." }, { status: 404 });
  }

  const buffer = readStudyCoachFileBuffer(file);
  if (!buffer) {
    return NextResponse.json({ error: "File not found." }, { status: 404 });
  }

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": file.contentType || "application/pdf",
      "Content-Disposition": `attachment; filename="${file.filename}"`,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
