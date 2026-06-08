import { NextResponse } from "next/server";
import { requireApiSession } from "../../../../lib/auth.js";
import { getSchoolSubscription } from "../../../../lib/billing-enforcement.js";

export const runtime = "nodejs";

export async function GET() {
  const session = await requireApiSession(["admin", "teacher"], { skipBilling: true });
  if (session.error) {
    return NextResponse.json({ error: session.error }, { status: session.status });
  }

  if (!session.user.school_id) {
    return NextResponse.json({ error: "No school linked to this account." }, { status: 400 });
  }

  const subscription = getSchoolSubscription(session.user.school_id);
  return NextResponse.json({ subscription });
}
