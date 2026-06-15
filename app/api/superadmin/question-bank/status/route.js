import { NextResponse } from "next/server";
import { requireApiSession } from "../../../../../lib/auth.js";
import { getOpenAiBatchQuotaSummary } from "../../../../../lib/openai-batch.js";
import { getQuestionBankStatusPayload } from "../../../../../lib/question-bank.js";

export const runtime = "nodejs";

export async function GET() {
  const auth = await requireApiSession("superadmin", { skipBilling: true });
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let openAiQuota = null;
  try {
    openAiQuota = await getOpenAiBatchQuotaSummary();
  } catch (error) {
    openAiQuota = { error: error?.message || "Could not query OpenAI batches." };
  }

  return NextResponse.json(getQuestionBankStatusPayload({ openAiQuota }));
}
