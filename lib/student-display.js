const INTERNAL_TOPIC_PREVIEW = /\s*\(\+\d+\s+more\)\s*$/i;

/**
 * Strip internal multi-subtopic preview suffixes from focus labels.
 */
export function stripInternalTopicPreview(text) {
  return String(text || "")
    .replace(INTERNAL_TOPIC_PREVIEW, "")
    .trim();
}

/**
 * Focus string safe for student-facing UI and exports.
 * When the stored focus is an internal preview (e.g. "A; B (+23 more)"),
 * show the assignment title instead.
 */
export function studentFacingFocus(focus, assignmentTitle = "") {
  const raw = String(focus || "").trim();
  if (!raw) {
    return String(assignmentTitle || "").trim();
  }

  if (INTERNAL_TOPIC_PREVIEW.test(raw)) {
    const title = String(assignmentTitle || "").trim();
    if (title) {
      return title;
    }
    return stripInternalTopicPreview(raw);
  }

  return raw;
}

export function studentFacingBreadcrumbParts({ yearLevel, subject, focus, assignmentTitle = "" } = {}) {
  const displayFocus = studentFacingFocus(focus, assignmentTitle);
  return [yearLevel, subject, displayFocus].map((part) => String(part || "").trim()).filter(Boolean);
}

export function studentFacingBreadcrumb(context = {}) {
  return studentFacingBreadcrumbParts(context).join(" · ");
}
