function formatCap(used, max) {
  if (!max || max <= 0) {
    return `${used} (unlimited)`;
  }
  return `${used} / ${max}`;
}

function Meter({ label, used, max, remaining }) {
  const unlimited = !max || max <= 0;
  const percent = unlimited ? 0 : Math.min(100, Math.round((used / max) * 100));

  return (
    <div className="usage-meter">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <strong>{label}</strong>
        <span className="muted">{formatCap(used, max)}</span>
      </div>
      {!unlimited ? (
        <div className="usage-bar" aria-hidden="true">
          <span style={{ width: `${percent}%` }} />
        </div>
      ) : null}
      {remaining != null && remaining <= 3 ? (
        <p className="muted">{remaining} remaining on your current plan.</p>
      ) : null}
    </div>
  );
}

export default function UsageMeters({ subscription }) {
  if (!subscription) {
    return null;
  }

  const { limits, usage, planKey } = subscription;

  return (
    <div className="usage-meters panel nested">
      <p className="eyebrow">Plan usage</p>
      <h3>{limits.planName}</h3>
      <p className="muted">
        {planKey === "trial"
          ? "Trial limits apply until you subscribe."
          : planKey === "paid"
            ? "Paid plan limits for your school."
            : "Subscribe to restore access."}
      </p>
      <Meter
        label="Teachers"
        max={limits.maxTeachers}
        remaining={subscription.teachersRemaining}
        used={usage.teachers}
      />
      <Meter
        label="Students"
        max={limits.maxStudents}
        remaining={subscription.studentsRemaining}
        used={usage.students}
      />
      <Meter
        label={`AI quizzes (${usage.monthKey})`}
        max={limits.maxAiQuizzesPerMonth}
        remaining={subscription.aiRemaining}
        used={usage.aiQuizzesThisMonth}
      />
    </div>
  );
}
