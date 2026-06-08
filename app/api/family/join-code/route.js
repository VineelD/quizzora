import { NextResponse } from "next/server";
import { requireApiSession } from "../../../../lib/auth.js";
import { getFamilyById, regenerateFamilyJoinCode } from "../../../../lib/families.js";

export const runtime = "nodejs";

export async function POST() {
  const session = await requireApiSession("parent", { skipBilling: true });
  if (session.error) {
    return NextResponse.json({ error: session.error }, { status: session.status });
  }

  const family = getFamilyById(session.user.family_id);
  if (!family) {
    return NextResponse.json({ error: "Family not found." }, { status: 404 });
  }

  if (Number(family.owner_user_id) !== Number(session.user.id)) {
    return NextResponse.json({ error: "Only the family administrator can regenerate the family code." }, { status: 403 });
  }

  const updated = regenerateFamilyJoinCode(family.id);
  return NextResponse.json({ family: updated });
}
