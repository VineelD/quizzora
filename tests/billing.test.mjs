import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";

const tempDir = mkdtempSync(join(tmpdir(), "littlecode-billing-"));
process.env.SQLITE_DATABASE_PATH = join(tempDir, "billing.sqlite");
process.env.BILLING_TRIAL_DAYS = "7";

const db = await import("../lib/db.js");
const billing = await import("../lib/billing.js");

before(() => {
  db.getDb();
});

after(() => {
  db.resetDatabaseForTests();
  rmSync(tempDir, { recursive: true, force: true });
});

test("new school starts on trial with access", () => {
  const { school } = db.createSchoolWithAdmin({
    schoolName: "Trial School",
    schoolSlug: "trial-school",
    name: "Admin",
    email: "trial-admin@trial.example",
    password: "Admin12345!",
  });

  const status = billing.getSchoolBilling(school.id);
  assert.equal(status.status, "trialing");
  assert.ok(status.hasAccess);
  assert.ok(status.trialDaysLeft >= 6);
});

test("expired trial blocks access", () => {
  const { school } = db.createSchoolWithAdmin({
    schoolName: "Expired School",
    schoolSlug: "expired-school",
    name: "Admin",
    email: "expired-admin@expired.example",
    password: "Admin12345!",
  });

  db.getDb()
    .prepare(
      `
      UPDATE schools
      SET trial_ends_at = datetime('now', '-1 day'), subscription_status = 'trialing'
      WHERE id = ?
    `,
    )
    .run(school.id);

  const status = billing.getSchoolBilling(school.id);
  assert.equal(status.needsPayment, true);
  assert.equal(status.hasAccess, false);
});

test("active subscription grants access", () => {
  const schoolId = db.getDefaultSchoolId();
  billing.updateSchoolBillingFromStripe({
    schoolId,
    status: "active",
    planInterval: "year",
    stripeSubscriptionId: "sub_test_active",
    stripeCustomerId: "cus_test_active",
    currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  });

  const status = billing.getSchoolBilling(schoolId);
  assert.equal(status.hasAccess, true);
  assert.equal(status.planInterval, "year");
});

test("stripe-enabled school without subscription needs checkout", () => {
  const originalKey = process.env.STRIPE_SECRET_KEY;
  process.env.STRIPE_SECRET_KEY = "sk_test_checkout_gate";

  try {
    const { school } = db.createSchoolWithAdmin({
      schoolName: "Checkout School",
      schoolSlug: "checkout-school",
      name: "Admin",
      email: "checkout-admin@checkout.example",
      password: "Admin12345!",
    });

    const status = billing.getSchoolBilling(school.id);
    assert.equal(status.hasAccess, false);
    assert.equal(status.pendingCheckout, true);
    assert.equal(status.needsPayment, true);
  } finally {
    if (originalKey) {
      process.env.STRIPE_SECRET_KEY = originalKey;
    } else {
      delete process.env.STRIPE_SECRET_KEY;
    }
  }
});

test("stripe customer without subscription id still has access while trialing", () => {
  const originalKey = process.env.STRIPE_SECRET_KEY;
  process.env.STRIPE_SECRET_KEY = "sk_test_checkout_gate";

  try {
    const { school } = db.createSchoolWithAdmin({
      schoolName: "Checkout Grace School",
      schoolSlug: "checkout-grace-school",
      name: "Admin",
      email: "grace-admin@grace.example",
      password: "Admin12345!",
    });

    billing.updateSchoolBillingFromStripe({
      schoolId: school.id,
      status: "trialing",
      stripeCustomerId: "cus_test_grace",
      trialEndsAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
    });

    const status = billing.getSchoolBilling(school.id);
    assert.equal(status.hasAccess, true);
    assert.equal(status.pendingCheckout, false);
  } finally {
    if (originalKey) {
      process.env.STRIPE_SECRET_KEY = originalKey;
    } else {
      delete process.env.STRIPE_SECRET_KEY;
    }
  }
});

