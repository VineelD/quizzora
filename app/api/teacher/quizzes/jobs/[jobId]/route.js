import { NextResponse } from "next/server";
import { EDUCATOR_ROLES, requireApiSession } from "../../../../../../lib/auth.js";
import { getQuizGenerationJobForUser, serializeQuizJobForClient } from "../../../../../../lib/quiz-jobs.js";

export const runtime = "nodejs";

export async function GET(_request, { params }) {
  try {
    const session = await requireApiSession(EDUCATOR_ROLES, { skipBilling: true });
    if (session.error) {
      return NextResponse.json({ error: session.error }, { status: session.status });
    }

    const { jobId } = await params;
    const job = getQuizGenerationJobForUser(jobId, session.user.id);
    if (!job) {
      return NextResponse.json({ error: "Job not found." }, { status: 404 });
    }

    return NextResponse.json(serializeQuizJobForClient(job));
  } catch (error) {
    console.error("GET /api/teacher/quizzes/jobs/[jobId] failed:", error);
    return NextResponse.json(
      { error: error.message || "Could not load job status." },
      { status: error.statusCode || 500 },
    );
  }
}
