export function parseDueAt(value) {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error("Invalid due date.");
  }
  return date.toISOString();
}

export function formatDueLabel(dueAt) {
  if (!dueAt) {
    return "No due date";
  }
  const date = new Date(dueAt);
  if (Number.isNaN(date.getTime())) {
    return "No due date";
  }
  return date.toLocaleString("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function isPastDue(dueAt) {
  if (!dueAt) {
    return false;
  }
  return new Date(dueAt).getTime() < Date.now();
}

export function canSubmitBeforeDue({ dueAt, allowLate }) {
  if (!dueAt || allowLate) {
    return true;
  }
  return !isPastDue(dueAt);
}
