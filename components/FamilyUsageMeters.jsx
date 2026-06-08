export default function FamilyUsageMeters({ subscription }) {
  if (!subscription) {
    return null;
  }

  const { limits, usage, studentsRemaining, parentsRemaining, aiRemaining } = subscription;

  return (
    <div className="grid-3 compact-metrics">
      <div className="metric">
        <strong>{usage.students}</strong>
        <span>
          Students ({studentsRemaining == null ? "unlimited" : `${studentsRemaining} left`})
        </span>
      </div>
      <div className="metric">
        <strong>{usage.parents}</strong>
        <span>
          Parents ({parentsRemaining == null ? "unlimited" : `${parentsRemaining} left`})
        </span>
      </div>
      <div className="metric">
        <strong>{usage.aiQuizzesThisMonth}</strong>
        <span>
          AI quizzes this month ({aiRemaining == null ? "unlimited" : `${aiRemaining} left`})
        </span>
      </div>
      <p className="muted form-span-all">
        Plan: {limits.planName}
      </p>
    </div>
  );
}
