import { getDb, getSchoolById } from "./db.js";
import { OPERATOR_PRODUCT_NAME, operatorDisplayLine } from "./operator.js";

const ACTIVE_STATUSES = new Set(["trialing", "active"]);
export const CHANGEABLE_BILLING_STATUSES = new Set(["trialing", "active", "past_due"]);

export function hasChangeableSubscription({ stripeSubscriptionId, subscriptionStatus }) {
  return Boolean(
    stripeSubscriptionId && CHANGEABLE_BILLING_STATUSES.has(String(subscriptionStatus || "")),
  );
}

export function hasActiveBillingRecord({
  stripeSubscriptionId,
  subscriptionStatus,
  stripeCustomerId = null,
}) {
  if (hasChangeableSubscription({ stripeSubscriptionId, subscriptionStatus })) {
    return true;
  }
  return Boolean(
    stripeCustomerId && CHANGEABLE_BILLING_STATUSES.has(String(subscriptionStatus || "")),
  );
}

export async function resolveChangeableSubscriptionId(stripe, customerId) {
  if (!stripe || !customerId) {
    return null;
  }

  const subscriptions = await stripe.subscriptions.list({
    customer: String(customerId),
    status: "all",
    limit: 20,
  });

  const match = subscriptions.data.find((subscription) =>
    CHANGEABLE_BILLING_STATUSES.has(String(subscription.status || "")),
  );
  return match?.id || null;
}

export function isDuplicatePlanSelection({
  stripeSubscriptionId,
  planInterval,
  subscriptionStatus,
  targetInterval,
  pendingPlanInterval = null,
}) {
  if (!hasChangeableSubscription({ stripeSubscriptionId, subscriptionStatus })) {
    return false;
  }
  if (planInterval === targetInterval) {
    return true;
  }
  return pendingPlanInterval === targetInterval;
}

export function assertNotDuplicatePlan({
  stripeSubscriptionId,
  planInterval,
  subscriptionStatus,
  targetInterval,
  pendingPlanInterval = null,
}) {
  if (
    isDuplicatePlanSelection({
      stripeSubscriptionId,
      planInterval,
      subscriptionStatus,
      targetInterval,
      pendingPlanInterval,
    })
  ) {
    const label = targetInterval === "year" ? "yearly" : "monthly";
    throw new Error(`You are already on the ${label} plan.`);
  }
}

export function resolvePlanChangeEffectiveAt(subscription) {
  if (subscription.status === "trialing" && subscription.trial_end) {
    return subscription.trial_end;
  }
  if (subscription.current_period_end) {
    return subscription.current_period_end;
  }
  throw new Error("Subscription has no renewal date to schedule the plan change.");
}

export function buildSubscriptionSchedulePhases(subscription, newPriceId, phaseStart = null) {
  const currentItem = subscription.items?.data?.[0];
  const currentPriceId = currentItem?.price?.id;
  if (!currentPriceId) {
    throw new Error("Subscription has no billable items.");
  }

  const effectiveAt = resolvePlanChangeEffectiveAt(subscription);
  const phase0Start =
    phaseStart ||
    subscription.current_period_start ||
    subscription.start_date ||
    Math.floor(Date.now() / 1000);

  const phase1 = {
    items: [{ price: currentPriceId, quantity: 1 }],
    start_date: phase0Start,
    end_date: effectiveAt,
    proration_behavior: "none",
  };

  if (subscription.status === "trialing" && subscription.trial_end) {
    phase1.trial_end = subscription.trial_end;
  }

  const phase2 = {
    items: [{ price: newPriceId, quantity: 1 }],
    start_date: effectiveAt,
    proration_behavior: "none",
  };

  return [phase1, phase2];
}

export async function scheduleSubscriptionPlanChange(stripe, subscription, newPriceId, metadata = {}) {
  const scheduleId =
    typeof subscription.schedule === "string"
      ? subscription.schedule
      : subscription.schedule?.id || null;

  let schedule;
  if (scheduleId) {
    schedule = await stripe.subscriptionSchedules.retrieve(scheduleId);
  } else {
    schedule = await stripe.subscriptionSchedules.create({
      from_subscription: subscription.id,
    });
  }

  const phaseStart = schedule.phases?.[0]?.start_date || null;
  const phases = buildSubscriptionSchedulePhases(subscription, newPriceId, phaseStart);

  const updatedSchedule = await stripe.subscriptionSchedules.update(schedule.id, {
    end_behavior: "release",
    metadata,
    phases,
  });

  return updatedSchedule;
}

