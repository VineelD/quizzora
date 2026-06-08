import { NextResponse } from "next/server";
import { requireApiSession } from "../../../../../lib/auth.js";
import { getAssignmentStudyContext } from "../../../../../lib/study.js";
import {
  detectTopicMention,
  expandTopicVocabularyWithMl,
  getComposeVocabularySuggestionsExpanded,
  getVocabularyForTopic,
} from "../../../../../lib/topic-vocab-suggest.js";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request) {
  const session = await requireApiSession("student");
  if (session.error) {
    return NextResponse.json({ error: session.error }, { status: session.status });
  }

  const url = new URL(request.url);
  const assignmentId = Number(url.searchParams.get("assignmentId"));
  const topicParam = String(url.searchParams.get("topic") || "").trim();
  const composeText = String(url.searchParams.get("text") || topicParam).trim();

  const studyContext = assignmentId ? getAssignmentStudyContext(session.user.id, assignmentId) : null;
  if (assignmentId && !studyContext) {
    return NextResponse.json({ error: "Assignment not found." }, { status: 404 });
  }

  const assignmentContext = studyContext
    ? {
        yearLevel: studyContext.yearLevel,
        subject: studyContext.subject,
        focus: studyContext.focus,
        selectedTopicKeys: studyContext.selectedTopicKeys,
        selectedSubtopics: studyContext.selectedSubtopics,
        learningIntentions: studyContext.learningIntentions || [],
        curriculumSummary: studyContext.curriculumSummary || "",
      }
    : {};

  if (topicParam && !composeText.includes(topicParam)) {
    assignmentContext.topic = topicParam;
  }

  const expanded = await getComposeVocabularySuggestionsExpanded(composeText || topicParam, assignmentContext);

  if (expanded.mode !== "topic" && topicParam) {
    const mention = detectTopicMention(topicParam, assignmentContext);
    const baseTerms = getVocabularyForTopic(mention?.topicKey || topicParam, assignmentContext, {
      subtopic: mention?.subtopic,
    });
    const mlTerms = await expandTopicVocabularyWithMl(topicParam, baseTerms, {
      ...assignmentContext,
      topicKey: mention?.topicKey,
      subtopic: mention?.subtopic,
      topic: mention?.topic || topicParam,
    });

    return NextResponse.json({
      mode: "topic",
      label: mention?.displayLabel || topicParam,
      terms: [...new Set([...baseTerms, ...mlTerms])].slice(0, 20),
      mlExpanded: true,
      mention,
    });
  }

  return NextResponse.json(expanded);
}
