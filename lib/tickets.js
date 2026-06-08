import { logAudit } from "./audit.js";
import { getDb, getSchoolById, getUserById } from "./db.js";
import { getFamilyById } from "./families.js";
import { isSupportRole, SUPPORT_ROLE } from "./support.js";

const SUPER_ADMIN_ROLE = "superadmin";

export const TICKET_STATUSES = ["open", "in_progress", "resolved", "closed"];
export const TICKET_CATEGORIES = ["access", "billing", "technical", "other"];
export const TICKET_PRIORITIES = ["normal", "urgent"];

export function isSupportStaff(user) {
  return isSupportRole(user) || user?.role === SUPER_ADMIN_ROLE;
}

function mapTicketRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: Number(row.id),
    schoolId: row.school_id != null ? Number(row.school_id) : null,
    schoolName: row.school_name || null,
    familyId: row.family_id != null ? Number(row.family_id) : null,
    familyName: row.family_name || null,
    familyJoinCode: row.family_join_code || null,
    createdByUserId: Number(row.created_by_user_id),
    createdByName: row.created_by_name || null,
    createdByEmail: row.created_by_email || null,
    createdByRole: row.created_by_role || null,
    subject: row.subject,
    category: row.category,
    status: row.status,
    priority: row.priority,
    assignedToUserId: row.assigned_to_user_id != null ? Number(row.assigned_to_user_id) : null,
    assignedToName: row.assigned_to_name || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    resolvedAt: row.resolved_at,
    messageCount: row.message_count != null ? Number(row.message_count) : undefined,
    lastMessageAt: row.last_message_at || null,
  };
}

function mapMessageRow(row) {
  return {
    id: Number(row.id),
    ticketId: Number(row.ticket_id),
    authorUserId: Number(row.author_user_id),
    authorName: row.author_name,
    authorRole: row.author_role,
    body: row.body,
    createdAt: row.created_at,
    isStaffReply: row.author_role === SUPPORT_ROLE || row.author_role === SUPER_ADMIN_ROLE,
  };
}

function ticketSelectSql() {
  return `
    SELECT
      t.*,
      s.name AS school_name,
      f.name AS family_name,
      f.join_code AS family_join_code,
      creator.name AS created_by_name,
      creator.email AS created_by_email,
      creator.role AS created_by_role,
      assignee.name AS assigned_to_name,
      (
        SELECT COUNT(*)
        FROM support_ticket_messages m
        WHERE m.ticket_id = t.id
      ) AS message_count,
      (
        SELECT MAX(m.created_at)
        FROM support_ticket_messages m
        WHERE m.ticket_id = t.id
      ) AS last_message_at
    FROM support_tickets t
    LEFT JOIN schools s ON s.id = t.school_id
    LEFT JOIN families f ON f.id = t.family_id
    JOIN users creator ON creator.id = t.created_by_user_id
    LEFT JOIN users assignee ON assignee.id = t.assigned_to_user_id
  `;
}

export function createTicket({ user, subject, body, category = "other", priority = "normal" }) {
  const cleanSubject = String(subject || "").trim();
  const cleanBody = String(body || "").trim();
  const cleanCategory = TICKET_CATEGORIES.includes(category) ? category : "other";
  const cleanPriority = TICKET_PRIORITIES.includes(priority) ? priority : "normal";

  if (!cleanSubject || cleanSubject.length < 4) {
    throw new Error("Enter a subject with at least 4 characters.");
  }
  if (!cleanBody || cleanBody.length < 10) {
    throw new Error("Describe the issue in at least 10 characters.");
  }

  const db = getDb();
  const insert = db
    .prepare(
      `
      INSERT INTO support_tickets (
        school_id, family_id, created_by_user_id, subject, category, status, priority
      )
      VALUES (?, ?, ?, ?, ?, 'open', ?)
    `,
    )
    .run(user.school_id ?? null, user.family_id ?? null, user.id, cleanSubject, cleanCategory, cleanPriority);

  const ticketId = Number(insert.lastInsertRowid);
  db.prepare(
    `
    INSERT INTO support_ticket_messages (ticket_id, author_user_id, body)
    VALUES (?, ?, ?)
  `,
  ).run(ticketId, user.id, cleanBody);

  logAudit({
    actorId: user.id,
    actorRole: user.role,
    action: "ticket.created",
    entityType: "support_ticket",
    entityId: ticketId,
    summary: cleanSubject,
    metadata: { category: cleanCategory, priority: cleanPriority },
  });

  return getTicketById(ticketId, { user });
}

