import Link from "next/link";

export default function SubscriptionBanner({ subscription, billingHref = "/subscription-required", tenantLabel = "school" }) {
  if (!subscription) {
    return null;
  }

  const { billing, limits, usage, canGenerateAi, canAddStudent } = subscription;
  const warnings = [];

  if (!billing.hasAccess) {
    return (
      <section className="panel message warning">
        <h2>Subscription required</h2>
        <p>
          Your {tenantLabel}&apos;s trial has ended or payment is overdue.{" "}
          {tenantLabel === "family" ? "Renew billing to restore access." : "Ask your school administrator to renew billing."}
        </p>
        <Link className="button secondary" href={billingHref}>
          {tenantLabel === "family" ? "Open billing" : "Learn more"}
        </Link>
      </section>
    );
  }

  if (billing.isTrialing && billing.trialDaysLeft <= 3) {
    warnings.push(`Trial ends in ${billing.trialDaysLeft} day${billing.trialDaysLeft === 1 ? "" : "s"}.`);
  }

  if (!canGenerateAi && limits.maxAiQuizzesPerMonth > 0) {
    warnings.push(
      `AI quiz limit reached for ${usage.monthKey} (${usage.aiQuizzesThisMonth}/${limits.maxAiQuizzesPerMonth}). Reuse quizzes from your library.`,
    );
  } else if (subscription.aiRemaining != null && subscription.aiRemaining <= 3) {
    warnings.push(`${subscription.aiRemaining} AI quiz${subscription.aiRemaining === 1 ? "" : "es"} left this month.`);
  }

  if (!canAddStudent && limits.maxStudents > 0) {
    warnings.push(`Student cap reached (${usage.students}/${limits.maxStudents}).`);
  }

  if (warnings.length === 0) {
    return null;
  }

  return (
    <section className="panel message warning">
      {warnings.map((text) => (
        <p key={text}>{text}</p>
      ))}
      <p className="muted">Plan: {limits.planName}</p>
    </section>
  );
}