/** @deprecated Immediate subscription item updates are not used for plan changes. */
export function resolveSubscriptionUpdateParams(subscription, newPriceId) {
  const itemId = subscription.items?.data?.[0]?.id;
  if (!itemId) {
    throw new Error("Subscription has no billable items.");
  }

  const isTrialing = subscription.status === "trialing";
  const params = {
    items: [{ id: itemId, price: newPriceId }],
    proration_behavior: isTrialing ? "none" : "create_prorations",
  };

  if (isTrialing && subscription.trial_end) {
    params.trial_end = subscription.trial_end;
  }

  return params;
}

function planIntervalLabel(interval) {
  return interval === "year" ? "yearly" : "monthly";
}

export function mapStripePriceInterval(interval) {
  if (interval === "year") {
    return "year";
  }
  if (interval === "month") {
    return "month";
  }
  return null;
}

export function resolveEffectivePlanInterval({ planInterval, stripePriceInterval }) {
  return planInterval || mapStripePriceInterval(stripePriceInterval);
}

export function resolveSubscriptionRenewalDate({ status, trialEndsAt, currentPeriodEnd }) {
  if (status === "trialing" && trialEndsAt) {
    return trialEndsAt;
  }
  return currentPeriodEnd || null;
}

export function mapCancelAtPeriodEndFromStripe(cancelAtPeriodEnd) {
  return Boolean(cancelAtPeriodEnd);
}

export function resolveSubscriptionAccess({
  subscriptionStatus,
  trialEndsAt,
  currentPeriodEnd,
  stripeSubscriptionId,
  stripeCustomerId = null,
  now = Date.now(),
}) {
  const trialEnds = trialEndsAt ? new Date(trialEndsAt).getTime() : null;
  const periodEnds = currentPeriodEnd ? new Date(currentPeriodEnd).getTime() : null;
  const status = String(subscriptionStatus || "trialing");
  // Checkout can finish before subscription id is stored; customer id means card on file.
  const pendingCheckout =
    isStripeConfigured() && !stripeSubscriptionId && !stripeCustomerId;

  let access = ACTIVE_STATUSES.has(status);
  if (pendingCheckout) {
    access = false;
  }
  if (status === "trialing" && trialEnds && trialEnds <= now) {
    access = false;
  }
  if (status === "active" && periodEnds && periodEnds <= now) {
    access = false;
  }

  const trialDaysLeft =
    status === "trialing" && trialEnds ? Math.max(0, Math.ceil((trialEnds - now) / (24 * 60 * 60 * 1000))) : 0;

  return {
    status,
    hasAccess: access,
    needsPayment: !access,
    isTrialing: status === "trialing" && access,
    trialDaysLeft,
    pendingCheckout,
  };
}

export function getTrialDays() {
  return Math.max(Number(process.env.BILLING_TRIAL_DAYS || 7), 1);
}

export function isStripeConfigured() {
  return Boolean(process.env.STRIPE_SECRET_KEY?.trim());
}

export function getStripePriceIds() {
  return {
    month: process.env.STRIPE_PRICE_MONTHLY?.trim() || "",
    year: process.env.STRIPE_PRICE_YEARLY?.trim() || "",
  };
}

export function getYearlyDiscountPercent() {
  return Number(process.env.BILLING_YEARLY_DISCOUNT_PERCENT || 17);
}

export async function getStripeClient() {
  if (!isStripeConfigured()) {
    return null;
  }
  const Stripe = (await import("stripe")).default;
  return new Stripe(process.env.STRIPE_SECRET_KEY.trim());
}

export function trialEndsAtFromNow(days = getTrialDays()) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

export function initSchoolTrial(db, schoolId) {
  db.prepare(
    `
    UPDATE schools
    SET
      subscription_status = 'trialing',
      trial_ends_at = ?,
      plan_interval = NULL,
      current_period_end = NULL
    WHERE id = ?
  `,
  ).run(trialEndsAtFromNow(), schoolId);
}

