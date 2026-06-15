import { NextResponse } from "next/server";
import { getDb } from "../../../lib/db.js";
import { isMaintenanceModeEnabled } from "../../../lib/maintenance-mode.js";
import { getProductionReadiness } from "../../../lib/production.js";

export const runtime = "nodejs";

export async function GET() {
  const readiness = getProductionReadiness();
  let database = false;

  try {
    getDb().prepare("SELECT 1 AS ok").get();
    database = true;
  } catch {
    database = false;
  }

  const healthy = database && readiness.authSecret.ok;
  const maintenance = isMaintenanceModeEnabled();

  return NextResponse.json(
    {
      status: healthy ? (maintenance ? "maintenance" : "ok") : "degraded",
      maintenance,
      timestamp: new Date().toISOString(),
      database,
      ...readiness,
    },
    { status: healthy ? 200 : 503 },
  );
}