test("stripe trialing subscription with card on file has access", () => {
  const originalKey = process.env.STRIPE_SECRET_KEY;
  process.env.STRIPE_SECRET_KEY = "sk_test_checkout_gate";

  try {
    const { school } = db.createSchoolWithAdmin({
      schoolName: "Stripe Trial School",
      schoolSlug: "stripe-trial-school",
      name: "Admin",
      email: "stripe-trial-admin@stripe-trial.example",
      password: "Admin12345!",
    });

    billing.updateSchoolBillingFromStripe({
      schoolId: school.id,
      status: "trialing",
      stripeSubscriptionId: "sub_test_trial",
      stripeCustomerId: "cus_test_trial",
      trialEndsAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
    });

    const status = billing.getSchoolBilling(school.id);
    assert.equal(status.hasAccess, true);
    assert.equal(status.isTrialing, true);
    assert.equal(status.pendingCheckout, false);
  } finally {
    if (originalKey) {
      process.env.STRIPE_SECRET_KEY = originalKey;
    } else {
      delete process.env.STRIPE_SECRET_KEY;
    }
  }
});

test("duplicate same-plan selection is detected for active subscriptions", () => {
  assert.equal(
    billing.isDuplicatePlanSelection({
      stripeSubscriptionId: "sub_active",
      planInterval: "month",
      subscriptionStatus: "active",
      targetInterval: "month",
    }),
    true,
  );
  assert.equal(
    billing.isDuplicatePlanSelection({
      stripeSubscriptionId: "sub_active",
      planInterval: "month",
      subscriptionStatus: "active",
      targetInterval: "year",
    }),
    false,
  );
});

test("duplicate same-plan selection is ignored for canceled subscriptions", () => {
  assert.equal(
    billing.isDuplicatePlanSelection({
      stripeSubscriptionId: "sub_old",
      planInterval: "month",
      subscriptionStatus: "canceled",
      targetInterval: "month",
    }),
    false,
  );
});

test("trialing plan changes schedule at trial end with current price until then", () => {
  const trialEnd = Math.floor(Date.now() / 1000) + 5 * 24 * 60 * 60;
  const periodStart = trialEnd - 7 * 24 * 60 * 60;
  const subscription = {
    status: "trialing",
    trial_end: trialEnd,
    current_period_start: periodStart,
    current_period_end: trialEnd,
    items: { data: [{ price: { id: "price_monthly_test" } }] },
  };

  assert.equal(billing.resolvePlanChangeEffectiveAt(subscription), trialEnd);

  const phases = billing.buildSubscriptionSchedulePhases(subscription, "price_yearly_test", periodStart);
  assert.equal(phases.length, 2);
  assert.equal(phases[0].items[0].price, "price_monthly_test");
  assert.equal(phases[0].end_date, trialEnd);
  assert.equal(phases[0].trial_end, trialEnd);
  assert.equal(phases[0].proration_behavior, "none");
  assert.equal(phases[1].items[0].price, "price_yearly_test");
  assert.equal(phases[1].start_date, trialEnd);
  assert.equal(phases[1].proration_behavior, "none");
});

test("active plan changes schedule at current period end without proration", () => {
  const periodEnd = Math.floor(Date.now() / 1000) + 20 * 24 * 60 * 60;
  const periodStart = periodEnd - 30 * 24 * 60 * 60;
  const subscription = {
    status: "active",
    current_period_start: periodStart,
    current_period_end: periodEnd,
    items: { data: [{ price: { id: "price_monthly_test" } }] },
  };

  assert.equal(billing.resolvePlanChangeEffectiveAt(subscription), periodEnd);

  const phases = billing.buildSubscriptionSchedulePhases(subscription, "price_yearly_test", periodStart);
  assert.equal(phases[0].items[0].price, "price_monthly_test");
  assert.equal(phases[0].end_date, periodEnd);
  assert.equal(phases[0].trial_end, undefined);
  assert.equal(phases[1].start_date, periodEnd);
  assert.equal(phases[1].proration_behavior, "none");
});

test("deprecated immediate update params remain available for compatibility", () => {
  const trialEnd = Math.floor(Date.now() / 1000) + 5 * 24 * 60 * 60;
  const params = billing.resolveSubscriptionUpdateParams(
    {
      status: "trialing",
      trial_end: trialEnd,
      items: { data: [{ id: "si_test_item" }] },
    },
    "price_yearly_test",
  );

  assert.equal(params.proration_behavior, "none");
  assert.equal(params.trial_end, trialEnd);
});

