import { NextResponse } from "next/server";
import { requireApiSession } from "../../../../../lib/auth.js";
import {
  getQuestionBankStatusPayload,
  pauseActiveFillRun,
} from "../../../../../lib/question-bank.js";

export const runtime = "nodejs";

export async function POST() {
  const auth = await requireApiSession("superadmin", { skipBilling: true });
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const paused = pauseActiveFillRun();

  return NextResponse.json({
    ...getQuestionBankStatusPayload(),
    paused: Boolean(paused),
  });
}
