import { NextResponse } from "next/server";
import { isStudyCoachStreamingAvailable } from "../../../../lib/study-coach-llm.js";
import { requireApiSession } from "../../../../lib/auth.js";
import {
  getStudySession,
  postStudyMessage,
  studyCoachAvailableForAssignment,
  studyCoachRequiredForAssignment,
} from "../../../../lib/study.js";
import { getStudentAssignment } from "../../../../lib/db.js";

export const runtime = "nodejs";
export const maxDuration = 120;

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
    return NextResponse.json({
      required: false,
      available: false,
      enabled: false,
      progress: { unlocked: true },
      messages: [],
      context: null,
    });
  }

  const study = getStudySession(session.user.id, assignmentId);
  if (!study) {
    return NextResponse.json({ error: "Assignment not found." }, { status: 404 });
  }

  return NextResponse.json({
    required: studyCoachRequiredForAssignment(assignment),
    available: true,
    enabled: study.enabled,
    context: study.context,
    requirements: study.requirements,
    progress: study.progress,
    messages: study.messages,
    openAiResponseId: study.openAiResponseId,
    quizSubmitted: study.quizSubmitted,
    streamingEnabled: isStudyCoachStreamingAvailable(),
  });
}

export async function POST(request) {
  const session = await requireApiSession("student");
  if (session.error) {
    return NextResponse.json({ error: session.error }, { status: session.status });
  }

  const body = await request.json();
  const assignmentId = Number(body.assignmentId);
  const message = String(body.message || "").trim();

  if (!assignmentId) {
    return NextResponse.json({ error: "assignmentId is required." }, { status: 400 });
  }
  if (!message) {
    return NextResponse.json({ error: "message is required." }, { status: 400 });
  }

  const assignment = getStudentAssignment(session.user.id, assignmentId);
  if (!assignment) {
    return NextResponse.json({ error: "Assignment not found." }, { status: 404 });
  }
  if (!studyCoachAvailableForAssignment(assignment)) {
    return NextResponse.json({ error: "Study Coach is not available for this assignment." }, { status: 400 });
  }

  try {
    const result = await postStudyMessage({
      studentId: session.user.id,
      assignmentId,
      message,
      requestNarration: body.requestNarration === true,
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
