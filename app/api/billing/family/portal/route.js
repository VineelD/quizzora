import { NextResponse } from "next/server";
import { requireApiSession } from "../../../../../lib/auth.js";
import { createFamilyBillingPortalSession } from "../../../../../lib/family-billing.js";

export const runtime = "nodejs";

export async function POST() {
  const session = await requireApiSession("parent", { skipBilling: true });
  if (session.error) {
    return NextResponse.json({ error: session.error }, { status: session.status });
  }

  try {
    const portal = await createFamilyBillingPortalSession(session.user.family_id);
    return NextResponse.json(portal);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
