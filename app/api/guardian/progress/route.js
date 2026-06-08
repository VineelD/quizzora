import { NextResponse } from "next/server";
import { getGuardianStudentProgress } from "../../../../lib/guardian-access.js";

export const runtime = "nodejs";

export async function GET(request) {
  const token = new URL(request.url).searchParams.get("token");
  try {
    const progress = getGuardianStudentProgress(token);
    return NextResponse.json(progress);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
