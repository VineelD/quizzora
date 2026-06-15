import { getDb } from "./db.js";
import { getFamilyById } from "./families.js";
import { isFreeAccessMode } from "./billing-mode.js";
import { OPERATOR_PRODUCT_NAME, operatorDisplayLine } from "./operator.js";
import {
  assertNotDuplicatePlan,
  getStripeClient,
  getTrialDays,
  hasActiveBillingRecord,
  hasChangeableSubscription,
  resolveChangeableSubscriptionId,
  resolveSubscriptionAccess,
  resolveEffectivePlanInterval,
  resolvePlanChangeEffectiveAt,
  resolveSubscriptionRenewalDate,
  mapCancelAtPeriodEndFromStripe,
  scheduleSubscriptionPlanChange,
  schoolQualifiesForTrial,
  trialEndsAtFromNow,
} from "./billing.js";

const ACTIVE_STATUSES = new Set(["trialing", "active"]);

export function getFamilyStripePriceIds() {
  return {
    month: process.env.STRIPE_PRICE_FAMILY_MONTHLY?.trim() || process.env.STRIPE_PRICE_MONTHLY?.trim() || "",
    year: process.env.STRIPE_PRICE_FAMILY_YEARLY?.trim() || process.env.STRIPE_PRICE_YEARLY?.trim() || "",
  };
}

export function initFamilyFreeAccess(db, familyId) {
  db.prepare(
    `
    UPDATE families
    SET
      subscription_status = 'active',
      trial_ends_at = NULL,
      plan_interval = NULL,
      current_period_end = NULL
    WHERE id = ?
  `,
  ).run(familyId);
}

export function initFamilyTrial(db, familyId) {
  if (isFreeAccessMode()) {
    initFamilyFreeAccess(db, familyId);
    return;
  }

  db.prepare(
    `
    UPDATE families
    SET
      subscription_status = 'trialing',
      trial_ends_at = ?,
      plan_interval = NULL,
      current_period_end = NULL
    WHERE id = ?
  `,
  ).run(trialEndsAtFromNow(getTrialDays()), familyId);
}

export function getFamilyBilling(familyId) {
  const family = getFamilyById(familyId);
  if (!family) {
    return null;
  }

  const accessState = resolveSubscriptionAccess({
    subscriptionStatus: family.subscription_status,
    trialEndsAt: family.trial_ends_at,
    currentPeriodEnd: family.current_period_end,
    stripeSubscriptionId: family.stripe_subscription_id,
    stripeCustomerId: family.stripe_customer_id,
  });

  return {
    familyId: family.id,
    familyName: family.name,
    status: accessState.status,
    planInterval: family.plan_interval || null,
    trialEndsAt: family.trial_ends_at,
    currentPeriodEnd: family.current_period_end,
    stripeCustomerId: family.stripe_customer_id,
    stripeSubscriptionId: family.stripe_subscription_id,
    hasAccess: accessState.hasAccess,
    trialDaysLeft: accessState.trialDaysLeft,
    needsPayment: accessState.needsPayment,
    isTrialing: accessState.isTrialing,
    pendingCheckout: accessState.pendingCheckout,
    pendingPlanInterval: family.pending_plan_interval || null,
    pendingPriceId: family.pending_price_id || null,
    planChangeAt: family.plan_change_at || null,
    cancelAtPeriodEnd: Boolean(family.cancel_at_period_end),
    autoRenew: !family.cancel_at_period_end,
    renewalDate: resolveSubscriptionRenewalDate({
      status: accessState.status,
      trialEndsAt: family.trial_ends_at,
      currentPeriodEnd: family.current_period_end,
    }),
  };
}

export function setFamilyPendingPlanChange({ familyId, pendingPlanInterval, pendingPriceId, planChangeAt }) {
  getDb()
    .prepare(
      `
      UPDATE families
      SET
        pending_plan_interval = ?,
        pending_price_id = ?,
        plan_change_at = ?
      WHERE id = ?
    `,
    )
    .run(pendingPlanInterval, pendingPriceId, planChangeAt, familyId);
}

export function clearFamilyPendingPlanChange(familyId) {
  getDb()
    .prepare(
      `
      UPDATE families
      SET
        pending_plan_interval = NULL,
        pending_price_id = NULL,
        plan_change_at = NULL
      WHERE id = ?
    `,
    )
    .run(familyId);
}

