import { NextResponse } from "next/server";
import { requestPasswordReset } from "../../../../lib/auth-tokens.js";

export const runtime = "nodejs";

export async function POST(request) {
  const body = await request.json();

  try {
    const result = await requestPasswordReset(String(body.email || ""), {
      schoolCode: String(body.schoolCode || ""),
      schoolSlug: String(body.schoolSlug || ""),
      familyCode: String(body.familyCode || ""),
      portalType: String(body.portalType || ""),
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
