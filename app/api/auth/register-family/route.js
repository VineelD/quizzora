import { NextResponse } from "next/server";
import { createSession, sessionCookieName } from "../../../../lib/auth.js";
import { createFamilyWithParent } from "../../../../lib/db.js";
import { isStripeConfigured } from "../../../../lib/billing.js";
import { createFamilyCheckoutSession } from "../../../../lib/family-billing.js";
import { getSessionCookieOptions } from "../../../../lib/session-cookie.js";
import { assertTermsAccepted } from "../../../../lib/terms.js";

export const runtime = "nodejs";

export async function POST(request) {
  const body = await request.json();

  try {
    assertTermsAccepted(body);
    const { family, parent } = createFamilyWithParent({
      familyName: String(body.familyName || ""),
      familySlug: String(body.familySlug || ""),
      name: String(body.name || ""),
      email: String(body.email || ""),
      password: String(body.password || ""),
      acceptTerms: true,
    });

    const token = await createSession(parent);
    const payload = { user: parent };

    if (isStripeConfigured()) {
      const interval = body.planInterval === "year" ? "year" : "month";
      const checkout = await createFamilyCheckoutSession({
        familyId: family.id,
        interval,
        customerEmail: parent.email,
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
