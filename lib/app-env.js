export function isStagingEnvironment() {
  return String(process.env.APP_ENV || "").trim().toLowerCase() === "staging";
}

export function stagingLabel() {
  return process.env.APP_STAGING_LABEL?.trim() || "Test environment";
}