test("duplicate plan selection includes pending scheduled plan", () => {
  assert.equal(
    billing.isDuplicatePlanSelection({
      stripeSubscriptionId: "sub_active",
      planInterval: "month",
      subscriptionStatus: "active",
      targetInterval: "year",
      pendingPlanInterval: "year",
    }),
    true,
  );
});

test("pending plan change is stored and cleared for schools", () => {
  const schoolId = db.getDefaultSchoolId();
  const effectiveAt = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString();

  billing.setSchoolPendingPlanChange({
    schoolId,
    pendingPlanInterval: "year",
    pendingPriceId: "price_yearly_test",
    planChangeAt: effectiveAt,
  });

  let status = billing.getSchoolBilling(schoolId);
  assert.equal(status.pendingPlanInterval, "year");
  assert.equal(status.pendingPriceId, "price_yearly_test");
  assert.equal(status.planChangeAt, effectiveAt);

  billing.clearSchoolPendingPlanChange(schoolId);
  status = billing.getSchoolBilling(schoolId);
  assert.equal(status.pendingPlanInterval, null);
  assert.equal(status.planChangeAt, null);
});

test("assertNotDuplicatePlan rejects same plan while trialing", () => {
  assert.throws(
    () =>
      billing.assertNotDuplicatePlan({
        stripeSubscriptionId: "sub_trial",
        planInterval: "year",
        subscriptionStatus: "trialing",
        targetInterval: "year",
      }),
    /already on the yearly plan/,
  );
});

test("resolveEffectivePlanInterval falls back to Stripe interval when DB is null", () => {
  assert.equal(
    billing.resolveEffectivePlanInterval({ planInterval: null, stripePriceInterval: "month" }),
    "month",
  );
  assert.equal(
    billing.resolveEffectivePlanInterval({ planInterval: "year", stripePriceInterval: "month" }),
    "year",
  );
});

test("active billing record blocks new checkout without subscription id", () => {
  assert.equal(
    billing.hasActiveBillingRecord({
      stripeSubscriptionId: null,
      subscriptionStatus: "trialing",
      stripeCustomerId: "cus_syncing",
    }),
    true,
  );
  assert.equal(
    billing.hasActiveBillingRecord({
      stripeSubscriptionId: "sub_active",
      subscriptionStatus: "active",
      stripeCustomerId: "cus_active",
    }),
    true,
  );
  assert.equal(
    billing.hasActiveBillingRecord({
      stripeSubscriptionId: null,
      subscriptionStatus: "canceled",
      stripeCustomerId: "cus_old",
    }),
    false,
  );
});

test("resolveSubscriptionRenewalDate prefers trial end while trialing", () => {
  const trialEndsAt = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();
  const currentPeriodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  assert.equal(
    billing.resolveSubscriptionRenewalDate({
      status: "trialing",
      trialEndsAt,
      currentPeriodEnd,
    }),
    trialEndsAt,
  );
  assert.equal(
    billing.resolveSubscriptionRenewalDate({
      status: "active",
      trialEndsAt,
      currentPeriodEnd,
    }),
    currentPeriodEnd,
  );
});

test("auto-renew defaults on and syncs cancel_at_period_end from Stripe", () => {
  const schoolId = db.getDefaultSchoolId();
  const periodEnd = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000).toISOString();

  billing.updateSchoolBillingFromStripe({
    schoolId,
    status: "active",
    planInterval: "month",
    stripeSubscriptionId: "sub_auto_renew_on",
    stripeCustomerId: "cus_auto_renew_on",
    currentPeriodEnd: periodEnd,
    cancelAtPeriodEnd: false,
  });

  let status = billing.getSchoolBilling(schoolId);
  assert.equal(status.autoRenew, true);
  assert.equal(status.cancelAtPeriodEnd, false);
  assert.equal(status.renewalDate, periodEnd);

  billing.updateSchoolBillingFromStripe({
    schoolId,
    status: "active",
    cancelAtPeriodEnd: true,
  });

  status = billing.getSchoolBilling(schoolId);
  assert.equal(status.autoRenew, false);
  assert.equal(status.cancelAtPeriodEnd, true);
});

test("mapCancelAtPeriodEndFromStripe coerces Stripe boolean", () => {
  assert.equal(billing.mapCancelAtPeriodEndFromStripe(true), true);
  assert.equal(billing.mapCancelAtPeriodEndFromStripe(false), false);
  assert.equal(billing.mapCancelAtPeriodEndFromStripe(undefined), false);
});
