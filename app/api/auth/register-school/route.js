import { NextResponse } from "next/server";
import { createSession, sessionCookieName } from "../../../../lib/auth.js";
import { createCheckoutSession, isStripeConfigured } from "../../../../lib/billing.js";
import { createSchoolWithAdmin } from "../../../../lib/db.js";
import { getSessionCookieOptions } from "../../../../lib/session-cookie.js";
import { assertTermsAccepted } from "../../../../lib/terms.js";

export const runtime = "nodejs";

export async function POST(request) {
  const body = await request.json();

  try {
    assertTermsAccepted(body);
    const { school, admin } = createSchoolWithAdmin({
      schoolName: String(body.schoolName || ""),
      schoolSlug: String(body.schoolSlug || ""),
      name: String(body.name || ""),
      email: String(body.email || ""),
      password: String(body.password || ""),
      acceptTerms: true,
    });

    const token = await createSession(admin);
    const payload = { user: admin };

    if (isStripeConfigured()) {
      const interval = body.planInterval === "year" ? "year" : "month";
      const checkout = await createCheckoutSession({
        schoolId: school.id,
        interval,
        customerEmail: admin.email,
        allowTrial: true,
      });
      payload.checkoutUrl = checkout.url;
      payload.checkoutRequired = true;
    }

    const response = NextResponse.json(payload);
    response.cookies.set(sessionCookieName, token, getSessionCookieOptions(request));
    return response;
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