export function listTicketsForUser(userId) {
  const rows = getDb()
    .prepare(
      `
      ${ticketSelectSql()}
      WHERE t.created_by_user_id = ?
      ORDER BY t.updated_at DESC, t.id DESC
    `,
    )
    .all(Number(userId));

  return rows.map(mapTicketRow);
}

export function listTicketsForSupport({ status = null, schoolId = null, search = "", priority = null } = {}) {
  const clauses = ["1 = 1"];
  const params = [];

  if (status && TICKET_STATUSES.includes(status)) {
    clauses.push("t.status = ?");
    params.push(status);
  }

  if (priority && TICKET_PRIORITIES.includes(priority)) {
    clauses.push("t.priority = ?");
    params.push(priority);
  }

  if (schoolId != null && Number.isFinite(Number(schoolId))) {
    clauses.push("t.school_id = ?");
    params.push(Number(schoolId));
  }

  const term = String(search || "").trim().toLowerCase();
  if (term) {
    clauses.push(
      "(lower(t.subject) LIKE ? OR lower(creator.name) LIKE ? OR lower(creator.email) LIKE ? OR lower(s.name) LIKE ?)",
    );
    const pattern = `%${term}%`;
    params.push(pattern, pattern, pattern, pattern);
  }

  const rows = getDb()
    .prepare(
      `
      ${ticketSelectSql()}
      WHERE ${clauses.join(" AND ")}
      ORDER BY
        CASE t.priority WHEN 'urgent' THEN 0 ELSE 1 END,
        CASE t.status WHEN 'open' THEN 0 WHEN 'in_progress' THEN 1 WHEN 'resolved' THEN 2 ELSE 3 END,
        t.updated_at DESC
      LIMIT 200
    `,
    )
    .all(...params);

  return rows.map(mapTicketRow);
}

export function getTicketMessages(ticketId) {
  const rows = getDb()
    .prepare(
      `
      SELECT
        m.*,
        u.name AS author_name,
        u.role AS author_role
      FROM support_ticket_messages m
      JOIN users u ON u.id = m.author_user_id
      WHERE m.ticket_id = ?
      ORDER BY m.created_at ASC, m.id ASC
    `,
    )
    .all(Number(ticketId));

  return rows.map(mapMessageRow);
}

export function canAccessTicket(ticket, user) {
  if (!ticket || !user) {
    return false;
  }
  if (isSupportStaff(user)) {
    return true;
  }
  return Number(ticket.createdByUserId) === Number(user.id);
}

function loadTicketRow(ticketId) {
  return getDb()
    .prepare(
      `
      ${ticketSelectSql()}
      WHERE t.id = ?
    `,
    )
    .get(Number(ticketId));
}

export function resolveTicketAccess(ticketId, user) {
  const ticket = mapTicketRow(loadTicketRow(ticketId));
  if (!ticket) {
    return { status: "not_found", ticket: null };
  }
  if (user && !canAccessTicket(ticket, user)) {
    return { status: "forbidden", ticket: null };
  }

  return {
    status: "ok",
    ticket: {
      ...ticket,
      messages: getTicketMessages(ticket.id),
    },
  };
}

export function getTicketById(ticketId, { user = null } = {}) {
  const access = resolveTicketAccess(ticketId, user);
  return access.status === "ok" ? access.ticket : null;
}

