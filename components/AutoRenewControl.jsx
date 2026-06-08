"use client";

import { useState } from "react";

function formatRenewalDate(isoDate) {
  if (!isoDate) {
    return "";
  }
  return new Date(isoDate).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default function AutoRenewControl({ billing, apiPath, canManage }) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [autoRenew, setAutoRenew] = useState(billing.autoRenew !== false);
  const renewalDate = billing.renewalDate || billing.trialEndsAt || billing.currentPeriodEnd;

  if (!canManage) {
    return null;
  }

  async function toggleAutoRenew(nextValue) {
    setLoading(true);
    setMessage("");
    const response = await fetch(apiPath, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ autoRenew: nextValue }),
    });
    const payload = await response.json();
    setLoading(false);

    if (!response.ok) {
      setMessage(payload.error || "Could not update auto-renewal.");
      return;
    }

    setAutoRenew(payload.autoRenew);
    setMessage(payload.message || "Auto-renewal updated.");
  }

  const statusLine = renewalDate
    ? autoRenew
      ? `Renews on ${formatRenewalDate(renewalDate)}`
      : `Cancels on ${formatRenewalDate(renewalDate)}`
    : autoRenew
      ? "Renews at the end of your current period"
      : "Cancels at the end of your current period";

  return (
    <article className="card billing-auto-renew">
      <div className="billing-auto-renew-header">
        <div>
          <h3>Auto-renewal</h3>
          <p className="muted">{statusLine}</p>
        </div>
        <label className="auto-renew-toggle">
          <input
            checked={autoRenew}
            disabled={loading}
            onChange={(event) => toggleAutoRenew(event.target.checked)}
            type="checkbox"
          />
          <span aria-hidden="true" className="auto-renew-slider" />
          <span className="sr-only">{autoRenew ? "Auto-renewal on" : "Auto-renewal off"}</span>
        </label>
      </div>
      <p className="muted billing-auto-renew-copy">
        {autoRenew
          ? "Your subscription renews automatically at the end of each billing period."
          : "Your subscription stays active until the date above, then ends. Turn auto-renewal back on anytime before then to keep your plan."}
      </p>
      {message ? (
        <div className={`message ${message.toLowerCase().includes("error") ? "error" : "success"}`}>{message}</div>
      ) : null}
    </article>
  );
}
