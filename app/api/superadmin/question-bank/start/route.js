import { NextResponse } from "next/server";
import { requireApiSession } from "../../../../../lib/auth.js";
import {
  getQuestionBankStatusPayload,
  startQuestionBankFillRun,
} from "../../../../../lib/question-bank.js";
import { runQuestionBankWorkerLoop } from "../../../../../lib/question-bank-worker.js";

export const runtime = "nodejs";

export async function POST() {
  const auth = await requireApiSession("superadmin", { skipBilling: true });
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  if (!process.env.OPENAI_API_KEY?.trim()) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY is not configured on the server." },
      { status: 503 },
    );
  }

  try {
    const started = startQuestionBankFillRun();
    await runQuestionBankWorkerLoop({ once: true });

    return NextResponse.json({
      ...getQuestionBankStatusPayload(),
      started,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error?.message || "Could not start question bank fill." },
      { status: 500 },
    );
  }
}
