import { NextResponse } from "next/server";
import { requireApiSession } from "../../../../lib/auth.js";
import { listSupportStaff } from "../../../../lib/support.js";
import {
  getTicketStatsForSupport,
  isSupportStaff,
  listTicketsForSupport,
  serializeTicketForClient,
} from "../../../../lib/tickets.js";

export const runtime = "nodejs";

export async function GET(request) {
  const auth = await requireApiSession(null, { skipBilling: true });
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  if (!isSupportStaff(auth.user)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const tickets = listTicketsForSupport({
    status: searchParams.get("status") || null,
    schoolId: searchParams.get("schoolId") || null,
    search: searchParams.get("search") || "",
    priority: searchParams.get("priority") || null,
  }).map(serializeTicketForClient);

  return NextResponse.json({
    tickets,
    stats: getTicketStatsForSupport(),
    staff: listSupportStaff(),
  });
}
