export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 8;

function normalizeHost(value) {
  return String(value || "")
    .split(":")[0]
    .trim()
    .toLowerCase();
}

function appBaseHostname() {
  try {
    return normalizeHost(new URL(process.env.APP_BASE_URL || "").hostname);
  } catch {
    return "";
  }
}

function appBaseIsHttps() {
  try {
    return new URL(process.env.APP_BASE_URL || "").protocol === "https:";
  } catch {
    return false;
  }
}

function cloudflareVisitorScheme(request) {
  const raw = request.headers.get("cf-visitor");
  if (!raw) {
    return "";
  }

  try {
    const parsed = JSON.parse(raw);
    return String(parsed?.scheme || "").toLowerCase();
  } catch {
    return "";
  }
}

/**
 * True when the browser request arrived over HTTPS (via proxy headers or URL).
 */
export function isRequestSecure(request) {
  if (!request) {
    return false;
  }

  const requestHost = normalizeHost(request.headers.get("x-forwarded-host") || request.headers.get("host"));
  const publicHost = appBaseHostname();

  // IIS/Cloudflare rewrite to localhost often sends x-forwarded-proto: http even
  // though the browser used HTTPS. Trust the public host when APP_BASE_URL is HTTPS.
  if (appBaseIsHttps() && requestHost && publicHost && requestHost === publicHost) {
    return true;
  }

  const forwardedProto = request.headers.get("x-forwarded-proto");
  if (forwardedProto) {
    return forwardedProto.split(",")[0].trim().toLowerCase() === "https";
  }

  if (cloudflareVisitorScheme(request) === "https") {
    return true;
  }

  if (request.headers.get("x-forwarded-ssl")?.toLowerCase() === "on") {
    return true;
  }

  try {
    if (new URL(request.url).protocol === "https:") {
      return true;
    }
  } catch {
    // Fall through.
  }

  return false;
}

/**
 * Only mark cookies Secure when the client connection is HTTPS.
 * AUTH_COOKIE_SECURE=false disables Secure entirely (local HTTP testing).
 */
export function shouldUseSecureCookie(request) {
  const setting = String(process.env.AUTH_COOKIE_SECURE || "")
    .trim()
    .toLowerCase();

  if (setting === "false") {
    return false;
  }

  if (setting === "true" && appBaseIsHttps()) {
    return true;
  }

  return isRequestSecure(request);
}

export function getSessionCookieOptions(request) {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: shouldUseSecureCookie(request),
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  };
}

/** Match login cookie attributes so browsers actually remove the session on logout. */
export function getClearSessionCookieOptions(request) {
  return {
    ...getSessionCookieOptions(request),
    maxAge: 0,
    expires: new Date(0),
  };
}

/** Build a request-like object from Next.js server headers (Server Actions / RSC). */
export function createRequestFromHeaders(headerList) {
  const host = headerList.get("host") || "";
  const forwardedProto = headerList.get("x-forwarded-proto");
  let proto = forwardedProto?.split(",")[0]?.trim().toLowerCase();

  if (!proto) {
    const requestHost = normalizeHost(headerList.get("x-forwarded-host") || host);
    const publicHost = appBaseHostname();
    if (appBaseIsHttps() && requestHost && publicHost && requestHost === publicHost) {
      proto = "https";
    } else if (cloudflareVisitorScheme({ headers: headerList }) === "https") {
      proto = "https";
    } else {
      proto = "http";
    }
  }

  return {
    headers: headerList,
    url: `${proto}://${host}/`,
  };
}
