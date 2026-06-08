import { NextResponse } from "next/server";
import { requireApiSession } from "../../../../lib/auth.js";
import { createBillingPortalSession } from "../../../../lib/billing.js";

export const runtime = "nodejs";

export async function POST() {
  const session = await requireApiSession("admin", { skipBilling: true });
  if (session.error) {
    return NextResponse.json({ error: session.error }, { status: session.status });
  }

  try {
    const portal = await createBillingPortalSession(session.user.school_id);
    return NextResponse.json(portal);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
