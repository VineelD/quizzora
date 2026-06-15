import { NextResponse } from "next/server";
import { requireApiSession } from "../../../../lib/auth.js";
import { resolveStudyCoachProvider } from "../../../../lib/study-coach-llm.js";
import { listEmbeddedFocusLabels, runStudyCoachRagTest } from "../../../../lib/study-coach-test.js";

export const runtime = "nodejs";
/** Onyx RAG + Ollama can exceed 2 minutes; match IIS ARR proxy (6 min). */
export const maxDuration = 360;

export async function GET() {
  const auth = await requireApiSession("superadmin", { skipBilling: true });
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  return NextResponse.json({
    focusLabels: listEmbeddedFocusLabels(),
    ragGloballyEnabled: process.env.STUDY_COACH_RAG_ENABLED === "true",
    provider: resolveStudyCoachProvider(),
    onyxConfigured: Boolean(process.env.ONYX_API_KEY?.trim()),
  });
}

export async function POST(request) {
  const auth = await requireApiSession("superadmin", { skipBilling: true });
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const message = String(body?.message || "").trim();
  const focusLabel = String(body?.focusLabel || "").trim();
  const history = Array.isArray(body?.history) ? body.history : [];

  if (!message) {
    return NextResponse.json({ error: "message is required." }, { status: 400 });
  }
  if (!focusLabel) {
    return NextResponse.json({ error: "focusLabel is required." }, { status: 400 });
  }

  try {
    const result = await runStudyCoachRagTest({ message, focusLabel, history });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error?.message || "Study Coach test request failed." },
      { status: 500 },
    );
  }
}
