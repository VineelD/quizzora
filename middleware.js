import { NextResponse } from "next/server";
import {
  hasValidStagingGateCookie,
  isStagingGateEnabled,
  isStagingGatePathAllowed,
} from "./lib/staging-gate.js";

function normalizeHostHeader(value) {
  return String(value || "")
    .split(",")[0]
    .split(":")[0]
    .trim()
    .toLowerCase();
}

function isLoopbackHost(host) {
  return !host || host === "localhost" || host === "127.0.0.1" || host.startsWith("127.");
}

function getRequestHost(request) {
  const hostHeader = normalizeHostHeader(request.headers.get("host"));
  const forwardedHost = normalizeHostHeader(request.headers.get("x-forwarded-host"));

  // Prefer the Host header the browser sent. x-forwarded-host may reflect an upstream
  // IIS/ARR site binding (e.g. quizzora.org) while Host is test.quizzora.org.
  if (hostHeader && !isLoopbackHost(hostHeader)) {
    return hostHeader;
  }

  if (forwardedHost) {
    return forwardedHost;
  }

  return normalizeHostHeader(request.nextUrl.hostname);
}

function applySecurityHeaders(response) {
  // Keep security headers centralized so they apply to redirects and normal responses.
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "SAMEORIGIN");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");

  // Disable most high-risk browser features by default.
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(self), geolocation=(), payment=()"
  );

  const isProd = process.env.NODE_ENV === "production";
  if (isProd) {
    // If you're behind Cloudflare and/or IIS, they may also set HSTS; this is a safe baseline.
    response.headers.set(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains"
    );

    // PCI scope doesn't require CSP, but Stripe recommends allowing their hosted endpoints.
    // Use Report-Only to avoid breaking Next.js rendering while you tune CSP.
    response.headers.set(
      "Content-Security-Policy-Report-Only",
      [
        "default-src 'self'",
        "base-uri 'self'",
        "frame-ancestors 'none'",
        // Stripe-hosted Checkout endpoints.
        "connect-src 'self' https://checkout.stripe.com https://api.stripe.com https://maps.googleapis.com",
        "frame-src 'self' https://checkout.stripe.com https://js.stripe.com https://*.js.stripe.com",
        "script-src 'self' 'unsafe-inline' https://checkout.stripe.com https://js.stripe.com https://*.js.stripe.com https://static.cloudflareinsights.com",
        "img-src 'self' https://*.stripe.com data:",
        "style-src 'self' 'unsafe-inline'",
      ].join("; ")
    );
  }

  return response;
}

/**
 * Redirect only when the public hostname differs from APP_BASE_URL.
 * Uses the Host header (not nextUrl.hostname) so IIS/Cloudflare proxying to
 * 127.0.0.1 does not cause a redirect loop to the same URL.
 */
function checkStagingGate(request) {
  if (!isStagingGateEnabled()) {
    return null;
  }

  const pathname = request.nextUrl.pathname;
  if (isStagingGatePathAllowed(pathname) || hasValidStagingGateCookie(request)) {
    return null;
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      { error: "Staging gate required. Sign in at /staging-gate first." },
      { status: 403 },
    );
  }

  const gateUrl = new URL("/staging-gate", request.url);
  const returnPath = `${pathname}${request.nextUrl.search}`;
  if (returnPath && returnPath !== "/staging-gate") {
    gateUrl.searchParams.set("next", returnPath);
  }
  return NextResponse.redirect(gateUrl);
}

export function middleware(request) {
  const gateResponse = checkStagingGate(request);
  if (gateResponse) {
    return applySecurityHeaders(gateResponse);
  }

  const canonicalBase = String(process.env.APP_BASE_URL || "").trim();
  if (!canonicalBase) {
    return applySecurityHeaders(NextResponse.next());
  }

  let canonical;
  try {
    canonical = new URL(canonicalBase);
  } catch {
    return NextResponse.next();
  }

  const canonicalHost = canonical.hostname.toLowerCase();
  const clientHost = normalizeHostHeader(request.headers.get("host"));
  const forwardedHost = normalizeHostHeader(request.headers.get("x-forwarded-host"));

  // IIS/ARR rewrite leaves Host as loopback; the site binding already selected this app.
  if (isLoopbackHost(clientHost)) {
    return applySecurityHeaders(NextResponse.next());
  }

  const requestHost = getRequestHost(request);

  if (
    !requestHost ||
    requestHost === canonicalHost ||
    clientHost === canonicalHost ||
    forwardedHost === canonicalHost
  ) {
    return applySecurityHeaders(NextResponse.next());
  }

  const destination = new URL(`${request.nextUrl.pathname}${request.nextUrl.search}`, canonical);
  const destinationHost = destination.hostname.toLowerCase();
  if (
    destinationHost === clientHost ||
    destinationHost === forwardedHost ||
    destinationHost === requestHost
  ) {
    return applySecurityHeaders(NextResponse.next());
  }

  return applySecurityHeaders(NextResponse.redirect(destination, 308));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
