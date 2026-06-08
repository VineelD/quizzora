import { NextResponse } from "next/server";
import { requireApiSession } from "../../../../../lib/auth.js";
import {
  getFamilySubscription,
  serializeFamilySubscriptionForClient,
} from "../../../../../lib/billing-enforcement.js";
import { getFamilyBilling } from "../../../../../lib/family-billing.js";
import { isStripeConfigured } from "../../../../../lib/billing.js";

export const runtime = "nodejs";

export async function GET() {
  const session = await requireApiSession("parent", { skipBilling: true });
  if (session.error) {
    return NextResponse.json({ error: session.error }, { status: session.status });
  }

  const billing = getFamilyBilling(session.user.family_id);
  const subscription = getFamilySubscription(session.user.family_id);

  return NextResponse.json({
    billing,
    subscription: serializeFamilySubscriptionForClient(subscription),
    stripeEnabled: isStripeConfigured(),
  });
}
