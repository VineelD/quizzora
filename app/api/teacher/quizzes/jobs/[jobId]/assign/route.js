import { NextResponse } from "next/server";
import { EDUCATOR_ROLES, requireApiSession } from "../../../../../../../lib/auth.js";
import {
  assignReviewedQuizJob,
  getQuizGenerationJobForUser,
  serializeQuizJobForClient,
} from "../../../../../../../lib/quiz-jobs.js";

export const runtime = "nodejs";

export async function POST(_request, { params }) {
  try {
    const session = await requireApiSession(EDUCATOR_ROLES, { feature: "ai" });
    if (session.error) {
      return NextResponse.json({ error: session.error }, { status: session.status });
    }

    const { jobId } = await params;
    const job = getQuizGenerationJobForUser(jobId, session.user.id);
    if (!job) {
      return NextResponse.json({ error: "Job not found." }, { status: 404 });
    }

    const updated = await assignReviewedQuizJob(job);
    return NextResponse.json(serializeQuizJobForClient(updated));
  } catch (error) {
    console.error("POST /api/teacher/quizzes/jobs/[jobId]/assign failed:", error);
    return NextResponse.json(
      { error: error.message || "Could not assign quiz." },
      { status: error.statusCode || 500 },
    );
  }
}
