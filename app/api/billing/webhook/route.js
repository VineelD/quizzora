import { NextResponse } from "next/server";
import {
  applyStripeSubscriptionToSchool,
  clearSchoolPendingPlanChange,
  findSchoolIdByStripeCustomer,
  getStripeClient,
  recordBillingEvent,
  syncStripeCheckoutSession,
  updateSchoolBillingFromStripe,
} from "../../../../lib/billing.js";
import {
  applyStripeSubscriptionToFamily,
  clearFamilyPendingPlanChange,
  findFamilyIdByStripeCustomer,
  recordFamilyBillingEvent,
  updateFamilyBillingFromStripe,
} from "../../../../lib/family-billing.js";

export const runtime = "nodejs";

export async function POST(request) {
  const stripe = await getStripeClient();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!stripe || !webhookSecret) {
    return NextResponse.json({ error: "Stripe webhook is not configured." }, { status: 503 });
  }

  const signature = request.headers.get("stripe-signature");
  const body = await request.text();

  let event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (error) {
    return NextResponse.json({ error: `Webhook signature failed: ${error.message}` }, { status: 400 });
  }

  let schoolId = null;
  let familyId = null;

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        familyId = Number(session.metadata?.family_id || 0) || null;
        schoolId = Number(session.metadata?.school_id || 0) || null;
        const reference = String(session.client_reference_id || "");
        if (!familyId && reference.startsWith("family:")) {
          familyId = Number(reference.split(":")[1]) || null;
        }
        if (!schoolId && reference && !reference.startsWith("family:")) {
          schoolId = Number(reference) || null;
        }
        if (familyId && session.customer) {
          const synced = await syncStripeCheckoutSession(session);
          updateFamilyBillingFromStripe({
            familyId,
            status: synced?.status || "trialing",
            stripeCustomerId: synced?.stripeCustomerId || String(session.customer),
            stripeSubscriptionId: synced?.stripeSubscriptionId || (session.subscription ? String(session.subscription) : null),
            planInterval: synced?.planInterval || null,
            currentPeriodEnd: synced?.currentPeriodEnd || null,
            trialEndsAt: synced?.trialEndsAt || null,
            cancelAtPeriodEnd: synced?.cancelAtPeriodEnd ?? false,
          });
        } else if (schoolId && session.customer) {
          const synced = await syncStripeCheckoutSession(session);
          updateSchoolBillingFromStripe({
            schoolId,
            status: synced?.status || "trialing",
            stripeCustomerId: synced?.stripeCustomerId || String(session.customer),
            stripeSubscriptionId: synced?.stripeSubscriptionId || (session.subscription ? String(session.subscription) : null),
            planInterval: synced?.planInterval || null,
            currentPeriodEnd: synced?.currentPeriodEnd || null,
            trialEndsAt: synced?.trialEndsAt || null,
            cancelAtPeriodEnd: synced?.cancelAtPeriodEnd ?? false,
          });
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        familyId = await applyStripeSubscriptionToFamily(event.data.object);
        if (!familyId) {
          schoolId = await applyStripeSubscriptionToSchool(event.data.object);
        }
        break;
      }
      case "subscription_schedule.updated":
      case "subscription_schedule.completed":
      case "subscription_schedule.released": {
        const schedule = event.data.object;
        const subscriptionId =
          typeof schedule.subscription === "string" ? schedule.subscription : schedule.subscription?.id;
        if (subscriptionId) {
          const subscription = await stripe.subscriptions.retrieve(String(subscriptionId));
          familyId = await applyStripeSubscriptionToFamily(subscription);
          if (!familyId) {
            schoolId = await applyStripeSubscriptionToSchool(subscription);
          }
        }
        break;
      }
      case "customer.subscription.deleted": {
        const subscription = event.data.object;
        familyId = await applyStripeSubscriptionToFamily(subscription);
        if (familyId) {
          updateFamilyBillingFromStripe({
            familyId,
            status: "canceled",
            currentPeriodEnd: subscription.ended_at
              ? new Date(subscription.ended_at * 1000).toISOString()
              : new Date().toISOString(),
          });
          clearFamilyPendingPlanChange(familyId);
        } else {
          schoolId = await applyStripeSubscriptionToSchool(subscription);
          if (schoolId) {
            updateSchoolBillingFromStripe({
              schoolId,
              status: "canceled",
              currentPeriodEnd: subscription.ended_at
                ? new Date(subscription.ended_at * 1000).toISOString()
                : new Date().toISOString(),
            });
            clearSchoolPendingPlanChange(schoolId);
          }
        }
        break;
      }
      case "invoice.payment_failed": {
        const invoice = event.data.object;
        familyId = findFamilyIdByStripeCustomer(invoice.customer);
        if (familyId) {
          updateFamilyBillingFromStripe({ familyId, status: "past_due" });
        } else {
          schoolId = findSchoolIdByStripeCustomer(invoice.customer);
          if (schoolId) {
            updateSchoolBillingFromStripe({ schoolId, status: "past_due" });
          }
        }
        break;
      }
      default:
        break;
    }

    if (familyId) {
      recordFamilyBillingEvent({
        familyId,
        stripeEventId: event.id,
        eventType: event.type,
        payload: { id: event.id, type: event.type },
      });
    } else if (schoolId) {
      recordBillingEvent({
        schoolId,
        stripeEventId: event.id,
        eventType: event.type,
        payload: { id: event.id, type: event.type },
      });
    }
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
