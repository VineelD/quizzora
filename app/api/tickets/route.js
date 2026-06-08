import { NextResponse } from "next/server";
import { requireApiSession } from "../../../lib/auth.js";
import { createTicket, listTicketsForUser, serializeTicketForClient } from "../../../lib/tickets.js";

export const runtime = "nodejs";

const TICKET_USER_ROLES = ["admin", "teacher", "student", "parent"];

export async function GET() {
  const auth = await requireApiSession(TICKET_USER_ROLES, { skipBilling: true });
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const tickets = listTicketsForUser(auth.user.id).map(serializeTicketForClient);
  return NextResponse.json({ tickets });
}

export async function POST(request) {
  const auth = await requireApiSession(TICKET_USER_ROLES, { skipBilling: true });
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const body = await request.json();
    const ticket = createTicket({
      user: auth.user,
      subject: body.subject,
      body: body.body,
      category: body.category,
      priority: body.priority,
    });
    return NextResponse.json({ ticket: serializeTicketForClient(ticket) }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
