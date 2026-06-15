/**
 * Onyx File connector filename slugs — must match scripts/prepare-curriculum-file-connector.mjs
 * Export layout: <year>/<subject>/<subtopic>/full-doc.md → year-7-science-cells.md
 */

export function slugifyOnyxPathSegment(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function buildCurriculumOnyxFilename({ yearLevel, subject, subtopic, suffix = null }) {
  const parts = [yearLevel, subject, subtopic].map(slugifyOnyxPathSegment).filter(Boolean);
  const base = parts.join("-");
  if (!base) {
    return null;
  }
  const slug = suffix != null && suffix > 1 ? `${base}-${suffix}` : base;
  return `${slug}.md`;
}

export function buildCurriculumOnyxFileSlug({ yearLevel, subject, subtopic, suffix = null }) {
  const filename = buildCurriculumOnyxFilename({ yearLevel, subject, subtopic, suffix });
  return filename ? filename.replace(/\.md$/, "") : null;
}

/** Filename prefix for all subtopics in a year + subject, e.g. year-7-mathematics- */
export function buildCurriculumOnyxYearSubjectPrefix({ yearLevel, subject }) {
  const parts = [yearLevel, subject].map(slugifyOnyxPathSegment).filter(Boolean);
  if (!parts.length) {
    return null;
  }
  return `${parts.join("-")}-`;
}