export function updateFamilyBillingFromStripe({
  familyId,
  status,
  planInterval = null,
  stripeCustomerId = null,
  stripeSubscriptionId = null,
  currentPeriodEnd = null,
  trialEndsAt = null,
  cancelAtPeriodEnd = null,
}) {
  getDb()
    .prepare(
      `
      UPDATE families
      SET
        subscription_status = ?,
        plan_interval = COALESCE(?, plan_interval),
        stripe_customer_id = COALESCE(?, stripe_customer_id),
        stripe_subscription_id = COALESCE(?, stripe_subscription_id),
        current_period_end = COALESCE(?, current_period_end),
        trial_ends_at = COALESCE(?, trial_ends_at),
        cancel_at_period_end = COALESCE(?, cancel_at_period_end)
      WHERE id = ?
    `,
    )
    .run(
      status,
      planInterval,
      stripeCustomerId,
      stripeSubscriptionId,
      currentPeriodEnd,
      trialEndsAt,
      cancelAtPeriodEnd === null ? null : cancelAtPeriodEnd ? 1 : 0,
      familyId,
    );
}

export function recordFamilyBillingEvent({ familyId, stripeEventId, eventType, payload }) {
  getDb()
    .prepare(
      `
      INSERT INTO billing_events (family_id, stripe_event_id, event_type, payload_json)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(stripe_event_id) DO NOTHING
    `,
    )
    .run(familyId, stripeEventId, eventType, JSON.stringify(payload));
}

export function findFamilyIdByStripeCustomer(customerId) {
  const row = getDb()
    .prepare("SELECT id FROM families WHERE stripe_customer_id = ?")
    .get(String(customerId || ""));
  return row ? Number(row.id) : null;
}

export function findFamilyIdByStripeSubscription(subscriptionId) {
  const row = getDb()
    .prepare("SELECT id FROM families WHERE stripe_subscription_id = ?")
    .get(String(subscriptionId || ""));
  return row ? Number(row.id) : null;
}

function planIntervalLabel(interval) {
  return interval === "year" ? "yearly" : "monthly";
}

export async function changeFamilySubscriptionPlan({ familyId, interval }) {
  const stripe = await getStripeClient();
  if (!stripe) {
    throw new Error("Stripe is not configured. Add API keys and price IDs to .env.local.");
  }

  const family = getFamilyById(familyId);
  if (!family) {
    throw new Error("Family not found.");
  }

  if (
    !hasChangeableSubscription({
      stripeSubscriptionId: family.stripe_subscription_id,
      subscriptionStatus: family.subscription_status,
    })
  ) {
    throw new Error("No active subscription to change. Subscribe first.");
  }

  const prices = getFamilyStripePriceIds();
  const priceId = interval === "year" ? prices.year : prices.month;
  if (!priceId) {
    throw new Error(`Stripe family price for ${interval} is not configured.`);
  }

  const subscription = await stripe.subscriptions.retrieve(family.stripe_subscription_id);
  const stripePriceInterval = subscription.items?.data?.[0]?.price?.recurring?.interval || null;
  assertNotDuplicatePlan({
    stripeSubscriptionId: family.stripe_subscription_id,
    planInterval: resolveEffectivePlanInterval({
      planInterval: family.plan_interval,
      stripePriceInterval,
    }),
    subscriptionStatus: family.subscription_status,
    targetInterval: interval,
    pendingPlanInterval: family.pending_plan_interval,
  });

  await scheduleSubscriptionPlanChange(stripe, subscription, priceId, {
    family_id: String(familyId),
    tenant_type: "family",
  });

  const refreshed = await stripe.subscriptions.retrieve(family.stripe_subscription_id);
  const mappedInterval = interval === "year" ? "year" : "month";
  const effectiveAt = resolvePlanChangeEffectiveAt(refreshed);
  const effectiveAtIso = new Date(effectiveAt * 1000).toISOString();
  const currentInterval = resolveEffectivePlanInterval({
    planInterval: family.plan_interval,
    stripePriceInterval,
  });

  updateFamilyBillingFromStripe({
    familyId,
    status: refreshed.status,
    currentPeriodEnd: refreshed.current_period_end
      ? new Date(refreshed.current_period_end * 1000).toISOString()
      : null,
    trialEndsAt: refreshed.trial_end ? new Date(refreshed.trial_end * 1000).toISOString() : null,
  });
  setFamilyPendingPlanChange({
    familyId,
    pendingPlanInterval: mappedInterval,
    pendingPriceId: priceId,
    planChangeAt: effectiveAtIso,
  });

  return {
    planChanged: true,
    planScheduled: true,
    planInterval: currentInterval,
    pendingPlanInterval: mappedInterval,
    planChangeAt: effectiveAtIso,
    effectiveAt: effectiveAtIso,
    status: refreshed.status,
    trialEndsAt: refreshed.trial_end ? new Date(refreshed.trial_end * 1000).toISOString() : null,
    message: `Your ${planIntervalLabel(mappedInterval)} plan is scheduled. You stay on ${planIntervalLabel(currentInterval)} billing until ${effectiveAtIso.slice(0, 10)}; the change takes effect then with no charge before that date.`,
  };
}

