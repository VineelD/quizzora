import { NextResponse } from "next/server";
import { EDUCATOR_ROLES, requireApiSession } from "../../../../lib/auth.js";
import { enqueueQuizGenerationJob, parseQuizRequestFromBody } from "../../../../lib/quiz-jobs.js";

export const runtime = "nodejs";

export async function POST(request) {
  try {
    const session = await requireApiSession(EDUCATOR_ROLES, { feature: "ai" });
    if (session.error) {
      return NextResponse.json({ error: session.error }, { status: session.status });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON request body." }, { status: 400 });
    }

    const quizRequest = parseQuizRequestFromBody(body, { subscription: session.subscription });
    const job = enqueueQuizGenerationJob({
      userId: session.user.id,
      payload: quizRequest,
    });

    const responseBody = { jobId: job.id, status: job.status };
    if (quizRequest.questionCountClamped) {
      responseBody.questionCountClamped = true;
      responseBody.questionCount = quizRequest.questionCount;
      responseBody.questionCountRequested = quizRequest.questionCountRequested;
      responseBody.questionCountPlanCap = quizRequest.questionCountPlanCap;
    }

    return NextResponse.json(responseBody, { status: 202 });
  } catch (error) {
    console.error("POST /api/teacher/quizzes failed:", error);
    return NextResponse.json(
      { error: error.message || "Quiz generation failed." },
      { status: error.statusCode || 500 },
    );
  }
}
