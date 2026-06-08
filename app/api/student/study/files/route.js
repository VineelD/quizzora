import { NextResponse } from "next/server";
import { requireApiSession } from "../../../../../lib/auth.js";
import { getStudentAssignment } from "../../../../../lib/db.js";
import { createStudyCoachFile, listStudyCoachFiles } from "../../../../../lib/study-files.js";
import { studyCoachAvailableForAssignment } from "../../../../../lib/study.js";

export const runtime = "nodejs";

export async function GET(request) {
  const session = await requireApiSession("student");
  if (session.error) {
    return NextResponse.json({ error: session.error }, { status: session.status });
  }

  const assignmentId = Number(new URL(request.url).searchParams.get("assignmentId"));
  if (!assignmentId) {
    return NextResponse.json({ error: "assignmentId is required." }, { status: 400 });
  }

  const assignment = getStudentAssignment(session.user.id, assignmentId);
  if (!assignment) {
    return NextResponse.json({ error: "Assignment not found." }, { status: 404 });
  }

  if (!studyCoachAvailableForAssignment(assignment)) {
    return NextResponse.json({ files: [] });
  }

  return NextResponse.json({
    files: listStudyCoachFiles(session.user.id, assignmentId),
  });
}

export async function POST(request) {
  const session = await requireApiSession("student");
  if (session.error) {
    return NextResponse.json({ error: session.error }, { status: session.status });
  }

  const body = await request.json();
  const assignmentId = Number(body.assignmentId);
  const rawMessageId = body.messageId;
  const messageId =
    rawMessageId == null || rawMessageId === ""
      ? null
      : Number(rawMessageId);

  if (messageId != null && !Number.isFinite(messageId)) {
    return NextResponse.json({ error: "Invalid messageId." }, { status: 400 });
  }

  if (!assignmentId) {
    return NextResponse.json({ error: "assignmentId is required." }, { status: 400 });
  }

  const assignment = getStudentAssignment(session.user.id, assignmentId);
  if (!assignment) {
    return NextResponse.json({ error: "Assignment not found." }, { status: 404 });
  }

  if (!studyCoachAvailableForAssignment(assignment)) {
    return NextResponse.json({ error: "Study Coach is not available for this assignment." }, { status: 400 });
  }

  try {
    const result = await createStudyCoachFile({
      studentId: session.user.id,
      assignmentId,
      messageId,
      assignmentTitle: assignment.title,
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
