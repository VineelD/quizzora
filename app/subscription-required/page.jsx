import Link from "next/link";
import { requireSession } from "../../lib/auth.js";
import { getSchoolBilling } from "../../lib/billing.js";

export default async function SubscriptionRequiredPage() {
  const user = await requireSession(null, { skipBilling: true });
  const billing = user.school_id ? getSchoolBilling(user.school_id) : null;

  return (
    <main className="shell" id="main-content">
      <section className="panel">
        <p className="eyebrow">Subscription</p>
        <h1>Access paused</h1>
        <p className="hero-copy">
          {user.role === "teacher"
            ? "Your school’s subscription is not active. Contact your school administrator to renew billing."
            : "Your school’s subscription is not active. Ask your teacher or school office to renew."}
        </p>
        {billing?.trialEndsAt ? (
          <p className="muted">Trial ended {new Date(billing.trialEndsAt).toLocaleDateString("en-AU")}.</p>
        ) : null}
        {user.role === "admin" ? (
          <Link className="button primary" href="/admin/billing">
            Open billing
          </Link>
        ) : (
          <Link className="button secondary" href="/">
            Back to sign in
          </Link>
        )}
      </section>
    </main>
  );
}
