import { NextResponse } from "next/server";
import { shouldUseSecureCookie } from "../../../lib/session-cookie.js";
import {
  isMaintenanceModeEnabled,
  maintenanceBypassSecret,
} from "../../../lib/maintenance-mode.js";

export const runtime = "nodejs";

export async function POST(request) {
  if (!isMaintenanceModeEnabled()) {
    return NextResponse.json({ error: "Maintenance mode is not enabled." }, { status: 404 });
  }

  const secret = maintenanceBypassSecret();
  if (!secret) {
    return NextResponse.json({ error: "Maintenance bypass is not configured." }, { status: 403 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (String(body?.secret || "") !== secret) {
    return NextResponse.json({ error: "Invalid bypass secret." }, { status: 403 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set("maintenance_bypass", secret, {
    httpOnly: true,
    sameSite: "lax",
    secure: shouldUseSecureCookie(request),
    path: "/",
    maxAge: 60 * 60 * 8,
  });
  return response;
}
