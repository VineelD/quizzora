import { NextResponse } from "next/server";
import { isPlatformOperator, requireApiSession } from "../../../../lib/auth.js";
import {
  isSupportStaff,
  resolveTicketAccess,
  serializeTicketForClient,
  updateTicket,
} from "../../../../lib/tickets.js";

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

export async function GET(_request, { params }) {
  const { ticketId } = await params;
  const auth = await authorizeTicketAccess(ticketId);
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  return NextResponse.json({ ticket: serializeTicketForClient(auth.ticket) });
}

export async function PATCH(request, { params }) {
  const { ticketId } = await params;
  const auth = await requireApiSession(null, { skipBilling: true });
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  if (!isSupportStaff(auth.user)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  try {
    const body = await request.json();
    const ticket = updateTicket({
      ticketId: Number(ticketId),
      user: auth.user,
      status: body.status,
      assignedToUserId: body.assignedToUserId,
      priority: body.priority,
    });
    return NextResponse.json({ ticket: serializeTicketForClient(ticket) });
  } catch (error) {
    const status = error.message === "Ticket not found." ? 404 : 400;
    return NextResponse.json({ error: error.message }, { status });
  }
}