export function getSchoolBilling(schoolId) {
  const school = getSchoolById(schoolId);
  if (!school) {
    return null;
  }

  const accessState = resolveSubscriptionAccess({
    subscriptionStatus: school.subscription_status,
    trialEndsAt: school.trial_ends_at,
    currentPeriodEnd: school.current_period_end,
    stripeSubscriptionId: school.stripe_subscription_id,
    stripeCustomerId: school.stripe_customer_id,
  });

  return {
    schoolId: school.id,
    schoolName: school.name,
    status: accessState.status,
    planInterval: school.plan_interval || null,
    trialEndsAt: school.trial_ends_at,
    currentPeriodEnd: school.current_period_end,
    stripeCustomerId: school.stripe_customer_id,
    stripeSubscriptionId: school.stripe_subscription_id,
    hasAccess: accessState.hasAccess,
    trialDaysLeft: accessState.trialDaysLeft,
    needsPayment: accessState.needsPayment,
    isTrialing: accessState.isTrialing,
    pendingCheckout: accessState.pendingCheckout,
    pendingPlanInterval: school.pending_plan_interval || null,
    pendingPriceId: school.pending_price_id || null,
    planChangeAt: school.plan_change_at || null,
    cancelAtPeriodEnd: Boolean(school.cancel_at_period_end),
    autoRenew: !school.cancel_at_period_end,
    renewalDate: resolveSubscriptionRenewalDate({
      status: accessState.status,
      trialEndsAt: school.trial_ends_at,
      currentPeriodEnd: school.current_period_end,
    }),
  };
}

export function setSchoolPendingPlanChange({ schoolId, pendingPlanInterval, pendingPriceId, planChangeAt }) {
  getDb()
    .prepare(
      `
      UPDATE schools
      SET
        pending_plan_interval = ?,
        pending_price_id = ?,
        plan_change_at = ?
      WHERE id = ?
    `,
    )
    .run(pendingPlanInterval, pendingPriceId, planChangeAt, schoolId);
}

export function clearSchoolPendingPlanChange(schoolId) {
  getDb()
    .prepare(
      `
      UPDATE schools
      SET
        pending_plan_interval = NULL,
        pending_price_id = NULL,
        plan_change_at = NULL
      WHERE id = ?
    `,
    )
    .run(schoolId);
}

export function assertSchoolHasAccess(schoolId) {
  const billing = getSchoolBilling(schoolId);
  if (!billing) {
    throw new Error("School not found.");
  }
  if (!billing.hasAccess) {
    throw new Error("Subscription required. Ask your school administrator to renew billing.");
  }
  return billing;
}

export function updateSchoolBillingFromStripe({
  schoolId,
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
      UPDATE schools
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
      schoolId,
    );
}

export function recordBillingEvent({ schoolId, stripeEventId, eventType, payload }) {
  getDb()
    .prepare(
      `
      INSERT INTO billing_events (school_id, stripe_event_id, event_type, payload_json)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(stripe_event_id) DO NOTHING
    `,
    )
    .run(schoolId, stripeEventId, eventType, JSON.stringify(payload));
}

export function findSchoolIdByStripeCustomer(customerId) {
  const row = getDb()
    .prepare("SELECT id FROM schools WHERE stripe_customer_id = ?")
    .get(String(customerId || ""));
  return row ? Number(row.id) : null;
}

export function findSchoolIdByStripeSubscription(subscriptionId) {
  const row = getDb()
    .prepare("SELECT id FROM schools WHERE stripe_subscription_id = ?")
    .get(String(subscriptionId || ""));
  return row ? Number(row.id) : null;
}

export function schoolQualifiesForTrial(school) {
  return !school?.stripe_subscription_id;
}