export async function subscribeOrChangeFamilyPlan({ familyId, interval, customerEmail, allowTrial = null }) {
  const stripe = await getStripeClient();
  if (!stripe) {
    throw new Error("Stripe is not configured. Add API keys and price IDs to .env.local.");
  }

  const family = getFamilyById(familyId);
  if (!family) {
    throw new Error("Family not found.");
  }

  assertNotDuplicatePlan({
    stripeSubscriptionId: family.stripe_subscription_id,
    planInterval: family.plan_interval,
    subscriptionStatus: family.subscription_status,
    targetInterval: interval,
  });

  if (
    hasChangeableSubscription({
      stripeSubscriptionId: family.stripe_subscription_id,
      subscriptionStatus: family.subscription_status,
    })
  ) {
    return changeFamilySubscriptionPlan({ familyId, interval });
  }

  if (
    hasActiveBillingRecord({
      stripeSubscriptionId: family.stripe_subscription_id,
      subscriptionStatus: family.subscription_status,
      stripeCustomerId: family.stripe_customer_id,
    })
  ) {
    const resolvedSubscriptionId = await resolveChangeableSubscriptionId(
      stripe,
      family.stripe_customer_id,
    );
    if (resolvedSubscriptionId) {
      updateFamilyBillingFromStripe({
        familyId,
        stripeSubscriptionId: resolvedSubscriptionId,
      });
      return changeFamilySubscriptionPlan({ familyId, interval });
    }
    throw new Error("Your subscription is still syncing. Refresh the page and try again.");
  }

  return createFamilyCheckoutSession({ familyId, interval, customerEmail, allowTrial });
}

