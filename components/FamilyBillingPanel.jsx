"use client";

import { useState } from "react";
import AutoRenewControl from "./AutoRenewControl.jsx";
import FamilyUsageMeters from "./FamilyUsageMeters.jsx";

const CHANGEABLE_BILLING_STATUSES = new Set(["trialing", "active", "past_due"]);

function hasChangeableSubscription(billing) {
  return Boolean(
    billing.stripeSubscriptionId && CHANGEABLE_BILLING_STATUSES.has(String(billing.status || "")),
  );
}

function planIntervalLabel(interval) {
  return interval === "year" ? "yearly" : "monthly";
}

function formatPlanChangeDate(isoDate) {
  if (!isoDate) {
    return "";
  }
  return new Date(isoDate).toLocaleDateString("en-AU");
}

function planSwitchCopy(billing, interval, canChangePlan, yearlyDiscountPercent) {
  const label = planIntervalLabel(interval);
  if (billing.pendingCheckout) {
    return interval === "month" ? "Card required — free trial, then monthly billing." : `Save about ${yearlyDiscountPercent}% vs monthly.`;
  }
  if (interval === "month" && billing.planInterval === "month") {
    return "Your current plan.";
  }
  if (interval === "year" && billing.planInterval === "year") {
    return "Your current plan.";
  }
  if (!canChangePlan) {
    return interval === "month" ? "Pay month to month for your family workspace." : yearlyDiscountPercent ? `Save about ${yearlyDiscountPercent}% vs monthly.` : "Annual billing.";
  }
  if (billing.pendingPlanInterval === interval && billing.planChangeAt) {
    return `Switch scheduled — takes effect on ${formatPlanChangeDate(billing.planChangeAt)}.`;
  }
  if (billing.isTrialing) {
    return `Switch to ${label} billing — no charge until your trial ends.`;
  }
  return `Switch to ${label} billing — takes effect at your next renewal with no mid-cycle charge.`;
}

export default function FamilyBillingPanel({ billing, subscription, stripeEnabled, yearlyDiscountPercent }) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  if (!billing) {
    return (
      <section className="panel">
        <p className="eyebrow">Billing</p>
        <h2>Family subscription</h2>
        <div className="message error">Billing details are unavailable. Sign out and try again, or contact support.</div>
      </section>
    );
  }

  async function startCheckout(interval) {
    setLoading(true);
    setMessage("");
    const response = await fetch("/api/billing/family/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ interval }),
    });
    const payload = await response.json();
    setLoading(false);

    if (!response.ok) {
      setMessage(payload.error || "Could not start checkout.");
      return;
    }

    if (payload.planChanged) {
      setMessage(payload.message || "Plan switch scheduled.");
      window.location.reload();
      return;
    }

    if (payload.url) {
      window.location.assign(payload.url);
    }
  }

  async function openPortal() {
    setLoading(true);
    setMessage("");
    const response = await fetch("/api/billing/family/portal", { method: "POST" });
    const payload = await response.json();
    setLoading(false);

    if (!response.ok) {
      setMessage(payload.error || "Could not open billing portal.");
      return;
    }

    window.location.assign(payload.url);
  }

  const statusLabel = billing.status.replace(/_/g, " ");
  const trialDays = billing.trialDaysLeft || 0;
  const canChangePlan = hasChangeableSubscription(billing);
  const onMonthlyPlan = canChangePlan && billing.planInterval === "month";
  const onYearlyPlan = canChangePlan && billing.planInterval === "year";
  const monthlyScheduled = canChangePlan && billing.pendingPlanInterval === "month";
  const yearlyScheduled = canChangePlan && billing.pendingPlanInterval === "year";

  return (
    <section className="panel">
      <p className="eyebrow">Billing</p>
      <h2>Family subscription</h2>

      {billing.pendingCheckout ? (
        <div className="message warning">
          <p>
            Add a card on Stripe to start your free trial. You will not be charged until day {trialDays || 7}. Cancel
            anytime before then from the billing portal to avoid payment.
          </p>
        </div>
      ) : billing.isTrialing ? (
        <div className="message">
          <p>
            Your card is on file. You have {trialDays} trial day{trialDays === 1 ? "" : "s"} left — billing starts
            automatically when the trial ends unless you cancel anytime from the portal below.
          </p>
        </div>
      ) : null}

      {billing.pendingPlanInterval && billing.planChangeAt ? (
        <div className="message success">
          <p>
            Switch to {planIntervalLabel(billing.pendingPlanInterval)} plan scheduled — takes effect on{" "}
            {formatPlanChangeDate(billing.planChangeAt)}. You stay on {planIntervalLabel(billing.planInterval)} billing
            until then.
          </p>
        </div>
      ) : null}

      <div className="row">
        <span className="tag">Status: {statusLabel}</span>
        {billing.isTrialing ? <span className="tag">{trialDays} trial days left</span> : null}
        {billing.planInterval ? <span className="tag">{billing.planInterval}ly plan</span> : null}
        {billing.pendingPlanInterval ? (
          <span className="tag">Switching to {billing.pendingPlanInterval}ly</span>
        ) : null}
      </div>

      {billing.currentPeriodEnd ? (
        <p className="muted">Current period ends {new Date(billing.currentPeriodEnd).toLocaleString("en-AU")}</p>
      ) : billing.trialEndsAt ? (
        <p className="muted">First charge scheduled {new Date(billing.trialEndsAt).toLocaleString("en-AU")}</p>
      ) : null}

      <AutoRenewControl apiPath="/api/billing/family/auto-renew" billing={billing} canManage={canChangePlan} />

      <FamilyUsageMeters subscription={subscription} />

      {!stripeEnabled ? (
        <div className="message warning">
          Stripe is not configured. Add API keys and family price IDs in <code>.env.local</code>.
        </div>
      ) : (
        <div className="billing-plans">
          <article className="card billing-card">
            <h3>Monthly</h3>
            <p className="muted">{planSwitchCopy(billing, "month", canChangePlan, yearlyDiscountPercent)}</p>
            <button
              className="button primary"
              disabled={loading || onMonthlyPlan || monthlyScheduled}
              onClick={() => startCheckout("month")}
              type="button"
            >
              {onMonthlyPlan ? "Current plan" : monthlyScheduled ? "Switch scheduled" : canChangePlan ? "Switch to monthly" : "Subscribe monthly"}
            </button>
          </article>

          <article className="card billing-card">
            <h3>Yearly</h3>
            <p className="muted">{planSwitchCopy(billing, "year", canChangePlan, yearlyDiscountPercent)}</p>
            <button
              className="button primary"
              disabled={loading || onYearlyPlan || yearlyScheduled}
              onClick={() => startCheckout("year")}
              type="button"
            >
              {onYearlyPlan ? "Current plan" : yearlyScheduled ? "Switch scheduled" : canChangePlan ? "Switch to yearly" : "Subscribe yearly"}
            </button>
          </article>
        </div>
      )}

      {billing.stripeCustomerId ? (
        <button className="button secondary" disabled={loading} onClick={openPortal} type="button">
          Manage billing portal
        </button>
      ) : null}

      {message ? (
        <div className={`message ${message.toLowerCase().includes("scheduled") ? "success" : "error"}`}>{message}</div>
      ) : null}
    </section>
  );
}
