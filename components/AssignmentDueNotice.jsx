import { canSubmitBeforeDue, formatDueLabel, isPastDue } from "../lib/dates.js";

export default function AssignmentDueNotice({ assignment }) {
  if (!assignment?.due_at) {
    return null;
  }

  const pastDue = isPastDue(assignment.due_at);
  const canSubmit = canSubmitBeforeDue({
    dueAt: assignment.due_at,
    allowLate: assignment.allow_late !== 0,
  });

  return (
    <div className={`message ${pastDue && !canSubmit ? "error" : pastDue ? "warning" : ""}`}>
      <strong>Due {formatDueLabel(assignment.due_at)}</strong>
      {pastDue && !canSubmit ? (
        <p>This assignment is past its due date and late submissions are not allowed.</p>
      ) : pastDue ? (
        <p>Past due — you may still submit because your school allows late work.</p>
      ) : (
        <p>Submit before the due time shown above.</p>
      )}
    </div>
  );
}
