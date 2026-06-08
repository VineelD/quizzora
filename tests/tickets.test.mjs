import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";

const tempDir = mkdtempSync(join(tmpdir(), "littlecode-tickets-"));
process.env.SQLITE_DATABASE_PATH = join(tempDir, "tickets.sqlite");

const db = await import("../lib/db.js");
const tickets = await import("../lib/tickets.js");
const support = await import("../lib/support.js");

let schoolId;
let adminUser;
let teacherUser;
let supportUser;

before(() => {
  db.getDb();

  const { school, admin } = db.createSchoolWithAdmin({
    schoolName: "Ticket School",
    schoolSlug: "ticket-school",
    name: "Ticket Admin",
    email: "admin@ticket.test",
    password: "password12345",
  });
  schoolId = school.id;
  adminUser = admin;

  teacherUser = db.createTeacherAccount({
    schoolId,
    name: "Ticket Teacher",
    email: "teacher@ticket.test",
    password: "password12345",
  });

  supportUser = support.createSupportUser({
    name: "Desk Agent",
    email: "support@ticket.test",
    username: "support",
    password: "very-secure-password",
  });
});

after(() => {
  db.resetDatabaseForTests();
  rmSync(tempDir, { recursive: true, force: true });
});

test("school user can create and list own tickets", () => {
  const ticket = tickets.createTicket({
    user: { ...adminUser, school_id: schoolId },
    subject: "Billing page blocked",
    body: "Our trial ended and admins cannot open billing anymore.",
    category: "billing",
  });

  assert.equal(ticket.status, "open");
  assert.equal(ticket.createdByUserId, adminUser.id);
  assert.ok(ticket.messages.length >= 1);

  const mine = tickets.listTicketsForUser(adminUser.id);
  assert.equal(mine.length, 1);
  assert.equal(mine[0].subject, "Billing page blocked");
});

test("support staff can view queue, reply, and resolve tickets", () => {
  const created = tickets.createTicket({
    user: { ...teacherUser, school_id: schoolId },
    subject: "Student cannot submit",
    body: "One student sees a blank screen when submitting the quiz.",
    category: "technical",
    priority: "urgent",
  });

  const queue = tickets.listTicketsForSupport({ status: "open" });
  assert.ok(queue.some((item) => item.id === created.id));

  const replied = tickets.addTicketMessage({
    ticketId: created.id,
    user: supportUser,
    body: "Please share the student username and assignment title.",
  });
  assert.equal(replied.status, "in_progress");
  assert.ok(replied.messages.some((message) => message.body.includes("student username")));

  const resolved = tickets.updateTicket({
    ticketId: created.id,
    user: supportUser,
    status: "resolved",
    assignedToUserId: supportUser.id,
  });
  assert.equal(resolved.status, "resolved");
  assert.equal(resolved.assignedToUserId, supportUser.id);
});

test("users cannot read tickets they did not create", () => {
  const ticket = tickets.createTicket({
    user: { ...adminUser, school_id: schoolId },
    subject: "Private admin issue",
    body: "Only the admin should see this ticket details.",
    category: "other",
  });

  const forbidden = tickets.getTicketById(ticket.id, {
    user: { ...teacherUser, school_id: schoolId },
  });
  assert.equal(forbidden, null);

  const allowed = tickets.getTicketById(ticket.id, {
    user: { ...adminUser, school_id: schoolId },
  });
  assert.ok(allowed);
});
