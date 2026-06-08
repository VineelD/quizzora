import Link from "next/link";
import BillingPanel from "../../../components/BillingPanel.jsx";
import LogoutButton from "../../../components/LogoutButton.jsx";
import SessionIdentityBadge from "../../../components/SessionIdentityBadge.jsx";
import SiteFooter from "../../../components/SiteFooter.jsx";
import { requireSession } from "../../../lib/auth.js";
import { getSchoolSubscription } from "../../../lib/billing-enforcement.js";
import { getSchoolBilling, getYearlyDiscountPercent, isStripeConfigured } from "../../../lib/billing.js";

export default async function AdminBillingPage({ searchParams }) {
  const admin = await requireSession("admin", { skipBilling: true });
  const params = await searchParams;
  const billing = getSchoolBilling(admin.school_id);
  const subscription = getSchoolSubscription(admin.school_id);
  const checkoutNote =
    params?.checkout === "success"
      ? "Payment received. It may take a minute for your subscription status to update."
      : params?.checkout === "cancel"
        ? "Checkout canceled. You can subscribe when ready."
        : "";

  return (
    <main className="shell" id="main-content">
      <nav className="nav">
        <Link className="brand" href="/admin">
          <span className="brand-mark">$</span>
          <span>Billing</span>
        </Link>
        <div className="row">
          <SessionIdentityBadge user={admin} />
          <Link className="button secondary" href="/admin">
            Admin home
          </Link>
          <LogoutButton />
        </div>
      </nav>

      {checkoutNote ? <div className="message success panel">{checkoutNote}</div> : null}

      {!billing.hasAccess ? (
        <section className="panel">
          <h1>{billing.pendingCheckout ? "Add your card to start the trial" : "Subscription required"}</h1>
          <p className="hero-copy">
            {billing.pendingCheckout
              ? "Complete Stripe checkout to begin your 7-day free trial. Your card is saved but not charged until day 7. Cancel anytime before then."
              : billing.trialDaysLeft === 0
                ? "Your trial has ended or payment is overdue. Subscribe below to restore access for teachers and students."
                : "Your school does not have an active plan. Subscribe below to restore access."}
          </p>
        </section>
      ) : null}

      <BillingPanel
        billing={billing}
        subscription={subscription}
        stripeEnabled={isStripeConfigured()}
        yearlyDiscountPercent={getYearlyDiscountPercent()}
      />

      <SiteFooter />
    </main>
  );
}
