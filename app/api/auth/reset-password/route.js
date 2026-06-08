import { NextResponse } from "next/server";
import { createSession, sessionCookieName } from "../../../../lib/auth.js";
import { resetPasswordWithToken } from "../../../../lib/auth-tokens.js";
import { getSessionCookieOptions } from "../../../../lib/session-cookie.js";

export const runtime = "nodejs";

export async function POST(request) {
  const { token, password, confirmPassword } = await request.json();

  if (String(password || "") !== String(confirmPassword || "")) {
    return NextResponse.json({ error: "Passwords do not match." }, { status: 400 });
  }

  try {
    const user = resetPasswordWithToken(String(token || ""), String(password || ""));
    const sessionToken = await createSession(user);
    const response = NextResponse.json({ user });
    response.cookies.set(sessionCookieName, sessionToken, getSessionCookieOptions(request));
    return response;
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
