import { NextResponse } from "next/server";
import { createSession, sessionCookieName } from "../../../../lib/auth.js";
import { joinFamilyAsParent } from "../../../../lib/db.js";
import { getSessionCookieOptions } from "../../../../lib/session-cookie.js";
import { assertTermsAccepted } from "../../../../lib/terms.js";

export const runtime = "nodejs";

export async function POST(request) {
  const body = await request.json();

  try {
    assertTermsAccepted(body);
    const { parent } = joinFamilyAsParent({
      joinCode: String(body.familyCode || body.joinCode || ""),
      name: String(body.name || ""),
      email: String(body.email || ""),
      password: String(body.password || ""),
      acceptTerms: true,
    });

    const token = await createSession(parent);
    const response = NextResponse.json({ user: parent });
    response.cookies.set(sessionCookieName, token, getSessionCookieOptions(request));
    return response;
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
