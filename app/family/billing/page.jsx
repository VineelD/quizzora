import Link from "next/link";
import FamilyBillingPanel from "../../../components/FamilyBillingPanel.jsx";
import LogoutButton from "../../../components/LogoutButton.jsx";
import SessionIdentityBadge from "../../../components/SessionIdentityBadge.jsx";
import SiteFooter from "../../../components/SiteFooter.jsx";
import { requireSession } from "../../../lib/auth.js";
import { getFamilySubscription } from "../../../lib/billing-enforcement.js";
import { getFamilyBilling } from "../../../lib/family-billing.js";
import { getYearlyDiscountPercent, isStripeConfigured } from "../../../lib/billing.js";

export default async function FamilyBillingPage({ searchParams }) {
  const parent = await requireSession("parent", { skipBilling: true });
  const params = await searchParams;
  const billing = getFamilyBilling(parent.family_id);
  const subscription = getFamilySubscription(parent.family_id);
  const checkoutNote =
    params?.checkout === "success"
      ? "Payment received. It may take a minute for your subscription status to update."
      : params?.checkout === "cancel"
        ? "Checkout canceled. You can subscribe when ready."
        : "";

  return (
    <main className="shell" id="main-content">
      <nav className="nav">
        <Link className="brand" href="/family">
          <span className="brand-mark">$</span>
          <span>Family billing</span>
        </Link>
        <div className="row">
          <SessionIdentityBadge user={parent} />
          <Link className="button secondary" href="/family">
            Family home
          </Link>
          <LogoutButton />
        </div>
      </nav>

      {checkoutNote ? <div className="message success panel">{checkoutNote}</div> : null}

      {!billing?.hasAccess ? (
        <section className="panel">
          <h1>{billing?.pendingCheckout ? "Add your card to start the trial" : "Subscription required"}</h1>
          <p className="hero-copy">
            {billing?.pendingCheckout
              ? "Complete Stripe checkout to begin your free trial. Your card is saved but not charged until the trial ends. Cancel anytime before then."
              : billing?.trialDaysLeft === 0
                ? "Your trial has ended or payment is overdue. Subscribe below to restore access."
                : "Your family does not have an active plan. Subscribe below to restore access."}
          </p>
        </section>
      ) : null}

      <FamilyBillingPanel
        billing={billing}
        subscription={subscription}
        stripeEnabled={isStripeConfigured()}
        yearlyDiscountPercent={getYearlyDiscountPercent()}
      />

      <SiteFooter />
    </main>
  );
}
