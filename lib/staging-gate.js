import { shouldUseSecureCookie } from "./session-cookie.js";

export const STAGING_GATE_COOKIE = "staging_gate_ok";
export const STAGING_GATE_COOKIE_VALUE = "1";
export const STAGING_GATE_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

export function isStagingGateEnabled() {
  return (
    String(process.env.APP_ENV || "").trim().toLowerCase() === "staging" &&
    String(process.env.STAGING_GATE_PASSWORD || "").trim().length > 0
  );
}

export function stagingGateUsername() {
  const value = String(process.env.STAGING_GATE_USER || "tester").trim();
  return value || "tester";
}

export function isStagingGatePathAllowed(pathname) {
  if (pathname === "/staging-gate" || pathname === "/api/staging-gate") {
    return true;
  }
  // Auth APIs must stay reachable behind the gate (mobile clients, forgot-password, etc.).
  if (pathname.startsWith("/api/auth/")) {
    return true;
  }
  if (pathname === "/api/health" || pathname === "/api/billing/webhook") {
    return true;
  }
  if (pathname === "/terms" || pathname.startsWith("/legal/")) {
    return true;
  }
  if (pathname.startsWith("/_next")) {
    return true;
  }
  if (pathname === "/favicon.ico") {
    return true;
  }
  if (/\.(svg|png|jpg|jpeg|gif|webp|ico)$/i.test(pathname)) {
    return true;
  }
  return false;
}

export function hasValidStagingGateCookie(request) {
  return request.cookies.get(STAGING_GATE_COOKIE)?.value === STAGING_GATE_COOKIE_VALUE;
}

export function getStagingGateCookieOptions(request) {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: shouldUseSecureCookie(request),
    path: "/",
    maxAge: STAGING_GATE_MAX_AGE_SECONDS,
  };
}

export function credentialsMatchStagingGate(username, password) {
  const expectedUser = stagingGateUsername();
  const expectedPassword = String(process.env.STAGING_GATE_PASSWORD || "").trim();
  return (
    String(username || "").trim() === expectedUser &&
    String(password || "") === expectedPassword
  );
}
