import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { sessionCookieName } from "../../../../lib/auth.js";
import { getClearSessionCookieOptions } from "../../../../lib/session-cookie.js";

export const runtime = "nodejs";

export async function POST(request) {
  const cookieStore = await cookies();
  cookieStore.set(sessionCookieName, "", getClearSessionCookieOptions(request));
  return NextResponse.json({ ok: true });
}
