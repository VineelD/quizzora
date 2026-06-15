export function isMaintenanceModeEnabled() {
  const value = String(process.env.MAINTENANCE_MODE || "").trim().toLowerCase();
  return value === "true" || value === "1" || value === "yes";
}

export function maintenanceBypassSecret() {
  return String(process.env.MAINTENANCE_BYPASS_SECRET || "").trim();
}

export function hasMaintenanceBypass(request) {
  const secret = maintenanceBypassSecret();
  if (!secret) {
    return false;
  }
  return request.cookies.get("maintenance_bypass")?.value === secret;
}

export function isMaintenancePathAllowed(pathname) {
  if (pathname === "/maintenance" || pathname === "/api/maintenance-bypass") {
    return true;
  }
  if (pathname === "/api/health" || pathname === "/api/billing/webhook") {
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
