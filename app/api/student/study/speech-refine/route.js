import { NextResponse } from "next/server";
import { requireApiSession } from "../../../../../lib/auth.js";
import { buildTopicVocabulary, refineSpeechText } from "../../../../../lib/speech-refine.js";
import { studyCoachSpeechMlRefineEnabled } from "../../../../../lib/speech-refine-config.js";
import { checkSpeechRefineRateLimit } from "../../../../../lib/speech-refine-rate-limit.js";
import { getAssignmentStudyContext } from "../../../../../lib/study.js";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request) {
  const session = await requireApiSession("student");
  if (session.error) {
    return NextResponse.json({ error: session.error }, { status: session.status });
  }

  const rate = checkSpeechRefineRateLimit(session.user.id);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Speech refine rate limit exceeded.", retryAfterMs: rate.retryAfterMs },
      { status: 429 },
    );
  }

  const body = await request.json();
  const assignmentId = Number(body.assignmentId);
  const text = String(body.text || "");
  const mathMode = Boolean(body.mathMode);
  const topicVocabInput = Array.isArray(body.topicVocab) ? body.topicVocab : null;

  if (!text.trim()) {
    return NextResponse.json({ text: "", corrections: [] });
  }

  const studyContext = assignmentId
    ? getAssignmentStudyContext(session.user.id, assignmentId)
    : null;
  if (assignmentId && !studyContext) {
    return NextResponse.json({ error: "Assignment not found." }, { status: 404 });
  }

  let topicVocab = topicVocabInput?.map((term) => String(term || "").trim()).filter(Boolean) || [];
  if (!topicVocab.length && studyContext) {
    topicVocab = buildTopicVocabulary({
      focus: studyContext.focus,
      subject: studyContext.subject,
      yearLevel: studyContext.yearLevel,
      curriculumSummary: studyContext.curriculumSummary,
      learningIntentions: studyContext.learningIntentions,
      selectedTopicKeys: studyContext.selectedTopicKeys,
      selectedSubtopics: studyContext.selectedSubtopics,
    });
  }

  const result = await refineSpeechText(text, {
    mathMode,
    topicVocab,
    mlEnabled: mathMode && studyCoachSpeechMlRefineEnabled(),
    assignmentId: assignmentId || null,
  });

  return NextResponse.json(result);
}
