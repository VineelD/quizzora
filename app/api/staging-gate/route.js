import { NextResponse } from "next/server";
import {
  credentialsMatchStagingGate,
  getStagingGateCookieOptions,
  isStagingGateEnabled,
  STAGING_GATE_COOKIE,
  STAGING_GATE_COOKIE_VALUE,
} from "../../../lib/staging-gate.js";

export const runtime = "nodejs";

export async function POST(request) {
  if (!isStagingGateEnabled()) {
    return NextResponse.json({ error: "Staging gate is not enabled." }, { status: 404 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const username = String(body.username || "").trim();
  const password = String(body.password || "");

  if (!credentialsMatchStagingGate(username, password)) {
    return NextResponse.json({ error: "Invalid tester username or password." }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(STAGING_GATE_COOKIE, STAGING_GATE_COOKIE_VALUE, getStagingGateCookieOptions(request));
  return response;
}
