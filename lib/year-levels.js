export const YEAR_LEVELS = ["Year 7", "Year 8", "Year 9", "Year 10", "Year 11", "Year 12"];

export const DEFAULT_YEAR_LEVEL = "Year 7";

export function isValidYearLevel(value) {
  return YEAR_LEVELS.includes(String(value || "").trim());
}

export function normalizeYearLevel(value) {
  const clean = String(value || DEFAULT_YEAR_LEVEL).trim();
  return isValidYearLevel(clean) ? clean : DEFAULT_YEAR_LEVEL;
}

export function classNameForYearLevel(yearLevel) {
  return `${normalizeYearLevel(yearLevel)} Classes`;
}
