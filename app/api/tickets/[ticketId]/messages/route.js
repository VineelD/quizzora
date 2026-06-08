import { NextResponse } from "next/server";
import { isPlatformOperator, requireApiSession } from "../../../../../lib/auth.js";
import { addTicketMessage, resolveTicketAccess, serializeTicketForClient } from "../../../../../lib/tickets.js";

export const runtime = "nodejs";

const TICKET_USER_ROLES = ["admin", "teacher", "student", "parent"];

async function authorizeTicketAccess(ticketId) {
  const platformAuth = await requireApiSession(null, { skipBilling: true });
  if (!platformAuth.error && isPlatformOperator(platformAuth.user)) {
    const access = resolveTicketAccess(Number(ticketId), platformAuth.user);
    if (access.status === "not_found") {
      return { error: "Ticket not found.", status: 404 };
    }
    return { user: platformAuth.user, ticket: access.ticket };
  }

  const auth = await requireApiSession(TICKET_USER_ROLES, { skipBilling: true });
  if (auth.error) {
    return auth;
  }

  const access = resolveTicketAccess(Number(ticketId), auth.user);
  if (access.status === "not_found") {
    return { error: "Ticket not found.", status: 404 };
  }
  if (access.status === "forbidden") {
    return { error: "Forbidden.", status: 403 };
  }

  return { user: auth.user, ticket: access.ticket };
}

export async function POST(request, { params }) {
  const { ticketId } = await params;
  const auth = await authorizeTicketAccess(ticketId);
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const body = await request.json();
    const ticket = addTicketMessage({
      ticketId: Number(ticketId),
      user: auth.user,
      body: body.body,
    });
    return NextResponse.json({ ticket: serializeTicketForClient(ticket) });
  } catch (error) {
    const status = error.message === "Forbidden." ? 403 : 400;
    return NextResponse.json({ error: error.message }, { status });
  }
}
