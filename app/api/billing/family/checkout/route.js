import { NextResponse } from "next/server";
import { requireApiSession } from "../../../../../lib/auth.js";
import { subscribeOrChangeFamilyPlan } from "../../../../../lib/family-billing.js";

export const runtime = "nodejs";

export async function POST(request) {
  const session = await requireApiSession("parent", { skipBilling: true });
  if (session.error) {
    return NextResponse.json({ error: session.error }, { status: session.status });
  }

  const body = await request.json();
  const interval = body.interval === "year" ? "year" : "month";

  try {
    const result = await subscribeOrChangeFamilyPlan({
      familyId: session.user.family_id,
      interval,
      customerEmail: session.user.email,
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
