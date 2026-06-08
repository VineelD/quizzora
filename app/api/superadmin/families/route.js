import { NextResponse } from "next/server";
import { requireApiSession } from "../../../../lib/auth.js";
import { listFamiliesWithUserCounts } from "../../../../lib/superadmin.js";

export const runtime = "nodejs";

export async function GET() {
  const auth = await requireApiSession("superadmin", { skipBilling: true });
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  return NextResponse.json({
    families: listFamiliesWithUserCounts(),
  });
}
