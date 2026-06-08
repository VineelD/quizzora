import { NextResponse } from "next/server";
import { authenticate, createSession, loginNeedsTenantCode, sessionCookieName } from "../../../../lib/auth.js";
import { resolveTenantForAuth } from "../../../../lib/tenants.js";
import { getSessionCookieOptions } from "../../../../lib/session-cookie.js";

export const runtime = "nodejs";

export async function POST(request) {
  const body = await request.json();
  const identifier = String(body.identifier || body.email || body.username || "").trim();
  const tenantCode = String(body.tenantCode || body.schoolCode || body.familyCode || "").trim();

  let schoolId = null;
  let familyId = null;
  try {
    const tenant = resolveTenantForAuth({ tenantCode });
    if (tenant?.type === "school") {
      schoolId = tenant.id;
    } else if (tenant?.type === "family") {
      familyId = tenant.id;
    }
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const user = await authenticate(identifier, String(body.password || ""), { schoolId, familyId });

  if (!user) {
    if (!schoolId && !familyId && loginNeedsTenantCode(identifier, String(body.password || ""))) {
      return NextResponse.json(
        { error: "Enter your school or family code — this password matches more than one account." },
        { status: 400 },
      );
    }
    return NextResponse.json({ error: "Invalid email, username, password, or access code." }, { status: 401 });
  }

  const token = await createSession(user);
  const response = NextResponse.json({ user });
  response.cookies.set(sessionCookieName, token, getSessionCookieOptions(request));
  return response;
}
