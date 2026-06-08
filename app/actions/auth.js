"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  authenticate,
  createSession,
  homePathForRole,
  loginNeedsTenantCode,
  sessionCookieName,
} from "../../lib/auth.js";
import { getSchoolBilling } from "../../lib/billing.js";
import { getFamilyBilling } from "../../lib/family-billing.js";
import { resolveTenantForAuth } from "../../lib/tenants.js";
import { createRequestFromHeaders, getSessionCookieOptions } from "../../lib/session-cookie.js";

function isNextRedirect(error) {
  return (
    error?.digest === "NEXT_REDIRECT" ||
    String(error?.message || "").includes("NEXT_REDIRECT")
  );
}

export async function loginAction(formData) {
  try {
    const identifier = String(formData.get("identifier") || "").trim();
    const password = String(formData.get("password") || "");
    const schoolCode = String(formData.get("schoolCode") || "").trim();

    let schoolId = null;
    let familyId = null;
    try {
      const tenant = resolveTenantForAuth({ tenantCode: schoolCode });
      if (tenant?.type === "school") {
        schoolId = tenant.id;
      } else if (tenant?.type === "family") {
        familyId = tenant.id;
      }
    } catch (error) {
      redirect(`/?authError=${encodeURIComponent(error.message)}`);
    }

    const user = await authenticate(identifier, password, { schoolId, familyId });
    if (!user) {
      if (!schoolId && !familyId && loginNeedsTenantCode(identifier, password)) {
        redirect(
          `/?authError=${encodeURIComponent("Enter your school or family code — this password matches more than one account.")}`,
        );
      }
      redirect(`/?authError=${encodeURIComponent("Invalid email, username, password, or access code.")}`);
    }

    const token = await createSession(user);
    const headerList = await headers();
    const request = createRequestFromHeaders(headerList);
    const cookieStore = await cookies();
    cookieStore.set(sessionCookieName, token, getSessionCookieOptions(request));

    if (user.role === "admin" && user.school_id) {
      const billing = getSchoolBilling(user.school_id);
      if (billing?.pendingCheckout) {
        redirect("/admin/billing");
      }
    }

    if (user.role === "parent" && user.family_id) {
      const billing = getFamilyBilling(user.family_id);
      if (billing?.pendingCheckout) {
        redirect("/family/billing");
      }
    }

    redirect(homePathForRole(user.role));
  } catch (error) {
    if (isNextRedirect(error)) {
      throw error;
    }
    console.error("loginAction failed:", error);
    redirect(
      `/?authError=${encodeURIComponent("Sign-in failed due to a server error. Please try again in a moment.")}`,
    );
  }
}