export async function createFamilyCheckoutSession({ familyId, interval, customerEmail, allowTrial = null }) {
  const stripe = await getStripeClient();
  if (!stripe) {
    throw new Error("Stripe is not configured. Add API keys and price IDs to .env.local.");
  }

  const prices = getFamilyStripePriceIds();
  const priceId = interval === "year" ? prices.year : prices.month;
  if (!priceId) {
    throw new Error(`Stripe family price for ${interval} is not configured.`);
  }

  const family = getFamilyById(familyId);
  if (!family) {
    throw new Error("Family not found.");
  }

  assertNotDuplicatePlan({
    stripeSubscriptionId: family.stripe_subscription_id,
    planInterval: family.plan_interval,
    subscriptionStatus: family.subscription_status,
    targetInterval: interval,
  });

  if (
    hasActiveBillingRecord({
      stripeSubscriptionId: family.stripe_subscription_id,
      subscriptionStatus: family.subscription_status,
      stripeCustomerId: family.stripe_customer_id,
    })
  ) {
    throw new Error("You already have an active subscription. Use plan change instead of checkout.");
  }

  const baseUrl = (process.env.APP_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
  const grantTrial = allowTrial === true || (allowTrial !== false && schoolQualifiesForTrial(family));

  const sessionParams = {
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${baseUrl}/family/billing?checkout=success`,
    cancel_url: `${baseUrl}/family/billing?checkout=cancel`,
    client_reference_id: `family:${familyId}`,
    metadata: { family_id: String(familyId), tenant_type: "family", plan_interval: interval },
    subscription_data: {
      metadata: { family_id: String(familyId), tenant_type: "family" },
      description: `${OPERATOR_PRODUCT_NAME} family subscription (${operatorDisplayLine()})`,
    },
    custom_text: {
      submit: {
        message: grantTrial
          ? `${getTrialDays()}-day free trial — card required. Cancel anytime before day ${getTrialDays()} to avoid charges. ${operatorDisplayLine()}.`
          : `${OPERATOR_PRODUCT_NAME} — ${operatorDisplayLine()}`,
      },
    },
  };

  if (customerEmail) {
    sessionParams.customer_email = customerEmail;
  }

  if (family.stripe_customer_id) {
    sessionParams.customer = family.stripe_customer_id;
    delete sessionParams.customer_email;
  }

  if (grantTrial) {
    sessionParams.subscription_data.trial_period_days = getTrialDays();
  }

  const session = await stripe.checkout.sessions.create(sessionParams);
  return { url: session.url, sessionId: session.id };
}

export async function setFamilySubscriptionAutoRenew({ familyId, autoRenew }) {
  const stripe = await getStripeClient();
  if (!stripe) {
    throw new Error("Stripe is not configured. Add API keys and price IDs to .env.local.");
  }

  const family = getFamilyById(familyId);
  if (!family) {
    throw new Error("Family not found.");
  }

  if (
    !hasChangeableSubscription({
      stripeSubscriptionId: family.stripe_subscription_id,
      subscriptionStatus: family.subscription_status,
    })
  ) {
    throw new Error("No active subscription to update.");
  }

  const subscription = await stripe.subscriptions.update(family.stripe_subscription_id, {
    cancel_at_period_end: !autoRenew,
  });

  const trialEndsAt = subscription.trial_end
    ? new Date(subscription.trial_end * 1000).toISOString()
    : null;
  const currentPeriodEnd = subscription.current_period_end
    ? new Date(subscription.current_period_end * 1000).toISOString()
    : null;
  const cancelAtPeriodEnd = mapCancelAtPeriodEndFromStripe(subscription.cancel_at_period_end);
  const renewalDate = resolveSubscriptionRenewalDate({
    status: subscription.status,
    trialEndsAt,
    currentPeriodEnd,
  });

  updateFamilyBillingFromStripe({
    familyId,
    status: subscription.status,
    currentPeriodEnd,
    trialEndsAt,
    cancelAtPeriodEnd,
  });

  const renewalLabel = renewalDate ? renewalDate.slice(0, 10) : "the end of your current period";
  const message = autoRenew
    ? `Auto-renewal is on. Your plan renews on ${renewalLabel}.`
    : `Auto-renewal is off. Your plan cancels on ${renewalLabel}; you keep access until then.`;

  return {
    autoRenew: !cancelAtPeriodEnd,
    cancelAtPeriodEnd,
    renewalDate,
    status: subscription.status,
    message,
  };
}

export async function createFamilyBillingPortalSession(familyId) {
  const stripe = await getStripeClient();
  if (!stripe) {
    throw new Error("Stripe is not configured.");
  }

  const family = getFamilyById(familyId);
  if (!family?.stripe_customer_id) {
    throw new Error("No billing account yet. Subscribe first.");
  }

  const baseUrl = (process.env.APP_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
  const session = await stripe.billingPortal.sessions.create({
    customer: family.stripe_customer_id,
    return_url: `${baseUrl}/family/billing`,
  });
  return { url: session.url };
}

export async function applyStripeSubscriptionToFamily(subscription) {
  const familyId =
    Number(subscription.metadata?.family_id) ||
    findFamilyIdByStripeSubscription(subscription.id) ||
    findFamilyIdByStripeCustomer(subscription.customer);

  if (!familyId) {
    return null;
  }

  const interval = subscription.items?.data?.[0]?.price?.recurring?.interval || null;
  const mappedInterval = interval === "year" ? "year" : interval === "month" ? "month" : null;
  const family = getFamilyById(familyId);
  const pendingApplied = Boolean(
    family?.pending_plan_interval && mappedInterval && family.pending_plan_interval === mappedInterval,
  );

  updateFamilyBillingFromStripe({
    familyId,
    status: subscription.status,
    planInterval: mappedInterval,
    stripeCustomerId: String(subscription.customer || ""),
    stripeSubscriptionId: subscription.id,
    currentPeriodEnd: subscription.current_period_end
      ? new Date(subscription.current_period_end * 1000).toISOString()
      : null,
    trialEndsAt: subscription.trial_end
      ? new Date(subscription.trial_end * 1000).toISOString()
      : null,
    cancelAtPeriodEnd: mapCancelAtPeriodEndFromStripe(subscription.cancel_at_period_end),
  });

  if (pendingApplied || (family?.pending_plan_interval && !subscription.schedule)) {
    clearFamilyPendingPlanChange(familyId);
  }

  return familyId;
}
