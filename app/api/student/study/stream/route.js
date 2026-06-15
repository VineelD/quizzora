import { requireApiSession } from "../../../../../lib/auth.js";
import { postStudyMessageStream, studyCoachAvailableForAssignment } from "../../../../../lib/study.js";
import { getStudentAssignment } from "../../../../../lib/db.js";
import { isStudyCoachStreamingAvailable } from "../../../../../lib/study-coach-llm.js";
import { extractStreamingCoachPreview, encodeSseEvent } from "../../../../../lib/study-coach-stream.js";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request) {
  const session = await requireApiSession("student");
  if (session.error) {
    return new Response(JSON.stringify({ error: session.error }), {
      status: session.status,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!isStudyCoachStreamingAvailable()) {
    return new Response(JSON.stringify({ error: "Streaming is not enabled for Study Coach." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const body = await request.json();
  const assignmentId = Number(body.assignmentId);
  const message = String(body.message || "").trim();

  if (!assignmentId) {
    return new Response(JSON.stringify({ error: "assignmentId is required." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (!message) {
    return new Response(JSON.stringify({ error: "message is required." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const assignment = getStudentAssignment(session.user.id, assignmentId);
  if (!assignment) {
    return new Response(JSON.stringify({ error: "Assignment not found." }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (!studyCoachAvailableForAssignment(assignment)) {
    return new Response(JSON.stringify({ error: "Study Coach is not available for this assignment." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (payload) => controller.enqueue(encoder.encode(encodeSseEvent(payload)));

      try {
        const result = await postStudyMessageStream({
          studentId: session.user.id,
          assignmentId,
          message,
          requestNarration: body.requestNarration === true,
          onToken: (_delta, rawReply) => {
            send({
              type: "token",
              preview: extractStreamingCoachPreview(rawReply),
            });
          },
        });
        send({ type: "done", ...result });
      } catch (error) {
        send({ type: "error", error: error.message || "Could not send message." });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