export async function changeSchoolSubscriptionPlan({ schoolId, interval }) {
  const stripe = await getStripeClient();
  if (!stripe) {
    throw new Error("Stripe is not configured. Add STRIPE_SECRET_KEY and price IDs to .env.local.");
  }

  const school = getSchoolById(schoolId);
  if (!school) {
    throw new Error("School not found.");
  }

  if (
    !hasChangeableSubscription({
      stripeSubscriptionId: school.stripe_subscription_id,
      subscriptionStatus: school.subscription_status,
    })
  ) {
    throw new Error("No active subscription to change. Subscribe first.");
  }

  const prices = getStripePriceIds();
  const priceId = interval === "year" ? prices.year : prices.month;
  if (!priceId) {
    throw new Error(`Stripe price for ${interval} is not configured.`);
  }

  const subscription = await stripe.subscriptions.retrieve(school.stripe_subscription_id);
  const stripePriceInterval = subscription.items?.data?.[0]?.price?.recurring?.interval || null;
  assertNotDuplicatePlan({
    stripeSubscriptionId: school.stripe_subscription_id,
    planInterval: resolveEffectivePlanInterval({
      planInterval: school.plan_interval,
      stripePriceInterval,
    }),
    subscriptionStatus: school.subscription_status,
    targetInterval: interval,
    pendingPlanInterval: school.pending_plan_interval,
  });

  await scheduleSubscriptionPlanChange(stripe, subscription, priceId, {
    school_id: String(schoolId),
  });

  const refreshed = await stripe.subscriptions.retrieve(school.stripe_subscription_id);
  const mappedInterval = interval === "year" ? "year" : "month";
  const effectiveAt = resolvePlanChangeEffectiveAt(refreshed);
  const effectiveAtIso = new Date(effectiveAt * 1000).toISOString();
  const currentInterval = resolveEffectivePlanInterval({
    planInterval: school.plan_interval,
    stripePriceInterval,
  });

  updateSchoolBillingFromStripe({
    schoolId,
    status: refreshed.status,
    currentPeriodEnd: refreshed.current_period_end
      ? new Date(refreshed.current_period_end * 1000).toISOString()
      : null,
    trialEndsAt: refreshed.trial_end ? new Date(refreshed.trial_end * 1000).toISOString() : null,
  });
  setSchoolPendingPlanChange({
    schoolId,
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

export async function subscribeOrChangeSchoolPlan({ schoolId, interval, customerEmail, allowTrial = null }) {
  const stripe = await getStripeClient();
  if (!stripe) {
    throw new Error("Stripe is not configured. Add STRIPE_SECRET_KEY and price IDs to .env.local.");
  }

  const school = getSchoolById(schoolId);
  if (!school) {
    throw new Error("School not found.");
  }

  assertNotDuplicatePlan({
    stripeSubscriptionId: school.stripe_subscription_id,
    planInterval: school.plan_interval,
    subscriptionStatus: school.subscription_status,
    targetInterval: interval,
  });

  if (
    hasChangeableSubscription({
      stripeSubscriptionId: school.stripe_subscription_id,
      subscriptionStatus: school.subscription_status,
    })
  ) {
    return changeSchoolSubscriptionPlan({ schoolId, interval });
  }

  if (
    hasActiveBillingRecord({
      stripeSubscriptionId: school.stripe_subscription_id,
      subscriptionStatus: school.subscription_status,
      stripeCustomerId: school.stripe_customer_id,
    })
  ) {
    const resolvedSubscriptionId = await resolveChangeableSubscriptionId(
      stripe,
      school.stripe_customer_id,
    );
    if (resolvedSubscriptionId) {
      updateSchoolBillingFromStripe({
        schoolId,
        stripeSubscriptionId: resolvedSubscriptionId,
      });
      return changeSchoolSubscriptionPlan({ schoolId, interval });
    }
    throw new Error("Your subscription is still syncing. Refresh the page and try again.");
  }

  return createCheckoutSession({ schoolId, interval, customerEmail, allowTrial });
}

export async function createCheckoutSession({ schoolId, interval, customerEmail, allowTrial = null }) {
  const stripe = await getStripeClient();
  if (!stripe) {
    throw new Error("Stripe is not configured. Add STRIPE_SECRET_KEY and price IDs to .env.local.");
  }

  const prices = getStripePriceIds();
  const priceId = interval === "year" ? prices.year : prices.month;
  if (!priceId) {
    throw new Error(`Stripe price for ${interval} is not configured.`);
  }

  const school = getSchoolById(schoolId);
  if (!school) {
    throw new Error("School not found.");
  }

  assertNotDuplicatePlan({
    stripeSubscriptionId: school.stripe_subscription_id,
    planInterval: school.plan_interval,
    subscriptionStatus: school.subscription_status,
    targetInterval: interval,
  });

  if (
    hasActiveBillingRecord({
      stripeSubscriptionId: school.stripe_subscription_id,
      subscriptionStatus: school.subscription_status,
      stripeCustomerId: school.stripe_customer_id,
    })
  ) {
    throw new Error("You already have an active subscription. Use plan change instead of checkout.");
  }

  const baseUrl = (process.env.APP_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
  const grantTrial = allowTrial === true || (allowTrial !== false && schoolQualifiesForTrial(school));

  const sessionParams = {
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${baseUrl}/admin/billing?checkout=success`,
    cancel_url: `${baseUrl}/admin/billing?checkout=cancel`,
    client_reference_id: String(schoolId),
    metadata: { school_id: String(schoolId), plan_interval: interval },
    subscription_data: {
      metadata: { school_id: String(schoolId) },
      description: `${OPERATOR_PRODUCT_NAME} school subscription (${operatorDisplayLine()})`,
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

  if (school.stripe_customer_id) {
    sessionParams.customer = school.stripe_customer_id;
    delete sessionParams.customer_email;
  }

  if (grantTrial) {
    sessionParams.subscription_data.trial_period_days = getTrialDays();
  }

  const session = await stripe.checkout.sessions.create(sessionParams);
  return { url: session.url, sessionId: session.id };
}

export async function syncStripeCheckoutSession(session) {
  if (!session?.subscription || !session.customer) {
    return null;
  }

  const stripe = await getStripeClient();
  if (!stripe) {
    return null;
  }

  const subscription = await stripe.subscriptions.retrieve(String(session.subscription));
  const interval = subscription.items?.data?.[0]?.price?.recurring?.interval || null;
  const mappedInterval = interval === "year" ? "year" : interval === "month" ? "month" : null;

  return {
    status: subscription.status,
    stripeCustomerId: String(session.customer),
    stripeSubscriptionId: subscription.id,
    planInterval: mappedInterval,
    currentPeriodEnd: subscription.current_period_end
      ? new Date(subscription.current_period_end * 1000).toISOString()
      : null,
    trialEndsAt: subscription.trial_end ? new Date(subscription.trial_end * 1000).toISOString() : null,
    cancelAtPeriodEnd: mapCancelAtPeriodEndFromStripe(subscription.cancel_at_period_end),
  };
}

export async function setSchoolSubscriptionAutoRenew({ schoolId, autoRenew }) {
  const stripe = await getStripeClient();
  if (!stripe) {
    throw new Error("Stripe is not configured. Add STRIPE_SECRET_KEY and price IDs to .env.local.");
  }

  const school = getSchoolById(schoolId);
  if (!school) {
    throw new Error("School not found.");
  }

  if (
    !hasChangeableSubscription({
      stripeSubscriptionId: school.stripe_subscription_id,
      subscriptionStatus: school.subscription_status,
    })
  ) {
    throw new Error("No active subscription to update.");
  }

  const subscription = await stripe.subscriptions.update(school.stripe_subscription_id, {
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

  updateSchoolBillingFromStripe({
    schoolId,
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

export async function createBillingPortalSession(schoolId) {
  const stripe = await getStripeClient();
  if (!stripe) {
    throw new Error("Stripe is not configured.");
  }

  const school = getSchoolById(schoolId);
  if (!school?.stripe_customer_id) {
    throw new Error("No billing account yet. Subscribe first.");
  }

  const baseUrl = (process.env.APP_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
  const session = await stripe.billingPortal.sessions.create({
    customer: school.stripe_customer_id,
    return_url: `${baseUrl}/admin/billing`,
  });
  return { url: session.url };
}

export async function applyStripeSubscriptionToSchool(subscription) {
  const schoolId =
    Number(subscription.metadata?.school_id) ||
    findSchoolIdByStripeSubscription(subscription.id) ||
    findSchoolIdByStripeCustomer(subscription.customer);

  if (!schoolId) {
    return null;
  }

  const interval = subscription.items?.data?.[0]?.price?.recurring?.interval || null;
  const mappedInterval = interval === "year" ? "year" : interval === "month" ? "month" : null;
  const school = getSchoolById(schoolId);
  const pendingApplied = Boolean(
    school?.pending_plan_interval && mappedInterval && school.pending_plan_interval === mappedInterval,
  );

  updateSchoolBillingFromStripe({
    schoolId,
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

  if (pendingApplied || (school?.pending_plan_interval && !subscription.schedule)) {
    clearSchoolPendingPlanChange(schoolId);
  }

  return schoolId;
}