export function addTicketMessage({ ticketId, user, body }) {
  const cleanBody = String(body || "").trim();
  if (!cleanBody || cleanBody.length < 2) {
    throw new Error("Enter a reply with at least 2 characters.");
  }

  const ticket = getTicketById(ticketId);
  if (!ticket) {
    throw new Error("Ticket not found.");
  }
  if (!canAccessTicket(ticket, user)) {
    throw new Error("Forbidden.");
  }
  if (!isSupportStaff(user) && ["resolved", "closed"].includes(ticket.status)) {
    throw new Error("This ticket is closed. Open a new ticket if you still need help.");
  }

  getDb()
    .prepare(
      `
      INSERT INTO support_ticket_messages (ticket_id, author_user_id, body)
      VALUES (?, ?, ?)
    `,
    )
    .run(Number(ticketId), user.id, cleanBody);

  const nextStatus = isSupportStaff(user) && ticket.status === "open" ? "in_progress" : ticket.status;

  getDb()
    .prepare(
      `
      UPDATE support_tickets
      SET status = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
    )
    .run(nextStatus, Number(ticketId));

  logAudit({
    actorId: user.id,
    actorRole: user.role,
    action: "ticket.replied",
    entityType: "support_ticket",
    entityId: ticketId,
    summary: ticket.subject,
  });

  return getTicketById(ticketId, { user });
}

export function updateTicket({ ticketId, user, status, assignedToUserId = undefined, priority = undefined }) {
  if (!isSupportStaff(user)) {
    throw new Error("Only support staff can update tickets.");
  }

  const ticket = getTicketById(ticketId);
  if (!ticket) {
    throw new Error("Ticket not found.");
  }

  const nextStatus = status && TICKET_STATUSES.includes(status) ? status : ticket.status;
  const nextPriority = priority && TICKET_PRIORITIES.includes(priority) ? priority : ticket.priority;
  let nextAssignee =
    assignedToUserId === undefined ? ticket.assignedToUserId : assignedToUserId == null ? null : Number(assignedToUserId);

  if (nextAssignee != null) {
    const assignee = getUserById(nextAssignee);
    if (!assignee || !isSupportStaff(assignee)) {
      throw new Error("Assign tickets to a support or super admin account.");
    }
  }

  const resolvedAt =
    nextStatus === "resolved" || nextStatus === "closed"
      ? ticket.resolvedAt || new Date().toISOString()
      : null;

  getDb()
    .prepare(
      `
      UPDATE support_tickets
      SET
        status = ?,
        priority = ?,
        assigned_to_user_id = ?,
        resolved_at = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
    )
    .run(nextStatus, nextPriority, nextAssignee, resolvedAt, Number(ticketId));

  logAudit({
    actorId: user.id,
    actorRole: user.role,
    action: "ticket.updated",
    entityType: "support_ticket",
    entityId: ticketId,
    summary: ticket.subject,
    metadata: { status: nextStatus, priority: nextPriority, assignedToUserId: nextAssignee },
  });

  return getTicketById(ticketId, { user });
}

export function getTicketStatsForSupport() {
  const rows = getDb()
    .prepare(
      `
      SELECT status, COUNT(*) AS count
      FROM support_tickets
      GROUP BY status
    `,
    )
    .all();

  const stats = { open: 0, in_progress: 0, resolved: 0, closed: 0, total: 0 };
  for (const row of rows) {
    stats[row.status] = Number(row.count);
    stats.total += Number(row.count);
  }
  return stats;
}

export function serializeTicketForClient(ticket) {
  if (!ticket) {
    return null;
  }

  const school = ticket.schoolId ? getSchoolById(ticket.schoolId) : null;
  const family = ticket.familyId ? getFamilyById(ticket.familyId) : null;
  return {
    ...ticket,
    schoolJoinCode: school?.join_code || null,
    familyJoinCode: family?.join_code || ticket.familyJoinCode || null,
    familyName: family?.name || ticket.familyName || null,
  };
}
