import { NextResponse } from "next/server";
import { consumeAuthToken, getAuthTokenRow } from "../../../../lib/auth-tokens.js";
import { createSession, sessionCookieName } from "../../../../lib/auth.js";
import { getSessionCookieOptions } from "../../../../lib/session-cookie.js";

export const runtime = "nodejs";

export async function GET(request) {
  const token = new URL(request.url).searchParams.get("token");
  const origin = new URL(request.url).origin;

  try {
    const row = getAuthTokenRow(token);
    if (row.purpose === "reset_password") {
      return NextResponse.redirect(new URL(`/auth/reset-password?token=${encodeURIComponent(token)}`, origin));
    }

    const user = consumeAuthToken(token);
    const sessionToken = await createSession(user);
    const destination = user.role === "teacher" ? "/teacher" : "/student";
    const response = NextResponse.redirect(new URL(destination, origin));
    response.cookies.set(sessionCookieName, sessionToken, getSessionCookieOptions(request));
    return response;
  } catch (error) {
    return NextResponse.redirect(new URL(`/?authError=${encodeURIComponent(error.message)}`, origin));
  }
}
