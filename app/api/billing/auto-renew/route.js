import { NextResponse } from "next/server";
import { requireApiSession } from "../../../../lib/auth.js";
import { setSchoolSubscriptionAutoRenew } from "../../../../lib/billing.js";

export const runtime = "nodejs";

export async function POST(request) {
  const session = await requireApiSession("admin", { skipBilling: true });
  if (session.error) {
    return NextResponse.json({ error: session.error }, { status: session.status });
  }

  const body = await request.json();
  if (typeof body.autoRenew !== "boolean") {
    return NextResponse.json({ error: "autoRenew must be true or false." }, { status: 400 });
  }

  try {
    const result = await setSchoolSubscriptionAutoRenew({
      schoolId: session.user.school_id,
      autoRenew: body.autoRenew,
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
